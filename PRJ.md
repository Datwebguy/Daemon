# Technical Architecture – Daemon

Target network: **Monad Testnet, Chain ID 10143**.

## Network Facts (from Monad docs, 2026-10-18)

| Item | Value |
|---|---|
| Testnet status | Active; reset from genesis 2025-12-16; node v0.16.x |
| ERC-6551 registry | `0x000000006551c19487814612e58FE06813775758` (docs claim deployed) |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (docs claim) |
| EntryPoint v0.6 / v0.8 / v0.9 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` / `0x4337084d9e255fF0702461CF8895cE9E3b5Ff108` / `0x433709009B8330FDa32311DF1C2AFA402eD8D009` |
| Multicall3, Permit2, CreateX, Safe | Documented as canonical deployments |

All addresses are docs claims until confirmed with `eth_getCode` on 10143.

## Monad Constraints That Affect Contracts

- Sender is charged `gas_limit × gas_price`. Use tight gas limits on multicalls and on `compoundMany`.
- Cold account access 10,100 gas; cold storage 8,100 per 128-slot page; per-tx gas limit 30M; contract size limit 128 KB.
- Tx types 0, 1, 2, 4 supported; type 3 (blob) is not.
- `block.timestamp` has one-second granularity (3–4 blocks share a value). Order history by block number + log index.
- EIP-7702: 10 MON reserve rule and no CREATE/CREATE2 in delegated code → contract accounts only.
- `eth_getLogs` capped at 100–1,000 blocks → index events.

## Design Decisions

- **No session keys, no executor, no delegations, no custom validator.** Automation is permissionless.
- **Canonical ERC-6551 registry**; do not deploy a duplicate.
- **Account implementation**: either wrap the Tokenbound V3 account or write `DaemonAccount` natively. Tokenbound V3 targets EntryPoint v0.6. Because there are no session keys, 4337 is not required for the core flow; a paymaster is an optional UX layer only.
- **Ownership-cycle guard**: the account rejects ownership by itself (an NFT sent into its own account is stranded).
- **No admin over funds.** The only privileged action is adding adapters to the registry, behind a timelock, and it can never block exits.

## Contracts

| Contract | Role |
|---|---|
| `DaemonAccount` | Token-bound account: owner resolution, ERC-1271, `execute`, `multicall`, adapter allocation, `compound`, `sweepToOwner`, hype/mood/boost |
| `StrategyRegistry` | Immutable platform config + approved `IYieldSource` vaults, with per-Daemon caps; timelocked additions, no removals |
| `IYieldSource` | ERC-4626 subset + separate reward stream. The Daemon account holds vault shares itself; no adapter contract custodies funds. A wrapper for third-party ERC-4626 vaults can be added later. |
| Testnet yield sources (ours) | `StableVault` (low, steady rate) and `DegenVault` (high, variable rate): ERC-4626 vaults that stream rewards from a funded reward pool, so there is real harvestable yield on testnet |
| Swap + price (ours) | `MockRouter` (constant-product pool) and `MockOracle` (or Pyth if available on 10143) for the oracle-based minimum output |
| `DaemonHub` | Stateless helper: `compoundMany(accounts[])`, pays bounties to one caller |
| `TraitPolicyModule` | Reads on-chain traits for multipliers and mood bias |
| `MockChog` | `freeMint`, on-chain traits, dynamic `tokenURI` (SVG of mood, boost, last yield) |

## Core Interfaces

```solidity
// DaemonAccount
function owner() external view returns (address);
function execute(address target, uint256 value, bytes calldata data) external;   // owner only
function multicall(bytes[] calldata data) external;                              // owner only
function allocate(address source, uint256 assets) external;                      // owner only
function deallocate(address source, uint256 shares) external;                    // owner only
function compound() external;               // PUBLIC: registered adapters only, cooldown, min profit; pays bounty to caller
function sweepToOwner() external;           // owner only; exits all adapters
function hype() external payable;           // PUBLIC: anyone; MON goes to this Daemon's boost pot
function hypeWithChog(uint256 amount) external; // PUBLIC: anyone; $CHOG goes to the boost pot
function getMood() external view returns (uint8);
function getBoost() external view returns (uint256 multiplier, uint256 expiresAt, uint256 potBalance);
function pendingBounty() external view returns (uint256);

// IYieldSource (full interface: contracts/src/interfaces/IYieldSource.sol)
function deposit(uint256 amount) external;
function withdraw(uint256 amount) external returns (uint256);
function harvest() external returns (uint256 profit);
function balance(address account) external view returns (uint256);

// DaemonHub
function compoundMany(address[] calldata accounts) external;

// Events
event Compounded(uint256 indexed tokenId, address indexed caller, uint256 profit, uint256 bounty);
event DaemonUpdate(uint256 indexed tokenId, uint8 mood, string message, uint256 yieldAmount);
event Hyped(uint256 indexed tokenId, address indexed from, uint256 amount);
event BoostApplied(uint256 indexed tokenId, uint256 multiplier, uint256 expiresAt);
```

## Compounding

1. Anyone calls `compound()` (or `DaemonHub.compoundMany`).
2. Reverts if: cooldown not elapsed; pending profit < gas + bounty (min-profit threshold); any adapter not registered.
3. Harvest from each adapter; swap rewards only through a whitelisted router with an **oracle-based minimum output** (not caller-supplied); restake into the same adapters.
4. Pay the bounty to the caller: gas reimbursement + a share of profit. Share starts around 5% and rises with time since last compound, capped around 10%.
5. Harvested gains stream/unlock over a short window to blunt sandwich and flash-loan games (Yearn, Convex pattern).
6. Emit `Compounded` and `DaemonUpdate`.

Funds can only return to the same account; the caller can only receive the bounty.

## Hype and Boost

```solidity
enum Mood { Chill, Smug, Chaotic, Flexing, Tired }
uint8   lastMood;
uint256 boostExpires;
uint256 boostMultiplier;   // e.g. 1150 = 1.15x
uint256 boostPot;          // funded by hype payments
```

- `hype()` / `hypeWithChog()` are public. If the boost top-up swap fails (e.g. a shallow pool exceeds slippage), the top-up is skipped and the pot stays intact, so a hype can never block compounding. Payment (MON, or $CHOG via a separate entry) goes into `boostPot`.
- While the boost is active, harvested yield is topped up by the multiplier **from the pot**, until the pot is empty. No pot, no boost effect.
- Limits: per-hyper-per-Daemon cooldown, per-Daemon cooldown, and a maximum multiplier/duration.
- Mood from recent yield + one trait bias (+ optional Pyth volatility). Neglect decay moves it to Tired.
- Messages come from a small hardcoded pool keyed by mood + boost state. History lives in events.
- Unused pot is returned with `sweepToOwner()`.

## Off-Chain Components

| Component | Choice |
|---|---|
| Login | Privy (testnet subsidized; add Monad 10143 in dashboard) |
| Gas sponsorship | Optional: Pimlico paymaster (`monad-testnet`) |
| Keeper | Optional open-source reference script; anyone can run their own |
| Indexer | Envio or Goldsky; powers feed + leaderboard |
| Oracle / randomness | Pyth price feeds (pull-based: bundle updates), Pyth Entropy |
| RPC | Public `https://testnet-rpc.monad.xyz` for dev; paid provider for production use |

## Yield Integrations (Testnet)

Aave and Morpho are not available on testnet, so the testnet deployment is **self-contained**: we deploy our own yield sources, router and oracle.

- **StableVault and DegenVault**: our own ERC-4626 vaults. Rewards stream from a funded reward pool at different rates, so a harvest is real and the two sources behave differently (this drives mood and makes the adapter choice meaningful).
- **Yield-source interface**: any vault implementing `IYieldSource` can be registered. A generic wrapper for third-party ERC-4626 vaults can be added later without changing the account.
- **MockRouter + MockOracle**: a simple constant-product swap and a price source for the oracle-based minimum output. Swap to Pyth if it is live on 10143.
- **Staking**: Monad staking precompile `0x1000` or Yield.xyz native staking; unverified from a contract account. Optional.
- The reward pool must be funded and topped up by us; document its balance in the UI so judges see why yield exists.

## Work Breakdown

**Phase 1 – Foundation**
- Confirm registry with `eth_getCode`; choose Tokenbound V3 wrap vs native account
- `DaemonAccount` skeleton, ownership-cycle guard, `MockChog` + `freeMint`
- Frontend: Privy login, inspector
- Tests for address derivation and ownership

**Phase 2 – Yield + Compounding**
- `IYieldSource`, `StrategyRegistry`, `RewardVault`, `DegenVault`
- `compound()` with bounty, cooldown, min profit, oracle min-out, unlock window
- `DaemonHub.compoundMany`, `sweepToOwner`
- Deploy `StableVault`, `DegenVault`, `MockRouter`, `MockOracle`; fund the reward pool
- Full Foundry coverage

**Phase 3 – Personality + Social**
- Public hype, boost pot, mood, messages, neglect decay
- Dynamic `tokenURI`, share card
- Indexer, feed, leaderboard
- Reference keeper script
- UI polish, end-to-end demo, deployment scripts

## Open Verifications

1. `eth_getCode` on registry (and EntryPoints if using a paymaster) on 10143
2. Reward-pool sizing so yield lasts through judging (and who tops it up)
3. Staking precompile / Yield.xyz from a contract account
4. Oracle availability on testnet for the swap min-out (Pyth on 10143)
5. Tokenbound V3 wrap vs native account decision
6. Bounty parameters (start %, cap, rise rate) tuned with gas measurements

# Build Prompt – Daemon

You are building Daemon, a multi-user, decentralized yield manager for Chog NFTs on Monad Testnet (10143), using ERC-6551 accounts, pluggable yield adapters, permissionless incentivized compounding, and a social "Hype Your Daemon" personality layer.

There is **no executor, no session keys, no delegations and no admin over funds**. Nobody operates the platform on holders' behalf.

## Contracts to Implement

1. Use the canonical ERC-6551 registry (`0x000000006551c19487814612e58FE06813775758`). Do **not** write a new registry. Confirm it with `eth_getCode` first.
2. `DaemonAccount.sol` – token-bound account with:
   - dynamic owner(), ERC-1271, `execute`/`multicall` (owner only)
   - ownership-cycle guard
   - `allocate` / `deallocate` to adapters (owner only)
   - `compound()` – PUBLIC, bounded, pays a caller bounty
   - `sweepToOwner()` – owner only, exits all adapters
   - `hype()` / `hypeWithChog()` – PUBLIC, payment funds the boost pot
   - mood / boost / pot state
3. `StrategyRegistry.sol` – approved adapters with caps; timelocked additions; never blocks exits
4. `IYieldSource.sol` (ERC-4626 subset + reward stream; the account holds shares itself). Aave and Morpho are not on testnet, so deploy our own yield sources:
   - `StableVault` (low, steady rate) and `DegenVault` (high, variable rate): ERC-4626 vaults that stream rewards from a funded reward pool
   - `MockRouter` (constant-product swap) and `MockOracle` for the oracle-based minimum output (use Pyth if live on 10143)
   - `StakingAdapter` only if the staking precompile works from a contract account
5. `DaemonHub.sol` – stateless `compoundMany(accounts[])`
6. `TraitPolicyModule.sol` – reads on-chain traits for multipliers and mood bias
7. `MockChog.sol` – freeMint + on-chain traits + dynamic `tokenURI` (on-chain SVG showing mood, boost, last yield)
8. Decide Tokenbound V3 wrap vs native account (V3 targets EntryPoint v0.6). A paymaster is optional UX only.

## Frontend Components

- Global header with Privy login (or wallet connect) + network indicator + Mint Test Chog
- Chog Inspector (address, traits, balances, mood, latest message, boost pot)
- Strategy picker (adapters) with deposit / withdraw
- Compound button (shows the bounty the caller would earn)
- Hype button for **any** Daemon + boost countdown
- Message feed and leaderboard (from the indexer)
- Share Performance Card
- Emergency Sweep button

## Compounding Rules

Public `compound()`: cooldown, minimum profit (> gas + bounty), registered adapters only, oracle-based minimum output on swaps, gains unlock over a short window, funds return only to the same account. Bounty = gas reimbursement + a share of profit starting around 5%, rising with time since last compound, capped around 10%.

## Personality Rules

Moods: Chill / Smug / Chaotic / Flexing / Tired.  
Mood derives from recent yield + one trait bias (optionally Pyth volatility); neglect decays toward Tired.  
After compound or hype, emit a short message from a small pool keyed by mood + boost state.  
Anyone can hype any Daemon; payment goes to that Daemon's boost pot.  
Boost lasts 2–4 hours and tops up harvested yield by the multiplier **from the pot** until it is empty.  
Limits: per-hyper-per-Daemon cooldown, per-Daemon cooldown, max multiplier/duration.  
Frontend: avatar expression follows mood, speech bubble shows the latest message, share card is pure frontend.

## Off-Chain

- Indexer: Envio or Goldsky for `Compounded`, `DaemonUpdate`, `Hyped`, `BoostApplied`
- Pyth price feed (optional mood input / swap min-out) and Pyth Entropy (optional randomness)
- Optional open-source reference keeper (Node + viem) that calls `compoundMany`; anyone can run their own
- Optional Pimlico paymaster for sponsored gas

## Monad Constraints

- Gas is charged on the gas limit: use tight limits
- No EIP-7702 for user funds
- `block.timestamp` is 1-second granularity: order by block number + log index
- Public `eth_getLogs` is range-limited: use the indexer

## Constraints

- Monad Testnet only
- Keep the hype layer lightweight
- Prioritize clarity and a working flow over feature bloat
- All tests must pass
- Read TOOLS.md and PRJ.md (Open Verifications) before starting

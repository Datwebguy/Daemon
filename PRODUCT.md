# Product Specification – Daemon

## Problem
Chog NFTs are passive. Holders manage yield by hand, and the NFT has no ongoing economic or emotional utility beyond ownership.

## Principles
- **Multi-user and decentralized.** Nobody operates Daemon for holders. No executor, no session keys, no admin over funds.
- **Testnet product** on Monad Testnet (10143).
- **NFT is the owner.** The account, assets, strategy choice, mood and history follow the token.

## Value Loops

1. **Ownership Loop** – NFT = master key to the account and all rights  
2. **Yield Loop** – Pluggable adapters earn; anyone compounds for a bounty  
3. **Personality Loop** – Mood + messages + hype create return visits  
4. **Social Loop** – Anyone can hype any Daemon; leaderboard and feed  
5. **Secondary Market Loop** – An active Daemon (history, boost, dynamic image) transfers atomically with the NFT  

## Compounding Model

`compound()` is public. Anyone can call it.

- **Bounty** = gas reimbursement + a share of the harvested profit. Starts at about 5% and rises the longer a Daemon waits, capped at about 10%. (Reference points: Beefy pays callers part of the performance fee; Convex pays about 1% of rewards at much larger scale.)
- **Minimum profit threshold**: reverts unless pending yield exceeds gas + bounty, so dust calls never happen.
- **Batching**: `DaemonHub` compounds many Daemons in one transaction so bounties cover gas.
- **Safety on-chain**: registered adapters only, cooldown, oracle-based minimum output on the swap step, a short unlock/streaming window for harvested gains, and funds can only return to the same account.
- **Why 1% was dropped**: 1% of a day's profit on a small balance is a fraction of a cent. Gas reimbursement plus a larger, rising share is what makes keepers show up.

## Yield Layer (Adapters)

Each Daemon allocates to adapters implementing `deposit / withdraw / harvest / balance`. ERC-4626 vaults need almost no custom code.

| Adapter | Source | Testnet status |
|---|---|---|
| StableVault | Our ERC-4626 vault, low steady rate, rewards streamed from a funded pool | We deploy it |
| DegenVault | Our ERC-4626 vault, high variable rate | We deploy it |
| `IYieldSource` | Interface every source implements; the Daemon holds the vault shares itself | Real protocols can be added later behind a wrapper |
| StakingAdapter | Monad staking precompile (`0x1000`) or Yield.xyz | Optional; unverified from a contract account |
| Later | Real lending/yield protocols when they exist on the target network, Pendle, LSTs, $CHOG staking | Not in scope now |

Aave and Morpho are not on Monad testnet, so Daemon ships its own yield sources. Two vaults with different risk profiles make the adapter choice meaningful and feed the Daemon's mood (a Degen Daemon is Chaotic, a Stable one is Smug).

Rules:
- Adapters are immutable once registered; new ones are added behind a timelock and can never block an owner's exit.
- Per-adapter and per-Daemon caps.
- `sweepToOwner()` exits every adapter as far as the source allows.

## Personality Layer

- Moods: Chill / Smug / Chaotic / Flexing / Tired
- Inputs: recent yield, one trait bias, optional Pyth volatility; Pyth Entropy for rare "critical hype" moments
- Neglect decay: if a Daemon is not compounded or hyped for a long time, it drifts to Tired (inspired by Aavegotchi kinship)

### Hype (anyone can hype any Daemon)
- Costs a small amount of MON or $CHOG, paid by the hyper from their own wallet.
- The payment goes into that Daemon's **boost pot**. During the 2–4 hour boost, the pot tops up harvested yield by the boost multiplier (for example 1.15x) until the pot runs out. So the boost is funded, not invented.
- Limits: one hype per person per Daemon every few hours, a cooldown on the Daemon, and a ceiling on the boost so hypes cannot stack forever.
- Any unused pot belongs to the Daemon and is withdrawable by the owner.

## $CHOG

Hype payable in $CHOG; a share is burned or locked; tiered boosts for staking $CHOG (planned).

## 7-Test Evaluation Matrix

| Test | Pass Criteria |
|------|---------------|
| NFT Essential | Without the NFT there is no owner: no deposits, withdrawals, sweeps or strategy choice, and the Daemon stops |
| Non-Custodial | Sweep always available to current owner; no admin can move funds |
| Safety | `compound()` can only move funds back into the same account through registered adapters |
| Fun | Mood + social hype + share card feel engaging |
| Retention | Reasons to check back: messages, boost expiry, decay, yield, leaderboard |
| Clarity | Judge completes the full flow in < 3 minutes |
| Monad Fit | Cheap batched multicalls and fast blocks |

## Trust Guardrails

- 1-click `sweepToOwner`  
- Graceful spin-down on transfer (cooldowns reset; bounty owed to callers is paid immediately, not deferred)  
- No manager or admin role over user funds  
- Ownership-cycle guard: an account can never own its own NFT  

## Roadmap

1. **Now (Testnet 10143)**: core flow, our own Stable and Degen vaults via the ERC-4626 adapter, public compound with bounty, social hype, dynamic image, feed and leaderboard  
2. **Next**: more adapters (staking, LSTs), $CHOG staking tiers, seasons and events  
3. **Out of scope for now**: mainnet, real DeFi protocol integrations, audits  

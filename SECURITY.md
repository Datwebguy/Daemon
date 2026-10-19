# Security – Daemon

Status: **testnet only, unaudited by a third party.** This document records the internal audit done before the first commit and the known limitations.

## Design guarantees

- No admin, operator, session key or delegated authority can move user funds. The only privileged address is the registry governor, who can add (never remove) yield sources behind a timelock.
- Only the current NFT owner can `execute`, `allocate`, `deallocate` and `sweepToOwner`. Ownership is read live from the Chog, so a sale transfers all rights atomically.
- `compound()` and `hype()` are public. `compound` can only move funds back into the same account (through registered sources) and pay the caller a bounty; `hype` can only add value to that Daemon's boost pot.
- `execute` rejects approval-style calls (`approve`, `increaseAllowance`, `setApprovalForAll`, `permit`, Permit2 `approve`). Without this, a seller could keep an allowance after selling the Chog and drain the buyer.
- A Chog cannot be transferred to any token-bound account of its own collection (enforced in the NFT's `_update`, so plain `transferFrom` is covered too). This prevents ownership cycles that would lock funds forever.
- `sweepToOwner` never reverts because of a broken source or token (low-level calls, no returndata copying), also exits registered sources the account no longer tracks, and returns unused pots.
- A failing reward swap or claim is skipped instead of blocking `compound`; the rewards stay in the account and are retried.

## Internal audit (2026-10-19)

Five read-only reviews (account, yield layer, NFT, frontend, keeper/indexer) plus the integration tests. All 5 reviewed areas were re-tested after fixes: **179 contract tests, 67 keeper tests, 16 indexer tests**, frontend type-check/lint/build clean.

Fixed:
- High: approvals granted by a previous owner survived a sale (`execute` selector block).
- Medium: ownership cycles via plain `transferFrom`; sweep leaving rewards behind after a full deallocate; one bad swap blocking compounding; pot accounting drifting after owner transfers.
- Low: `Compounded.caller` logged the hub instead of the keeper; fee-on-transfer $CHOG hype; registry accepted configs that disable compounding (100% bounty, bad slippage, no router/oracle code); no way to cancel a queued source; deploy script reverting on a long reward duration; NFT image accepted U+FFFE/U+FFFF and showed a boost on a dormant Chog; `setDaemon` accepted a non-contract implementation.
- Keeper: paid gas for accounts that failed inside a hub batch; no re-simulation before send; double-send risk during nonce recovery; indexer credited all batched compounds to the hub.
- Frontend: wrong cooldown display before the first compound; Explore page hang on huge IDs; batch size above the hub limit of 50; deposit without preflight checks.

## Known limitations (testnet accepted)

- **Oracle:** `MockOracle` is set by one updater and has no staleness check. It stands in for Pyth; do not use it with real value.
- **MEV:** compound swaps tolerate up to 3% slippage against the oracle (shallow testnet pools). Production should use a tighter bound, TWAP or private order flow.
- **DegenVault timing:** the per-epoch rate multiplier is deterministic and public, so a large depositor can time deposits around high epochs. No principal is at risk; rewards are only redistributed.
- **Timelock:** the testnet registry is deployed with a zero timelock and the deployer as governor. Use a multisig and a real delay for anything beyond testnet.
- **Free mint tokens:** `MockERC20` mint is unrestricted. Never ship the testnet deploy script to a network with real value.
- **Cooldowns on transfer:** compound/hype cooldowns are not reset when the NFT changes hands (the account cannot observe transfers). No authority is retained by the previous owner.
- **Reward vaults:** funds notified while a vault has zero depositors stay in the vault; there is no rescue function by design.
- **Free mint uses `_mint`, not `_safeMint`.** Wallets upgraded with EIP-7702 (common on Monad) are EOAs with code and often cannot answer `onERC721Received`, so a safe mint would revert for them. The recipient is always the caller. A regression test covers this.
- **Testnet Chogs carry real artwork by reference.** `tokenURI` points at the real Chog Genesis metadata on IPFS (1,969 artworks, chosen pseudo-randomly at mint, duplicates possible). It depends on public IPFS gateways staying available; the app tries two and falls back to the drawn creature. The collection and its metadata are not ours and could change.
- **Test reward pools are small by design.** Vault emissions are fixed and shared by all depositors, so yield per dUSD falls as deposits grow. The defaults (1,000 and 3,000 DMNR over 30 days) suit a few dozen testers.
- **`tokenURI` gas:** about 655k gas is needed. A node with a lower `eth_call` gas cap would fail to render images.
- **Gas reimbursement** is an estimate, capped by `gasReimbursementCap`.

## Reporting

Open a private security advisory on the GitHub repository.

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

## Added 2026-10-19 (after the internal audit above)

- **$CHOG perks and burn.** A share of each $CHOG hype goes to the dead address (capped at 50% by the registry); the pot is credited only with what remains. Tests cover the burn, the pot, the minimum check and the sweep.
- **Lucky hype (Pyth Entropy).** `hypeLucky` applies a normal hype immediately and never depends on the roll. The callback is callable only by the configured Entropy contract, once per request, and only changes the boost (max multiplier, plus one duration). The boost is still paid only from the hype jar, so a critical roll cannot create value. The callback is tiny (no external calls) so it fits the requested gas. If Entropy never answers, the hyper simply keeps a normal hype. Verified against the real Entropy contract on a fork of Monad testnet.
- **Welcome drip.** Only the relayer wallet (the app's server, which checks the player's Privy sign-in) can trigger a gift, so bots cannot drain the pool by calling the contract with invented addresses. The contract itself enforces one claim per wallet, near-empty wallets only and a daily cap, so even a stolen relayer key drains at most `amount x dailyLimit` per day. The funder can swap the relayer (`setRelayer`) if its key leaks and withdraw leftovers; it has no other power. Known gap: the route trusts the address a signed-in player sends (Privy tokens carry no wallet address), so one account can ask for a gift to any new address; the daily cap bounds this.
- **Lucky roll trust.** The random number comes from the Pyth Entropy provider. At stake is only a boost extension that is funded by the hype jar, so the provider cannot create or take value.
- **Real traits on-chain.** `ChogRealTraits` is a stateless reader over three immutable data contracts generated from the real metadata; `script/verify-chog-traits.mjs` compares all 1,969 artworks on-chain with the source. `tokenURI` costs about 265k gas and never reverts because of a hostile Daemon (tested with all four hostile modes).
- **Pyth price feeds are not used.** Hermes now requires an API key, so prices still come from `MockOracle` (see the oracle limitation below).

## Known limitations (testnet accepted)

- **Oracle:** `MockOracle` is set by one updater and has no staleness check. It stands in for Pyth price feeds (not integrated: Hermes needs an API key); do not use it with real value. Randomness for lucky hype does come from Pyth Entropy.
- **Lucky hype cost.** A roll costs the Entropy fee (about 0.13 MON on testnet) on top of the hype, shown in the app before the hyper confirms.
- **MEV:** compound swaps tolerate up to 3% slippage against the oracle (shallow testnet pools). Production should use a tighter bound, TWAP or private order flow.
- **DegenVault timing:** the per-epoch rate multiplier is deterministic and public, so a large depositor can time deposits around high epochs. No principal is at risk; rewards are only redistributed.
- **Timelock:** the testnet registry is deployed with a zero timelock and the deployer as governor. Use a multisig and a real delay for anything beyond testnet.
- **Free mint tokens:** `MockERC20` mint is unrestricted. Never ship the testnet deploy script to a network with real value.
- **Cooldowns on transfer:** compound/hype cooldowns are not reset when the NFT changes hands (the account cannot observe transfers). No authority is retained by the previous owner.
- **Reward vaults:** funds notified while a vault has zero depositors stay in the vault; there is no rescue function by design.
- **Free mint uses `_mint`, not `_safeMint`.** Wallets upgraded with EIP-7702 (common on Monad) are EOAs with code and often cannot answer `onERC721Received`, so a safe mint would revert for them. The recipient is always the caller. A regression test covers this.
- **Testnet Chogs carry real artwork by reference.** The real traits are on-chain, but the image is an IPFS link (1,969 artworks, chosen pseudo-randomly at mint, duplicates possible). It depends on public IPFS gateways staying available; the app tries two and falls back to the drawn creature. The collection is not ours and could change.
- **Test reward pools are small by design.** Vault emissions are fixed and shared by all depositors, so yield per dUSD falls as deposits grow. The defaults (1,000 and 3,000 DMNR over 30 days) suit a few dozen testers.
- **Gas for metadata:** `tokenURI` needs about 265k gas and `livingURI` about 655k. A node with a lower `eth_call` gas cap would fail to render them.
- **Gas reimbursement** is an estimate, capped by `gasReimbursementCap`.

## Reporting

Open a private security advisory on the GitHub repository.

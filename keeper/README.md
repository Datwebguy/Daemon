# Daemon reference keeper

Compounding a Daemon is **permissionless**. Anyone can call `DaemonAccount.compound(bountyRecipient)` or `DaemonHub.compoundMany(accounts)` and earn the caller bounty: a gas reimbursement plus a share of the harvest (about 5%, rising to about 10% the longer a Daemon waits). This folder holds an open-source reference keeper that does this. **The platform does not depend on it.** It is one keeper among many. Run it, fork it, or write your own.

## Run it

Requirements: Node 22+ and a wallet holding a little testnet MON for gas (faucet: https://faucet.monad.xyz).

```bash
cd keeper
npm install
cp .env.example .env        # fill in addresses and KEEPER_PRIVATE_KEY (.env is git-ignored)
npm run dry-run             # discovers, simulates and decides, but sends nothing
npm start                   # live loop
npm run once                # one live cycle, then exit
```

Compiled: `npm run build && npm run start:dist`. Flags: `--dry-run`, `--once` (or `DRY_RUN=true`, `RUN_ONCE=true`). Ctrl+C stops it gracefully: it finishes the current step, waits for a pending receipt, then exits. A second Ctrl+C exits at once.

Dry-run needs no private key. It simulates from `BOUNTY_RECIPIENT`, or from the zero address if that is unset.

## How it makes money

Each cycle does the following:

1. **Discover Daemon accounts.**
   - `indexer`: query the Envio indexer (`Daemon { id tokenId }`) at `INDEXER_URL`.
   - `registry`: derive the ERC-6551 address of each token id `MIN_TOKEN_ID..MAX_TOKEN_ID` (or `..totalSupply()`) locally. This is the same CREATE2 math as `registry.account(impl, salt, chainId, MockChog, id)`, checked against the live canonical registry on 10143. It needs no RPC call per token.
   - `chog`: `MockChog.daemonOf(tokenId)` through multicall3.
   - `auto` (the default) uses the indexer if `INDEXER_URL` is set, else `registry` if `DAEMON_IMPLEMENTATION` is set, else `chog`.
2. **Read bounties in bulk.** It calls `pendingBounty()` on every address through multicall3 with `allowFailure`. Addresses with no code (account not created yet) fail to decode and are skipped. `pendingBounty()` returns 0 when `compound` would revert (cooldown, minimum profit), so these accounts are skipped for free.
3. **Select.** It keeps bounties `> 0` and `>= MIN_BOUNTY`, sorts them highest first and splits them into batches of `BATCH_SIZE`. Without `DAEMON_HUB`, each account is its own transaction.
4. **Simulate and decode.** It `eth_call`s `compoundMany` (or `compound`) from the keeper address at a pinned block and decodes the per-account `Result[]` (`account, success, profit, bounty`). `compoundMany` never reverts for a single bad account, it reports `success=false`. Those accounts are dropped (and excluded for `EXCLUDE_CYCLES` cycles) and the **reduced batch is simulated again** before anything else happens. The bounty used for the send decision is the sum of bounties decoded from the simulation of the exact batch being sent. `pendingBounty()` is only a cheap pre-filter; there is no fallback to it. **Empty or undecodable return data (for example `DAEMON_HUB` has no code or the wrong ABI) is an error: nothing is sent and the error is logged.** If the hub rejects a batch with `BatchTooLarge`, the batch is split in two, not excluded.
5. **Gas limit.** It estimates gas and sets `gasLimit = ceil(estimate x (1 + GAS_LIMIT_MARGIN_BPS/10000))`, 10% by default. Because the hub runs each account in a try/catch, a limit that is too low does not revert the batch: inner calls just start failing. So the keeper **re-runs the eth_call with `gas = the padded limit`** and requires the same per-account success set and the same bounties. If it differs, the limit is raised (bounded by `MAX_GAS_LIMIT` and the Monad per-tx limit of 30M) and then tightened again; if nothing under the cap works, the batch is shrunk. **Monad charges `gasLimit x gasPrice`, not gas used**, so the limit is explicit and tight. viem's default padding is never used.
6. **Profitability check.** It computes the worst-case cost `gasLimit x maxFeePerGas` (wei) and converts it to asset units with `MON_PRICE_IN_ASSET`, or with `PRICE_ORACLE.quote(WMON, ASSET, 1e18)`. Rounding is always up. It sends only if `bounty > cost` **and** `bounty >= cost x (1 + MIN_PROFIT_MARGIN_BPS/10000)`. If a batch does not pay, it retries with the top half by bounty, down to a single account.
7. **Re-simulate, then send.** Immediately before sending, the exact transaction (same calldata, same gas limit) is simulated once more at the latest block. If any account stopped compounding (usually another keeper got there first) or the batch stopped being profitable, the keeper re-plans with the accounts that still work, or skips the batch. Then it sends an EIP-1559 transaction with the explicit gas limit and fees and waits for the receipt. The bounty earned is read from `Compounded` logs emitted by the batch accounts only.

### Tips for profit
- Set `MIN_BOUNTY` and `MIN_PROFIT_MARGIN_BPS` to match your risk. Bounties rise the longer a Daemon is left alone, so waiting means less competition per Daemon but more risk that another keeper takes it first.
- Batch through `DAEMON_HUB`. The base transaction cost is shared across accounts.
- Run against a paid RPC for lower latency. Other keepers compete for the same bounties, and a lost race is **not always free**. With a direct `compound` call the simulation fails first and nothing is sent, but with hub batches a race can cost gas: another keeper's transaction can land between your last simulation and your inclusion, the hub then records `success=false` for those accounts (the batch does not revert) and you still pay `gasLimit x gasPrice` for the whole batch. The keeper mitigates this by re-simulating right before sending, by keeping the gas limit tight, by excluding accounts that lost a race for a few cycles, and by requiring a profit margin. It cannot remove the risk; smaller batches and a fast RPC reduce it.
- Use a dedicated hot wallet. Your gas is refunded through the bounty, so it only needs a small MON float. Bounties arrive in the platform asset (testnet: dUSD).

## Robustness
- There is a single retry layer: the viem HTTP transport has `retryCount: 0` and `withRetry` does the retrying, so attempts are not multiplied. Reads use exponential backoff with jitter; an HTTP 429 (rate limit) triggers a much longer backoff. A deterministic revert is never retried.
- Transactions are signed locally and the hash is known before broadcast. On `nonce too low/high` the nonce is resynced and the tx retried once. On `already known` the keeper **does not resend**: it treats the tx as sent and waits for the receipt of the hash it signed (if the hash is unknown it skips the rest of the cycle). `replacement transaction underpriced` is not retried. Other send errors are not retried either. Only one transaction is in flight at a time.
- On a receipt timeout the batch accounts are excluded for `EXCLUDE_CYCLES` cycles and no further tx is sent that cycle.
- Discovery is paged (no giant arrays for a large `MAX_TOKEN_ID`). If the indexer fails, the keeper falls back to registry address derivation (needs `DAEMON_IMPLEMENTATION` + `MOCK_CHOG`) or `MockChog.daemonOf`.
- `BATCH_SIZE` is clamped to 50 (`DaemonHub.MAX_BATCH`) with a warning.
- `--once` exits non-zero if the cycle threw or any batch failed.
- Logs are structured JSON lines. The private key is never logged. The key is dropped from `process.env` after the account is derived. RPC and indexer URLs are logged by origin only.
- If whole cycles fail, the wait between cycles backs off up to 10x `INTERVAL_SECONDS`.

## Configuration
See `.env.example` for every variable. Required: `KEEPER_PRIVATE_KEY` (unless dry-run), a discovery source, and a price source (`MON_PRICE_IN_ASSET` or `PRICE_ORACLE` + `WMON` + `ASSET`).

## ABIs
`src/abis.generated.ts` is generated from the Foundry build. `DaemonHub` has only `compoundMany(address[])`, which pays `msg.sender` (the keeper) and returns `Result[]`. The old `HUB_RECIPIENT_ARG` option was removed: setting it to true is a configuration error. In the `Compounded` event, `caller` is the bounty recipient.

## Tests
```bash
npm test          # vitest: selection, gas-vs-bounty decision, ERC-6551 derivation, config, keeper cycle against a mock hub that behaves like the real one (per-account success=false, BatchTooLarge above 50, gas-limit sensitive inner calls)
npm run typecheck
```

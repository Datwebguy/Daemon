# Daemon indexer (Envio HyperIndex v3)

This indexer serves the Daemon feed, the leaderboards and keeper stats on **Monad Testnet (chain 10143)**. Monad's public `eth_getLogs` is capped at 100 to 1,000 blocks, so the frontend reads history from here and not from the RPC.

## How it works

- **Discovery.** The canonical ERC-6551 registry `0x000000006551c19487814612e58FE06813775758` (confirmed on 10143 with `eth_getCode`) emits `ERC6551AccountCreated` for every token-bound account on the chain.
  - `src/EventHandlers.ts` filters that event by its indexed topics, `implementation == ENVIO_DAEMON_IMPLEMENTATION` and `tokenContract == ENVIO_MOCK_CHOG`. The filter runs at the data source.
  - A second check rejects a non-default `salt` and a foreign `chainId`, which are non-indexed fields.
  - The handler then registers each account as a `DaemonAccount` with `indexer.contractRegister`. This is the factory pattern.
- **Events.** `Allocated`, `Deallocated`, `Compounded`, `DaemonUpdate`, `Hyped`, `BoostApplied` and `Swept` are indexed **only from registered accounts**, so fake events from other contracts are ignored. Envio indexes the whole creation block for a newly registered address, so events emitted right after the account is created are not lost.
- **Ordering.** Ids are `<chainId>_<block>_<logIndex>`. Sort history by `blockNumber`, then `logIndex`. Monad timestamps have 1 s granularity and several blocks share one, so never sort by `timestamp`.
- **Address format.** Every address is lowercase (`address_format: lowercase`). Query with `address.toLowerCase()`.

### Entities (`schema.graphql`)
| Entity | Purpose |
|---|---|
| `Daemon` (id = account) | tokenId, `lifetimeYield` (NET, Σ DaemonUpdate.yieldAmount, equals the contract's `lifetimeYield()`), `grossHarvest` (Σ Compounded.profit), `totalBounties`, `compoundCount`, `hypeCount`, MON / token hype totals, `lastMood` / `lastMoodName`, `lastMessage`, `lastCompoundAt`, boost, `allocatedAssets`, sweeps |
| `DaemonUpdate` | feed: mood + message + yield per update |
| `Compounded` | every compound: `keeper` (the event's `caller` = bounty recipient), gross `profit`, `bounty`, `txFrom` |
| `Hyped`, `BoostApplied`, `Allocation` | history (Allocation covers ALLOCATE / DEALLOCATE / SWEEP) |
| `Chog` (id = tokenId) | `owner` (lowercase, kept current from the collection's `Transfer` events; zero address = burned), mint block and time, `transferCount`. This is how the app lists every Chog a wallet holds, including Chogs whose Daemon is not woken yet |
| `Keeper` (id = bounty recipient) | `totalBounties`, `compounds`, `totalProfitCompounded` (gross) |
| `Hyper` (id = hyper) | hype counts and totals |
| `Stats` (id = `global`) | platform totals: `totalYield` (net), `totalGrossHarvest`, `totalBounties`, counts |

### Yield semantics
- `Daemon.lifetimeYield` is the **net** yield and equals `DaemonAccount.lifetimeYield()`: the sum of `DaemonUpdate.yieldAmount`, which per compound is `profit + boostTopUp - bounty`. Hype updates emit `yieldAmount = 0`. Rank and display this figure.
- `Daemon.grossHarvest` is the sum of `Compounded.profit`, the **gross** harvest before the bounty and without the boost top-up. It is not the yield. `totalBounties` is the sum of `Compounded.bounty`.
- `grossHarvest - totalBounties` is **not** `lifetimeYield` when a boost top-up was paid (the top-up adds to net yield).
- `Stats.totalYield` is the net total (sum of all `lifetimeYield`); `Stats.totalGrossHarvest` is the gross total.

### Keeper attribution
`Keeper` entities are keyed by the `caller` field of `Compounded(tokenId, caller, profit, bounty)`. The contracts set it to the **bounty recipient** (the keeper address when the compound goes through `DaemonHub.compoundMany`), not to the account's `msg.sender` (which would be the hub). So a hub batch credits the keeper, not the hub. `Compounded.txFrom` stores the transaction's `from` (needs `transaction_fields: from` in `config.yaml`) for reference only.

### Field changes the frontend must adopt
| Old | New |
|---|---|
| `Daemon.lifetimeYield` (was gross Σ profit) | same name, now **net** (Σ yieldAmount); use it for the leaderboard |
| `Daemon.netYield` | **removed**, use `lifetimeYield` |
| `Daemon.reportedYield` | **removed**, use `lifetimeYield` |
| (none) | `Daemon.grossHarvest` (gross Σ profit) |
| `Stats.totalYield` (was gross) | same name, now **net** |
| (none) | `Stats.totalGrossHarvest` |
| `Compounded.profit` | unchanged, still gross; new `Compounded.txFrom` |
| `Keeper.totalProfitCompounded` | unchanged name, gross profit of the compounds the keeper was paid for |

Re-index from the start block after upgrading, since existing rows hold the old semantics.

## Data source: HyperSync supports Monad Testnet
As of 2026-10-18, Envio lists **Monad Testnet 10143** as a HyperSync network:
- HyperSync: `https://10143.hypersync.xyz` (also `https://monad-testnet.hypersync.xyz`)
- HyperRPC: `https://10143.rpc.hypersync.xyz`

`/height` answered 72,200,583, level with the public RPC head. HyperSync is the default source and needs a free `ENVIO_API_TOKEN` (https://envio.dev/app/api-tokens).

The public RPC is configured as a **fallback** with a 100-block window (`initial_block_interval` / `interval_ceiling: 100`), so it stays under the public `eth_getLogs` cap. To index without HyperSync, change `for: fallback` to `for: sync` in `config.yaml`. Then set `ENVIO_START_BLOCK` to the deployment block, or the sync takes a long time. A paid RPC with a larger range is strongly recommended in that mode.

## Setup
```bash
cd indexer
cp .env.example .env      # set ENVIO_API_TOKEN, ENVIO_DAEMON_IMPLEMENTATION, ENVIO_MOCK_CHOG (required), ENVIO_START_BLOCK
npm install
npm run codegen           # writes .envio/ + envio-env.d.ts
npm run dev               # needs Docker (Postgres + Hasura); GraphQL at http://localhost:8080/v1/graphql (admin secret: testing)
```

**Placeholders** wait on the deployment: `ENVIO_DAEMON_IMPLEMENTATION` (required, startup fails without it), `ENVIO_MOCK_CHOG`, `ENVIO_DAEMON_SALT` (default `0x00…00`, must match the salt the frontend uses in `createAccount`) and `ENVIO_START_BLOCK`. The event signatures in `config.yaml` are copied from `contracts/src/interfaces/IDaemonAccount.sol` and `IERC6551.sol`. If the contracts change, update both `config.yaml` and `typecheck/envio-codegen-shim.d.ts`.

### Windows
The `envio` CLI ships native binaries for Linux and macOS only (`envio-linux-*`, `envio-darwin-*`). On Windows, `envio codegen` / `dev` fail with `Cannot read properties of null (reading 'runCli')`. `envio dev` also needs Docker. Use WSL2, Docker, CI or Envio Cloud to run it.

To check the handlers on Windows without codegen:
```bash
npm run typecheck:shim   # tsc against typecheck/envio-codegen-shim.d.ts (hand-mirrored codegen types)
npm test                 # vitest: pure handler logic in src/lib/logic.ts
```
After a real codegen, use `npm run typecheck`.

## GraphQL queries for the frontend
The endpoint is Hasura (`/v1/graphql`). BigInt fields come back as strings.

### Feed (latest Daemon messages)
```graphql
query Feed($limit: Int = 30, $offset: Int = 0) {
  DaemonUpdate(order_by: [{ blockNumber: desc }, { logIndex: desc }], limit: $limit, offset: $offset) {
    id
    tokenId
    mood
    moodName
    message
    yieldAmount
    blockNumber
    timestamp
    txHash
    daemon { id lastMoodName boostMultiplierBps boostExpiresAt }
  }
}
```
Feed for one Daemon: add `where: { daemon_id: { _eq: $account } }`. A live feed uses the same query as a `subscription`.

### Leaderboard by lifetime (net) yield
```graphql
query Leaderboard($limit: Int = 20) {
  Daemon(order_by: [{ lifetimeYield: desc }, { compoundCount: desc }], limit: $limit) {
    id
    tokenId
    lifetimeYield
    grossHarvest
    totalBounties
    compoundCount
    hypeCount
    lastMoodName
    lastMessage
    lastCompoundAt
  }
}
```
Variants: most hyped (`order_by: { hypeCount: desc }`), most active (`compoundCount: desc`).

### Chogs a wallet holds
```graphql
query Owned($owner: String!) {   # lowercase address
  Chog(where: { owner: { _eq: $owner } }, order_by: { tokenId: asc }) { tokenId }
}
```

### This week's leaderboard (a "season", Monday 00:00 UTC to Monday)
Sum `yieldAmount` per `tokenId` over the season's events (the app does this in `frontend/lib/season.ts`):
```graphql
query Season($since: Int!, $limit: Int!) {
  DaemonUpdate(where: { timestamp: { _gte: $since }, yieldAmount: { _gt: 0 } }, order_by: [{ blockNumber: desc }, { logIndex: desc }], limit: $limit) {
    tokenId
    yieldAmount
  }
}
```

### Names the app renames
The app's queries rename a few fields with GraphQL aliases (`frontend/lib/indexer.ts`): `Compounded.keeper_id` as `caller`, `Hyped.hyper` as `from`, `Daemon.lastMood` as `mood`, `Daemon.id` as `account`.

### Top keepers
```graphql
query TopKeepers($limit: Int = 20) {
  Keeper(order_by: [{ totalBounties: desc }], limit: $limit) {
    id
    totalBounties
    compounds
    totalProfitCompounded
    lastCompoundAt
  }
}
```

### Daemon detail
```graphql
query DaemonDetail($account: String!) {
  Daemon_by_pk(id: $account) {
    id tokenId lifetimeYield grossHarvest totalBounties compoundCount hypeCount
    totalHypeMon totalHypeToken lastMood lastMoodName lastMessage lastCompoundAt
    boostMultiplierBps boostExpiresAt allocatedAssets sweptCount createdAtBlock
  }
  Compounded(where: { daemon_id: { _eq: $account } }, order_by: [{ blockNumber: desc }, { logIndex: desc }], limit: 10) {
    keeper_id profit bounty txFrom blockNumber timestamp txHash
  }
  Hyped(where: { daemon_id: { _eq: $account } }, order_by: [{ blockNumber: desc }, { logIndex: desc }], limit: 10) {
    hyper isMon token amount timestamp txHash
  }
}
```

### Platform stats and top hypers
```graphql
query Stats {
  Stats_by_pk(id: "global") { daemonCount totalYield totalGrossHarvest totalBounties compoundCount hypeCount keeperCount }
  Hyper(order_by: { hypeCount: desc }, limit: 10) { id hypeCount totalMon totalToken }
}
```

### Account list (used by the reference keeper's `INDEXER_URL` discovery)
```graphql
query Daemons($limit: Int!, $offset: Int!) {
  Daemon(limit: $limit, offset: $offset, order_by: { id: asc }) { id tokenId }
}
```

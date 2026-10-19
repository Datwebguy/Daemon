/*
 * Daemon indexer handlers (Envio HyperIndex v3).
 *
 * 1. ERC6551Registry.ERC6551AccountCreated  -> contractRegister: start indexing the new
 *    account as `DaemonAccount` (topic-filtered to our implementation + MockChog).
 * 2. ERC6551Registry.ERC6551AccountCreated  -> create the Daemon entity.
 * 3. DaemonAccount.*                         -> feed entities + leaderboard aggregates.
 *
 * Accounts register in the same block they are created; Envio indexes the whole block
 * for a newly registered address, so events emitted right after creation are not lost.
 */
import { type EvmOnEventContext, indexer } from "envio";
import {
  STATS_ID,
  applyAllocation,
  applyCompounded,
  applyKeeperCompound,
  applyHype,
  applyChogTransfer,
  applySweep,
  applyUpdate,
  emptyStats,
  eventId,
  isDaemonAccount,
  keeperIdOf,
  moodName,
  newDaemon,
  readFilterConfig,
  statsAfterCompound,
  statsAfterUpdate,
  ZERO_ADDRESS,
} from "./lib/logic.js";

const FILTER = readFilterConfig(process.env);

// Topic filter applied at the data source (HyperSync or eth_getLogs topics).
const registryWhere = () => ({
  params: FILTER.tokenContract
    ? { implementation: FILTER.implementation as `0x${string}`, tokenContract: FILTER.tokenContract as `0x${string}` }
    : { implementation: FILTER.implementation as `0x${string}` },
});

// ---------- discovery ----------

indexer.contractRegister(
  { contract: "ERC6551Registry", event: "ERC6551AccountCreated", where: registryWhere },
  async ({ event, context }) => {
    if (!isDaemonAccount(event.params, FILTER)) return;
    context.chain.DaemonAccount.add(event.params.account);
  },
);

indexer.onEvent(
  { contract: "ERC6551Registry", event: "ERC6551AccountCreated", where: registryWhere },
  async ({ event, context }) => {
    if (!isDaemonAccount(event.params, FILTER)) return;
    const id = event.params.account.toLowerCase();
    const existing = await context.Daemon.get(id);
    // A Daemon event can precede this handler only if the account existed before
    // (it cannot); still, keep aggregates if the entity is already there.
    context.Daemon.set({
      ...(existing ?? newDaemon({ id, tokenId: event.params.tokenId })),
      tokenId: event.params.tokenId,
      tokenContract: event.params.tokenContract.toLowerCase(),
      implementation: event.params.implementation.toLowerCase(),
      createdAtBlock: event.block.number,
      createdAtTimestamp: event.block.timestamp,
      createdTxHash: event.transaction.hash,
    });
    if (!existing) {
      const stats = await getStats(context);
      context.Stats.set({ ...stats, daemonCount: stats.daemonCount + 1 });
    }
  },
);

// ---------- Chog ownership ----------

indexer.onEvent({ contract: "MockChog", event: "Transfer" }, async ({ event, context }) => {
  const id = event.params.tokenId.toString();
  const existing = await context.Chog.get(id);
  context.Chog.set(applyChogTransfer(existing, event.params.to, event.params.tokenId, event.block.number, event.block.timestamp));
});

// ---------- helpers ----------

type Ctx = EvmOnEventContext;

async function getDaemon(context: Pick<Ctx, "Daemon">, address: string, tokenId: bigint) {
  const id = address.toLowerCase();
  return (await context.Daemon.get(id)) ?? newDaemon({ id, tokenId });
}

async function getStats(context: Pick<Ctx, "Stats">) {
  return (await context.Stats.get(STATS_ID)) ?? emptyStats();
}

// ---------- DaemonAccount events ----------

// Keeper attribution: `caller` is the BOUNTY RECIPIENT (the keeper), not the account's msg.sender (the hub, for
// batches). Keeper entities are keyed by it. `txFrom` (transaction.from) is stored on Compounded for reference only.
indexer.onEvent({ contract: "DaemonAccount", event: "Compounded" }, async ({ event, context }) => {
  const { tokenId, caller, profit, bounty } = event.params;
  const ts = event.block.timestamp;
  const daemon = await getDaemon(context, event.srcAddress, tokenId);
  context.Daemon.set(applyCompounded(daemon, profit, bounty, event.block.number, ts));

  const keeperId = keeperIdOf(caller);
  const keeper = await context.Keeper.get(keeperId);
  context.Keeper.set(applyKeeperCompound(keeper, caller, profit, bounty, ts));

  context.Compounded.set({
    id: eventId(event.chainId, event.block.number, event.logIndex),
    daemon_id: daemon.id,
    tokenId,
    keeper_id: keeperId,
    profit,
    bounty,
    txFrom: (event.transaction.from ?? "").toLowerCase(),
    blockNumber: event.block.number,
    logIndex: event.logIndex,
    timestamp: ts,
    txHash: event.transaction.hash,
  });

  context.Stats.set(statsAfterCompound(await getStats(context), profit, bounty, !keeper));
});

indexer.onEvent({ contract: "DaemonAccount", event: "DaemonUpdate" }, async ({ event, context }) => {
  const { tokenId, mood, message, yieldAmount } = event.params;
  const moodNum = Number(mood);
  const daemon = await getDaemon(context, event.srcAddress, tokenId);
  context.Daemon.set(applyUpdate(daemon, moodNum, message, yieldAmount, event.block.timestamp));
  context.DaemonUpdate.set({
    id: eventId(event.chainId, event.block.number, event.logIndex),
    daemon_id: daemon.id,
    tokenId,
    mood: moodNum,
    moodName: moodName(moodNum),
    message,
    yieldAmount,
    blockNumber: event.block.number,
    logIndex: event.logIndex,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
  // Platform net yield follows the same source as Daemon.lifetimeYield: DaemonUpdate.yieldAmount.
  context.Stats.set(statsAfterUpdate(await getStats(context), yieldAmount));
});

indexer.onEvent({ contract: "DaemonAccount", event: "Hyped" }, async ({ event, context }) => {
  const { tokenId, from, token, amount } = event.params;
  const ts = event.block.timestamp;
  const isMon = token.toLowerCase() === ZERO_ADDRESS;
  const daemon = await getDaemon(context, event.srcAddress, tokenId);
  context.Daemon.set(applyHype(daemon, token, amount));

  const hyperId = from.toLowerCase();
  const hyper = await context.Hyper.get(hyperId);
  context.Hyper.set({
    id: hyperId,
    hypeCount: (hyper?.hypeCount ?? 0) + 1,
    totalMon: (hyper?.totalMon ?? 0n) + (isMon ? amount : 0n),
    totalToken: (hyper?.totalToken ?? 0n) + (isMon ? 0n : amount),
    lastHypeAt: ts,
  });

  context.Hyped.set({
    id: eventId(event.chainId, event.block.number, event.logIndex),
    daemon_id: daemon.id,
    tokenId,
    hyper: hyperId,
    token: token.toLowerCase(),
    isMon,
    amount,
    blockNumber: event.block.number,
    logIndex: event.logIndex,
    timestamp: ts,
    txHash: event.transaction.hash,
  });

  const stats = await getStats(context);
  context.Stats.set({ ...stats, hypeCount: stats.hypeCount + 1 });
});

indexer.onEvent({ contract: "DaemonAccount", event: "BoostApplied" }, async ({ event, context }) => {
  const { tokenId, multiplierBps, expiresAt } = event.params;
  const daemon = await getDaemon(context, event.srcAddress, tokenId);
  context.Daemon.set({ ...daemon, boostMultiplierBps: multiplierBps, boostExpiresAt: expiresAt });
  context.BoostApplied.set({
    id: eventId(event.chainId, event.block.number, event.logIndex),
    daemon_id: daemon.id,
    tokenId,
    multiplierBps,
    expiresAt,
    blockNumber: event.block.number,
    logIndex: event.logIndex,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "DaemonAccount", event: "Allocated" }, async ({ event, context }) => {
  const { tokenId, source, assets, shares } = event.params;
  const daemon = await getDaemon(context, event.srcAddress, tokenId);
  context.Daemon.set(applyAllocation(daemon, "ALLOCATE", assets));
  context.Allocation.set({
    id: eventId(event.chainId, event.block.number, event.logIndex),
    daemon_id: daemon.id,
    tokenId,
    kind: "ALLOCATE",
    source: source.toLowerCase(),
    assets,
    shares,
    recipient: "",
    blockNumber: event.block.number,
    logIndex: event.logIndex,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "DaemonAccount", event: "Deallocated" }, async ({ event, context }) => {
  const { tokenId, source, shares, assets } = event.params;
  const daemon = await getDaemon(context, event.srcAddress, tokenId);
  context.Daemon.set(applyAllocation(daemon, "DEALLOCATE", assets));
  context.Allocation.set({
    id: eventId(event.chainId, event.block.number, event.logIndex),
    daemon_id: daemon.id,
    tokenId,
    kind: "DEALLOCATE",
    source: source.toLowerCase(),
    assets,
    shares,
    recipient: "",
    blockNumber: event.block.number,
    logIndex: event.logIndex,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "DaemonAccount", event: "Swept" }, async ({ event, context }) => {
  const { tokenId, to } = event.params;
  const daemon = await getDaemon(context, event.srcAddress, tokenId);
  context.Daemon.set(applySweep(daemon, to.toLowerCase(), event.block.timestamp));
  context.Allocation.set({
    id: eventId(event.chainId, event.block.number, event.logIndex),
    daemon_id: daemon.id,
    tokenId,
    kind: "SWEEP",
    source: "",
    assets: 0n,
    shares: 0n,
    recipient: to.toLowerCase(),
    blockNumber: event.block.number,
    logIndex: event.logIndex,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

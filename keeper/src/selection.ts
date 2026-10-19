import type { Address } from "viem";

export interface AccountBounty {
  account: Address;
  bounty: bigint; // asset base units, from pendingBounty()
}

/**
 * Pick accounts worth compounding and group them into batches.
 * - drops zero bounties (pendingBounty() returns 0 when compound would revert: cooldown, min profit)
 * - drops bounties below `minBounty`
 * - drops accounts in `exclude` (e.g. failed simulation recently)
 * - sorts by bounty descending (address as tie-breaker, so output is deterministic)
 * - de-duplicates accounts
 * - splits into batches of at most `batchSize`
 */
export function selectBatches(
  items: readonly AccountBounty[],
  opts: { minBounty: bigint; batchSize: number; exclude?: ReadonlySet<string> },
): AccountBounty[][] {
  if (opts.batchSize < 1) throw new Error("batchSize must be >= 1");
  const seen = new Set<string>();
  const picked: AccountBounty[] = [];
  for (const it of items) {
    const key = it.account.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (it.bounty <= 0n || it.bounty < opts.minBounty) continue;
    if (opts.exclude?.has(key)) continue;
    picked.push(it);
  }
  picked.sort((a, b) => {
    if (a.bounty !== b.bounty) return a.bounty > b.bounty ? -1 : 1;
    const x = a.account.toLowerCase();
    const y = b.account.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const batches: AccountBounty[][] = [];
  for (let i = 0; i < picked.length; i += opts.batchSize) batches.push(picked.slice(i, i + opts.batchSize));
  return batches;
}

export function sumBounties(items: readonly AccountBounty[]): bigint {
  return items.reduce((s, x) => s + x.bounty, 0n);
}

/**
 * Next smaller batch to try when a batch is unprofitable: keep the top half by bounty (ties: earlier first),
 * preserving the original order of the kept accounts.
 */
export function shrinkBatch(batch: readonly AccountBounty[]): AccountBounty[] {
  if (batch.length <= 1) return [];
  const keep = Math.ceil(batch.length / 2);
  const ranked = batch
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (x.b.bounty !== y.b.bounty ? (x.b.bounty > y.b.bounty ? -1 : 1) : x.i - y.i))
    .slice(0, keep)
    .sort((x, y) => x.i - y.i);
  return ranked.map((x) => x.b);
}

/** Split a batch into two halves (first half gets the extra element). Used when the hub says BatchTooLarge. */
export function halveBatch(batch: readonly AccountBounty[]): [AccountBounty[], AccountBounty[]] {
  const mid = Math.ceil(batch.length / 2);
  return [batch.slice(0, mid), batch.slice(mid)];
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

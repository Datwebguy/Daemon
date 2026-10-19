/**
 * Weekly seasons for the leaderboard: a season runs from Monday 00:00 UTC to the next Monday, and a Daemon's score is
 * what it earned in that window (the sum of its DaemonUpdate.yieldAmount), so a new Daemon can win this week even if
 * an older one leads all time.
 */
export const WEEK = 7 * 24 * 3600;
/** 1970-01-01 was a Thursday; the first Monday is 4 days later. */
const FIRST_MONDAY = 4 * 24 * 3600;

/** Start of the season containing `nowSec` (unix seconds, Monday 00:00 UTC). */
export function seasonStart(nowSec: number): number {
  return nowSec - ((nowSec - FIRST_MONDAY) % WEEK + WEEK) % WEEK;
}

export const seasonEnd = (nowSec: number) => seasonStart(nowSec) + WEEK;

export type SeasonRow = { tokenId: unknown; yieldAmount: unknown };

const toBig = (v: unknown): bigint | undefined => {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === "string" && /^\d+$/.test(v.trim())) return BigInt(v.trim());
  } catch {
    /* fall through */
  }
  return undefined;
};

/** Sums yield per Chog and sorts best first (ties: lower token id first). Rows that cannot be read are skipped. */
export function rankSeason(rows: readonly SeasonRow[]): { tokenId: bigint; earned: bigint }[] {
  const totals = new Map<string, { tokenId: bigint; earned: bigint }>();
  for (const r of rows) {
    const id = toBig(r?.tokenId);
    const y = toBig(r?.yieldAmount);
    if (id === undefined || y === undefined || y <= BigInt(0)) continue;
    const key = id.toString();
    const cur = totals.get(key);
    totals.set(key, { tokenId: id, earned: (cur?.earned ?? BigInt(0)) + y });
  }
  return [...totals.values()].sort((a, b) => (a.earned === b.earned ? (a.tokenId < b.tokenId ? -1 : 1) : a.earned > b.earned ? -1 : 1));
}

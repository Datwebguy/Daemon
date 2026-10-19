import { env } from "./config";

/**
 * Field names that may still change (lifetime yield, bounty, ...) are centralized in INDEXER_FIELDS below.
 * Rows come from an external service: always parse numeric fields with toBigIntSafe (lib/format.ts).
 *
 * The queries below run against the Envio indexer in ../indexer (schema.graphql). Where the app's row types use
 * different names than the indexer, the query renames them with GraphQL aliases, so components stay unchanged:
 *   Compounded.keeper_id  -> caller      (the bounty recipient)
 *   Hyped.hyper           -> from
 *   Daemon.lastMood       -> mood,  Daemon.id -> account (the Daemon's ERC-6551 address is its id)
 * Owners come from the Chog entity (kept current from the collection's Transfer events).
 * History is ordered by blockNumber + logIndex, never by timestamp (Monad has 1s timestamp granularity).
 */

export type DaemonUpdateRow = {
  id: string;
  tokenId: string;
  mood: number;
  message: string;
  yieldAmount: string;
  blockNumber: string;
  logIndex: number;
  timestamp?: string;
  txHash?: string;
};
export type CompoundedRow = {
  id: string;
  tokenId: string;
  caller: string;
  profit: string;
  bounty: string;
  blockNumber: string;
  logIndex: number;
  timestamp?: string;
  txHash?: string;
};
export type HypedRow = {
  id: string;
  tokenId: string;
  from: string;
  token: string;
  amount: string;
  blockNumber: string;
  logIndex: number;
  timestamp?: string;
  txHash?: string;
};
export type DaemonRow = {
  id: string;
  tokenId: string;
  account: string;
  owner?: string | null;
  mood: number;
  lastMessage?: string | null;
  lifetimeYield: string;
  compoundCount?: number;
  hypeCount?: number;
  lastYield?: string | null;
};

export const indexerConfigured = Boolean(env.indexerUrl);

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!env.indexerUrl) throw new Error("Indexer not configured");
  const res = await fetch(env.indexerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Indexer HTTP ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new Error("Indexer returned no data");
  return body.data;
}

/**
 * GraphQL field names that the indexer schema may still rename (it is being updated in parallel).
 * ADJUST HERE ONLY: every query below selects these through a GraphQL alias, so the row types
 * above (`lifetimeYield`, `bounty`, ...) and every component stay unchanged when the indexer
 * renames a field. Example: if the indexer exposes `Daemon.totalYield`, set daemonLifetimeYield: "totalYield".
 */
export const INDEXER_FIELDS = {
  /** Daemon aggregate: cumulative yield (also the leaderboard sort key). */
  daemonLifetimeYield: "lifetimeYield",
  /** Compounded event: bounty paid to the caller. */
  compoundedBounty: "bounty",
  /** Compounded event: gross profit harvested. */
  compoundedProfit: "profit",
  /** Compounded event: bounty recipient (the indexer stores it as the keeper relation's id). */
  compoundedCaller: "keeper_id",
} as const;

const F = INDEXER_FIELDS;
const ORDER = "order_by: [{ blockNumber: desc }, { logIndex: desc }]";

export const FEED_QUERY = /* GraphQL */ `
  query Feed($limit: Int!) {
    DaemonUpdate(${ORDER}, limit: $limit) { id tokenId mood message yieldAmount blockNumber logIndex timestamp txHash }
    Compounded(${ORDER}, limit: $limit) {
      id tokenId caller: ${F.compoundedCaller} profit: ${F.compoundedProfit} bounty: ${F.compoundedBounty}
      blockNumber logIndex timestamp txHash
    }
    Hyped(${ORDER}, limit: $limit) { id tokenId from: hyper token amount blockNumber logIndex timestamp txHash }
  }
`;

export const LEADERBOARD_QUERY = /* GraphQL */ `
  query Leaderboard($limit: Int!) {
    Daemon(order_by: { ${F.daemonLifetimeYield}: desc }, limit: $limit) {
      id tokenId account: id mood: lastMood lastMessage lifetimeYield: ${F.daemonLifetimeYield} compoundCount hypeCount
    }
  }
`;

/** This season's yield events (positive ones only); summed per Chog by rankSeason in lib/season.ts. */
export const SEASON_QUERY = /* GraphQL */ `
  query Season($since: Int!, $limit: Int!) {
    DaemonUpdate(where: { timestamp: { _gte: $since }, yieldAmount: { _gt: 0 } }, ${ORDER}, limit: $limit) { tokenId yieldAmount }
  }
`;

/** Current mood and last words for the Chogs on the season board. */
export const SEASON_MOODS_QUERY = /* GraphQL */ `
  query SeasonMoods($ids: [numeric!]!) {
    Daemon(where: { tokenId: { _in: $ids } }) { id tokenId account: id mood: lastMood lastMessage }
  }
`;

/** Every Chog a wallet holds (owner is stored lowercase), including Chogs whose Daemon is still asleep. */
export const OWNED_QUERY = /* GraphQL */ `
  query Owned($owner: String!) {
    Chog(where: { owner: { _eq: $owner } }, order_by: { tokenId: asc }) { tokenId }
  }
`;

export const LAST_UPDATE_QUERY = /* GraphQL */ `
  query LastUpdate($tokenId: numeric!) {
    DaemonUpdate(where: { tokenId: { _eq: $tokenId } }, ${ORDER}, limit: 1) {
      id tokenId mood message yieldAmount blockNumber logIndex
    }
  }
`;

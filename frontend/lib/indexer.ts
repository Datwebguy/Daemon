import { env } from "./config";

/**
 * Field names that may still change (lifetime yield, bounty, ...) are centralized in INDEXER_FIELDS below.
 * Rows come from an external service: always parse numeric fields with toBigIntSafe (lib/format.ts).
 *
 * Expected GraphQL shape (Envio / Hasura style; adapt the query strings below for Goldsky/subgraph style).
 * History is ordered by blockNumber + logIndex, never by timestamp (Monad has 1s timestamp granularity).
 *
 *   type DaemonUpdate {          # IDaemonAccount.DaemonUpdate
 *     id: ID!                    # `${txHash}-${logIndex}`
 *     tokenId: BigInt!
 *     account: String!           # Daemon (ERC-6551) address that emitted the event
 *     mood: Int!
 *     message: String!
 *     yieldAmount: BigInt!
 *     blockNumber: BigInt!
 *     logIndex: Int!
 *     timestamp: BigInt!
 *     txHash: String!
 *   }
 *
 *   type Compounded {            # IDaemonAccount.Compounded
 *     id: ID!  tokenId: BigInt!  account: String!
 *     caller: String!            # the bounty recipient (not necessarily tx.origin)
 *     profit: BigInt!  bounty: BigInt!
 *     blockNumber: BigInt!  logIndex: Int!  timestamp: BigInt!  txHash: String!
 *   }
 *
 *   type Hyped {                 # IDaemonAccount.Hyped
 *     id: ID!  tokenId: BigInt!  account: String!  from: String!
 *     token: String!             # 0x0 for MON, else the $CHOG token
 *     amount: BigInt!
 *     blockNumber: BigInt!  logIndex: Int!  timestamp: BigInt!  txHash: String!
 *   }
 *
 *   type Daemon {                # aggregate, one per Chog
 *     id: ID!                    # tokenId as string
 *     tokenId: BigInt!
 *     account: String!
 *     owner: String              # current Chog holder (from MockChog Transfer)
 *     mood: Int!
 *     lastMessage: String
 *     lifetimeYield: BigInt!
 *     compoundCount: Int!
 *     hypeCount: Int!
 *     lastYield: BigInt
 *   }
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
  /** Compounded event: bounty recipient (the contract emits the recipient as `caller`). */
  compoundedCaller: "caller",
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
    Hyped(${ORDER}, limit: $limit) { id tokenId from token amount blockNumber logIndex timestamp txHash }
  }
`;

export const LEADERBOARD_QUERY = /* GraphQL */ `
  query Leaderboard($limit: Int!) {
    Daemon(order_by: { ${F.daemonLifetimeYield}: desc }, limit: $limit) {
      id tokenId account owner mood lastMessage lifetimeYield: ${F.daemonLifetimeYield} compoundCount hypeCount lastYield
    }
  }
`;

export const OWNED_QUERY = /* GraphQL */ `
  query Owned($owner: String!) {
    Daemon(where: { owner: { _ilike: $owner } }, order_by: { tokenId: asc }) { tokenId }
  }
`;

export const LAST_UPDATE_QUERY = /* GraphQL */ `
  query LastUpdate($tokenId: numeric!) {
    DaemonUpdate(where: { tokenId: { _eq: $tokenId } }, ${ORDER}, limit: 1) {
      id tokenId mood message yieldAmount blockNumber logIndex
    }
  }
`;

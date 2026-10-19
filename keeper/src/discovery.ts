import { type Address, getAddress, isAddress, zeroAddress } from "viem";
import { daemonAccountAbi, mockChogAbi } from "./abis.js";
import { type KeeperConfig, fallbackDiscoveryMode, resolveDiscoveryMode } from "./config.js";
import { computeErc6551Account } from "./erc6551.js";
import { type Logger, errorInfo } from "./logger.js";
import { withRetry } from "./retry.js";
import { type AccountBounty, chunk } from "./selection.js";
import type { DaemonTarget, ReadClient } from "./types.js";

type DiscoveryConfig = Pick<
  KeeperConfig,
  | "discoveryMode"
  | "indexerUrl"
  | "implementation"
  | "mockChog"
  | "registry"
  | "salt"
  | "chainId"
  | "minTokenId"
  | "maxTokenId"
  | "scanPageSize"
>;

export interface DiscoveryDeps {
  client: ReadClient;
  logger: Logger;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
  /** Injectable sleep for retry backoff (tests). */
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const RETRY = { retries: 3, baseDelayMs: 500, maxDelayMs: 8_000 };
export const INDEXER_PAGE_SIZE = 1000;

/** Highest token id to scan: MAX_TOKEN_ID if set, else MockChog.totalSupply() (ids assumed sequential). */
export async function resolveMaxTokenId(cfg: DiscoveryConfig, deps: DiscoveryDeps): Promise<bigint> {
  if (cfg.maxTokenId !== undefined) return cfg.maxTokenId;
  if (!cfg.mockChog) throw new Error("MAX_TOKEN_ID or MOCK_CHOG is required to enumerate token ids");
  const supply = await withRetry(
    () => deps.client.readContract({ address: cfg.mockChog!, abi: mockChogAbi, functionName: "totalSupply" }),
    { ...RETRY, label: "totalSupply", logger: deps.logger, signal: deps.signal, sleepFn: deps.sleepFn },
  );
  // ids minTokenId..minTokenId+supply-1
  return supply === 0n ? cfg.minTokenId - 1n : cfg.minTokenId + supply - 1n;
}

/** Token ids min..max in pages of `size`, generated lazily (a huge MAX_TOKEN_ID never becomes one big array). */
export function* tokenIdPages(min: bigint, max: bigint, size: number): Generator<bigint[]> {
  if (size < 1) throw new Error("page size must be >= 1");
  for (let start = min; start <= max; start += BigInt(size)) {
    const end = start + BigInt(size) - 1n < max ? start + BigInt(size) - 1n : max;
    const page: bigint[] = [];
    for (let id = start; id <= end; id++) page.push(id);
    yield page;
  }
}

/** Kept for callers that want a small range as an array. Prefer tokenIdPages. */
export function tokenIdRange(min: bigint, max: bigint): bigint[] {
  return [...tokenIdPages(min, max, 10_000)].flat();
}

async function* idScanPages(
  mode: "registry" | "chog",
  cfg: DiscoveryConfig,
  deps: DiscoveryDeps,
): AsyncGenerator<DaemonTarget[]> {
  const maxId = await resolveMaxTokenId(cfg, deps);
  for (const ids of tokenIdPages(cfg.minTokenId, maxId, cfg.scanPageSize)) {
    if (deps.signal?.aborted) return;
    if (mode === "registry") {
      // Pure CREATE2 math, no RPC: identical to registry.account(...).
      yield ids.map((tokenId) => ({
        tokenId,
        account: computeErc6551Account({
          registry: cfg.registry,
          implementation: cfg.implementation!,
          salt: cfg.salt,
          chainId: cfg.chainId,
          tokenContract: cfg.mockChog!,
          tokenId,
        }),
      }));
      continue;
    }
    // mode === "chog": MockChog.daemonOf(tokenId) via multicall3
    const res = await withRetry(
      () =>
        deps.client.multicall({
          allowFailure: true,
          contracts: ids.map((tokenId) => ({
            address: cfg.mockChog!,
            abi: mockChogAbi,
            functionName: "daemonOf" as const,
            args: [tokenId] as const,
          })),
        }),
      { ...RETRY, label: "daemonOf", logger: deps.logger, signal: deps.signal, sleepFn: deps.sleepFn },
    );
    const out: DaemonTarget[] = [];
    res.forEach((r, i) => {
      if (r.status === "success" && r.result !== zeroAddress) out.push({ tokenId: ids[i], account: r.result as Address });
    });
    yield out;
  }
}

/**
 * Candidate Daemon accounts, one page at a time. Accounts may not be deployed yet; readBounties filters those.
 * If the indexer fails (at any page), discovery falls back to registry derivation (or MockChog.daemonOf) from the
 * start. Pages already yielded may repeat; selectBatches de-duplicates.
 */
export async function* discoverDaemonPages(cfg: DiscoveryConfig, deps: DiscoveryDeps): AsyncGenerator<DaemonTarget[]> {
  const mode = resolveDiscoveryMode(cfg);
  if (mode !== "indexer") {
    yield* idScanPages(mode, cfg, deps);
    return;
  }
  try {
    yield* indexerPages(cfg.indexerUrl!, deps);
    return;
  } catch (err) {
    const fallback = fallbackDiscoveryMode(cfg);
    if (!fallback) {
      deps.logger.error("indexer discovery failed and no fallback is configured (set DAEMON_IMPLEMENTATION + MOCK_CHOG)", errorInfo(err));
      throw err;
    }
    deps.logger.warn("indexer discovery failed, falling back to on-chain discovery", { fallback, ...errorInfo(err) });
    yield* idScanPages(fallback, cfg, deps);
  }
}

/** All candidates as one array (small deployments / tests). The keeper itself streams pages. */
export async function discoverDaemons(cfg: DiscoveryConfig, deps: DiscoveryDeps): Promise<DaemonTarget[]> {
  const out: DaemonTarget[] = [];
  for await (const page of discoverDaemonPages(cfg, deps)) out.push(...page);
  return out;
}

/** Envio GraphQL (Hasura): `Daemon { id tokenId }`, paginated. */
export async function* indexerPages(url: string, deps: DiscoveryDeps): AsyncGenerator<DaemonTarget[]> {
  const f = deps.fetchFn ?? fetch;
  for (let offset = 0; ; offset += INDEXER_PAGE_SIZE) {
    if (deps.signal?.aborted) return;
    const body = JSON.stringify({
      query: "query Daemons($limit: Int!, $offset: Int!) { Daemon(limit: $limit, offset: $offset, order_by: {id: asc}) { id tokenId } }",
      variables: { limit: INDEXER_PAGE_SIZE, offset },
    });
    const rows = await withRetry(
      async () => {
        const res = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: deps.signal });
        if (!res.ok) throw Object.assign(new Error(`indexer HTTP ${res.status}`), { status: res.status });
        const j = (await res.json()) as { data?: { Daemon?: { id: string; tokenId: string | number }[] }; errors?: unknown };
        if (j.errors || !j.data?.Daemon) throw new Error(`indexer error: ${JSON.stringify(j.errors ?? "no data")}`);
        return j.data.Daemon;
      },
      { ...RETRY, label: "indexer", logger: deps.logger, signal: deps.signal, sleepFn: deps.sleepFn },
    );
    const out: DaemonTarget[] = [];
    for (const d of rows) {
      if (isAddress(d.id, { strict: false })) out.push({ account: getAddress(d.id), tokenId: BigInt(d.tokenId) });
    }
    yield out;
    if (rows.length < INDEXER_PAGE_SIZE) return;
  }
}

/** Backwards-compatible: all indexer rows as one array. */
export async function discoverFromIndexer(url: string, deps: DiscoveryDeps): Promise<DaemonTarget[]> {
  const out: DaemonTarget[] = [];
  for await (const page of indexerPages(url, deps)) out.push(...page);
  return out;
}

/**
 * pendingBounty() for every target via multicall3 (allowFailure).
 * An address without code (account not created yet) or not a Daemon fails to decode and is skipped.
 * pendingBounty() is only a pre-filter: send decisions use the simulated compoundMany result.
 */
export async function readBounties(
  targets: readonly DaemonTarget[],
  pageSize: number,
  deps: DiscoveryDeps,
): Promise<{ bounties: AccountBounty[]; live: number; skipped: number }> {
  const bounties: AccountBounty[] = [];
  let skipped = 0;
  for (const page of chunk(targets, pageSize)) {
    const res = await withRetry(
      () =>
        deps.client.multicall({
          allowFailure: true,
          contracts: page.map((t) => ({ address: t.account, abi: daemonAccountAbi, functionName: "pendingBounty" as const })),
        }),
      { ...RETRY, label: "pendingBounty", logger: deps.logger, signal: deps.signal, sleepFn: deps.sleepFn },
    );
    res.forEach((r, i) => {
      if (r.status === "success") bounties.push({ account: page[i].account, bounty: r.result as bigint });
      else skipped++;
    });
  }
  return { bounties, live: bounties.length, skipped };
}

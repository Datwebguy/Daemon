"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { zeroAddress } from "viem";
import { txUrl } from "@/lib/config";
import { errorMessage, fmtUnits, shortAddr, toBigIntSafe } from "@/lib/format";
import { useProtocol } from "@/lib/hooks";
import {
  FEED_QUERY,
  gql,
  indexerConfigured,
  LEADERBOARD_QUERY,
  type CompoundedRow,
  type DaemonRow,
  type DaemonUpdateRow,
  type HypedRow,
} from "@/lib/indexer";
import { moodOf } from "@/lib/mood";
import { ErrorBoundary } from "./ErrorBoundary";
import { Card, Empty, Loading, Notice, Pill } from "./ui";

type FeedItem =
  | ({ kind: "update" } & DaemonUpdateRow)
  | ({ kind: "compound" } & CompoundedRow)
  | ({ kind: "hype" } & HypedRow);

function order(a: FeedItem, b: FeedItem) {
  const ba = toBigIntSafe(a.blockNumber) ?? BigInt(0);
  const bb = toBigIntSafe(b.blockNumber) ?? BigInt(0);
  if (ba !== bb) return ba > bb ? -1 : 1;
  return (Number(b.logIndex) || 0) - (Number(a.logIndex) || 0);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
/** A row is usable only if its id/tokenId/blockNumber are well-formed and its amounts parse as integers. */
const okRow = (x: unknown, amountKeys: string[]): boolean =>
  isObj(x) &&
  typeof x.id === "string" &&
  toBigIntSafe(x.tokenId) !== undefined &&
  toBigIntSafe(x.blockNumber) !== undefined &&
  amountKeys.every((k) => toBigIntSafe(x[k]) !== undefined);

function FeedList() {
  const { asset, chog } = useProtocol();
  const dec = asset?.decimals ?? 18;
  const sym = asset?.symbol ?? "";
  const q = useQuery({
    queryKey: ["indexer-feed"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const d = await gql<{ DaemonUpdate: DaemonUpdateRow[]; Compounded: CompoundedRow[]; Hyped: HypedRow[] }>(FEED_QUERY, { limit: 30 });
      // Drop malformed rows up front so one bad indexer row can't break the whole feed.
      const items: FeedItem[] = [
        ...arr(d.DaemonUpdate).filter((x) => okRow(x, ["yieldAmount"])).map((x) => ({ kind: "update" as const, ...(x as DaemonUpdateRow) })),
        ...arr(d.Compounded).filter((x) => okRow(x, ["profit", "bounty"])).map((x) => ({ kind: "compound" as const, ...(x as CompoundedRow) })),
        ...arr(d.Hyped).filter((x) => okRow(x, ["amount"])).map((x) => ({ kind: "hype" as const, ...(x as HypedRow) })),
      ];
      return items.sort(order).slice(0, 50);
    },
  });

  if (q.isLoading) return <Loading label="Loading feed…" />;
  if (q.error) return <Notice tone="error" title="Indexer error">{errorMessage(q.error).slice(0, 240)}</Notice>;
  if (!q.data?.length) return <Empty emoji="🦗" title="Quiet so far">No Daemon activity indexed yet.</Empty>;

  return (
    <ul className="space-y-3">
      {q.data.map((it) => {
        const link = (
          <Link href={`/daemon/${it.tokenId}`} className="font-bold hover:underline">
            Chog #{it.tokenId}
          </Link>
        );
        let body;
        if (it.kind === "update") {
          const m = moodOf(it.mood);
          body = (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl">{m?.emoji ?? "💬"}</span> {link}
                {m && <Pill className={`${m.bg} ${m.text}`}>{m.name}</Pill>}
                {(toBigIntSafe(it.yieldAmount) ?? BigInt(0)) > BigInt(0) && (
                  <span className="text-sm text-emerald-600 tabular-nums dark:text-emerald-400">
                    +{fmtUnits(toBigIntSafe(it.yieldAmount), dec)} {sym}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm">“{String(it.message ?? "")}”</p>
            </>
          );
        } else if (it.kind === "compound") {
          body = (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-2xl">🔁</span> {link} compounded by <span className="font-mono">{shortAddr(String(it.caller ?? ""))}</span>: profit{" "}
              {fmtUnits(toBigIntSafe(it.profit), dec)} {sym}, bounty {fmtUnits(toBigIntSafe(it.bounty), dec)} {sym}
            </div>
          );
        } else {
          const isMon = String(it.token ?? "").toLowerCase() === zeroAddress;
          body = (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-2xl">⚡</span> {link} hyped by <span className="font-mono">{shortAddr(String(it.from ?? ""))}</span> with{" "}
              {fmtUnits(toBigIntSafe(it.amount), isMon ? 18 : (chog?.decimals ?? 18))} {isMon ? "MON" : `$${chog?.symbol ?? "CHOG"}`}
            </div>
          );
        }
        return (
          <li key={`${it.kind}-${it.id}`} className="rounded-2xl bg-muted px-4 py-3">
            <ErrorBoundary>{body}</ErrorBoundary>
            <div className="mt-1 text-xs text-dim">
              block {it.blockNumber}
              {typeof it.txHash === "string" && it.txHash && (
                <>
                  {" · "}
                  <a href={txUrl(it.txHash)} target="_blank" rel="noreferrer" className="hover:underline">
                    tx ↗
                  </a>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Leaderboard() {
  const { asset } = useProtocol();
  const q = useQuery({
    queryKey: ["indexer-leaderboard"],
    refetchInterval: 30_000,
    queryFn: async () =>
      arr((await gql<{ Daemon: unknown }>(LEADERBOARD_QUERY, { limit: 20 })).Daemon).filter(
        (x): x is DaemonRow => okRow(x, ["lifetimeYield"]) && isObj(x) && typeof x.tokenId !== "undefined",
      ),
  });
  if (q.isLoading) return <Loading label="Loading leaderboard…" />;
  if (q.error) return <Notice tone="error" title="Indexer error">{errorMessage(q.error).slice(0, 240)}</Notice>;
  if (!q.data?.length) return <Empty emoji="🏁" title="No Daemons ranked yet" />;
  return (
    <ol className="space-y-2">
      {q.data.map((d, i) => {
        const m = moodOf(d.mood);
        return (
          <li key={d.id}>
            <ErrorBoundary>
            <Link href={`/daemon/${d.tokenId}`} className="flex items-center gap-3 rounded-2xl bg-muted px-3 py-2 hover:ring-2 hover:ring-monad/40">
              <span className="w-6 text-center font-black text-dim">{i + 1}</span>
              <span className="text-xl">{m?.emoji ?? "🐸"}</span>
              <span className="font-bold">#{d.tokenId}</span>
              <span className="ml-auto text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                +{fmtUnits(toBigIntSafe(d.lifetimeYield), asset?.decimals ?? 18, 2)} {asset?.symbol ?? ""}
              </span>
            </Link>
            </ErrorBoundary>
          </li>
        );
      })}
    </ol>
  );
}

export function Feed() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Feed & Leaderboard</h1>
        <p className="mt-1 text-dim">What every Daemon is saying, who&apos;s compounding, who&apos;s hyping.</p>
      </div>
      {!indexerConfigured ? (
        <Empty emoji="🛰️" title="Indexer not configured">
          The feed and leaderboard read from a GraphQL indexer (Envio / Goldsky) because Monad&apos;s public RPC caps eth_getLogs at 100 to
          1,000 blocks. Set <code className="font-mono">NEXT_PUBLIC_INDEXER_URL</code> to enable this page. Individual Daemon pages work without it.
        </Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <Card title="📰 Live feed">
            <ErrorBoundary fallback={<Notice tone="error" title="Couldn't display the feed" />}>
              <FeedList />
            </ErrorBoundary>
          </Card>
          <Card title="🏆 Top yielders">
            <ErrorBoundary fallback={<Notice tone="error" title="Couldn't display the leaderboard" />}>
              <Leaderboard />
            </ErrorBoundary>
          </Card>
        </div>
      )}
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { zeroAddress } from "viem";
import { txUrl } from "@/lib/config";
import { fmtUnits, shortAddr, toBigIntSafe } from "@/lib/format";
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
import { ChogFace } from "@/components/ChogFace";
import { ErrorBoundary } from "./ErrorBoundary";
import { cx, Empty, Loading, Notice } from "./ui";

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
/** Only well-formed rows are shown, so one bad row can't break the page. */
const okRow = (x: unknown, amountKeys: string[]): boolean =>
  isObj(x) &&
  typeof x.id === "string" &&
  toBigIntSafe(x.tokenId) !== undefined &&
  toBigIntSafe(x.blockNumber) !== undefined &&
  amountKeys.every((k) => toBigIntSafe(x[k]) !== undefined);

/** Simple line icons for events that have no Chog expression of their own. */
function FeedGlyph({ kind }: { kind: "harvest" | "hype" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={kind === "hype" ? "var(--spark)" : "var(--mint)"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {kind === "hype" ? <path d="M13 3 5 14h6l-1 7 8-11h-6z" /> : <path d="M12 21V9m0 0c0-3 2-5 6-5 0 4-2 6-6 5Zm0 3c0-3-2-5-6-5 0 4 2 6 6 5Z" />}
    </svg>
  );
}

function FeedList() {
  const { asset, chog } = useProtocol();
  const dec = asset?.decimals ?? 18;
  const sym = asset?.symbol ?? "";
  const q = useQuery({
    queryKey: ["indexer-feed"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const d = await gql<{ DaemonUpdate: DaemonUpdateRow[]; Compounded: CompoundedRow[]; Hyped: HypedRow[] }>(FEED_QUERY, { limit: 30 });
      const items: FeedItem[] = [
        ...arr(d.DaemonUpdate).filter((x) => okRow(x, ["yieldAmount"])).map((x) => ({ kind: "update" as const, ...(x as DaemonUpdateRow) })),
        ...arr(d.Compounded).filter((x) => okRow(x, ["profit", "bounty"])).map((x) => ({ kind: "compound" as const, ...(x as CompoundedRow) })),
        ...arr(d.Hyped).filter((x) => okRow(x, ["amount"])).map((x) => ({ kind: "hype" as const, ...(x as HypedRow) })),
      ];
      return items.sort(order).slice(0, 50);
    },
  });

  if (q.isLoading) return <Loading label="Catching up on the latest…" />;
  if (q.error) return <Notice tone="error" title="Activity is taking a nap">We couldn&apos;t load the latest. It usually comes back in a moment.</Notice>;
  if (!q.data?.length) return <Empty title="Quiet so far">Nothing has happened yet. Be the first to hype or harvest a Daemon.</Empty>;

  return (
    <ul className="space-y-3">
      {q.data.map((it) => {
        const chogLink = (
          <Link href={`/daemon/${it.tokenId}`} className="font-bold hover:text-jelly">
            Chog #{it.tokenId}
          </Link>
        );
        let icon: React.ReactNode;
        let body: React.ReactNode;
        if (it.kind === "update") {
          const m = moodOf(it.mood);
          icon = <ChogFace mood={m?.id} seed={Number(it.tokenId) || 0} className="h-full w-full" />;
          const y = toBigIntSafe(it.yieldAmount) ?? BigInt(0);
          body = (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {chogLink}
                {m && <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", m.bg, m.text)}>{m.name}</span>}
                {y > BigInt(0) && <span className="font-semibold text-mint tabular-nums">+{fmtUnits(y, dec)} {sym}</span>}
              </div>
              <p className="mt-1.5 font-display text-lg font-semibold leading-snug">“{String(it.message ?? "")}”</p>
            </>
          );
        } else if (it.kind === "compound") {
          icon = <FeedGlyph kind="harvest" />;
          body = (
            <p className="text-sm">
              {chogLink} was harvested by <span className="font-semibold">{shortAddr(String(it.caller ?? ""))}</span>.{" "}
              <span className="text-mint">+{fmtUnits(toBigIntSafe(it.profit), dec)} {sym}</span> grown,{" "}
              <span className="text-spark">{fmtUnits(toBigIntSafe(it.bounty), dec)} tip</span>.
            </p>
          );
        } else {
          const isMon = String(it.token ?? "").toLowerCase() === zeroAddress;
          icon = <FeedGlyph kind="hype" />;
          body = (
            <p className="text-sm">
              <span className="font-semibold">{shortAddr(String(it.from ?? ""))}</span> hyped {chogLink} with{" "}
              <span className="font-semibold text-spark">
                {fmtUnits(toBigIntSafe(it.amount), isMon ? 18 : (chog?.decimals ?? 18))} {isMon ? "MON" : (chog?.symbol ?? "CHOG")}
              </span>
              .
            </p>
          );
        }
        return (
          <li key={`${it.kind}-${it.id}`} className="flex gap-3 rounded-[1.5rem] bg-surface-2/70 p-4" style={{ animation: "rise .4s ease both" }}>
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-surface" aria-hidden>
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <ErrorBoundary>{body}</ErrorBoundary>
              {typeof it.txHash === "string" && it.txHash && (
                <a href={txUrl(it.txHash)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-dim hover:text-fg">
                  View receipt
                </a>
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
  if (q.isLoading) return <Loading label="Tallying up…" />;
  if (q.error) return <Notice tone="error" title="The leaderboard is taking a nap">Try again in a moment.</Notice>;
  if (!q.data?.length) return <Empty title="No one on the board yet">Earn a harvest to claim the top spot.</Empty>;
  return (
    <ol className="space-y-2">
      {q.data.map((d, i) => {
        const m = moodOf(d.mood);
        return (
          <li key={d.id}>
            <ErrorBoundary>
              <Link href={`/daemon/${d.tokenId}`} className={cx("flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-surface-2", i < 3 && "bg-surface-2/70")}>
                <span className={cx("w-7 text-center font-display text-lg font-extrabold", i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-700" : "text-dim")}>
                  {i + 1}
                </span>
                <span className="h-9 w-9">
                  <ChogFace mood={d.mood} className="h-full w-full" />
                </span>
                <span className="font-semibold">#{d.tokenId}</span>
                {m && <span className="hidden text-xs text-dim sm:inline">{m.name}</span>}
                <span className="ml-auto font-display font-bold tabular-nums text-mint">
                  +{fmtUnits(toBigIntSafe(d.lifetimeYield), asset?.decimals ?? 18, 2)}
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
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold leading-none tracking-tight">Live activity</h1>
        <p className="mt-2 max-w-xl text-lg text-dim">What every Daemon is saying, who&apos;s harvesting, and who&apos;s hyping.</p>
      </header>
      {!indexerConfigured ? (
        <section className="clay relative overflow-hidden rounded-[2.5rem] px-6 py-14 text-center">
          <ChogFace mood={0} className="mx-auto h-40 w-40 animate-float" />
          <h2 className="mt-6 font-display text-3xl font-extrabold">The live feed is warming up</h2>
          <p className="mx-auto mt-2 max-w-md text-dim">Soon you&apos;ll see every harvest, hype and mood swing here as it happens. Meanwhile, every Daemon&apos;s own page is fully live.</p>
          <Link href="/explore" className="mt-7 inline-flex rounded-full bg-jelly px-6 py-3 font-semibold text-white">
            Visit a Daemon
          </Link>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <section className="clay rounded-[2rem] p-5 sm:p-6">
            <h2 className="mb-4 font-display text-xl font-bold">Happening now</h2>
            <ErrorBoundary fallback={<Notice tone="error" title="Couldn't show the feed" />}>
              <FeedList />
            </ErrorBoundary>
          </section>
          <section className="clay rounded-[2rem] p-5 sm:p-6 lg:sticky lg:top-24 lg:self-start">
            <h2 className="mb-4 font-display text-xl font-bold">Top earners</h2>
            <ErrorBoundary fallback={<Notice tone="error" title="Couldn't show the leaderboard" />}>
              <Leaderboard />
            </ErrorBoundary>
          </section>
        </div>
      )}
    </div>
  );
}

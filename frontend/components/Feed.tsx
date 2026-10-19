"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
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
import { PageHero } from "./app/PageHero";
import { STICKER_BTN } from "./app/color";
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
function FeedGlyph({ kind, className }: { kind: "harvest" | "hype"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("h-6 w-6", className)} fill="none" stroke="#1e1238" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
    <ul className="relative">
      {/* the thick timeline */}
      <span aria-hidden className="absolute bottom-0 left-6 top-2 w-[6px] -translate-x-1/2 rounded-full bg-[color:var(--st-line)]" />
      {q.data.map((it) => {
        const chogLink = (
          <Link href={`/daemon/${it.tokenId}`} className="font-bold underline-offset-4 hover:text-jelly hover:underline">
            Chog #{it.tokenId}
          </Link>
        );
        let icon: ReactNode;
        let body: ReactNode;
        let tint = "var(--st-bg)";
        if (it.kind === "update") {
          const m = moodOf(it.mood);
          icon = <ChogFace mood={m?.id} seed={Number(it.tokenId) || 0} className="h-full w-full" />;
          const y = toBigIntSafe(it.yieldAmount) ?? BigInt(0);
          body = (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {chogLink}
                {m && <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", m.bg, m.text)}>{m.name}</span>}
                {y > BigInt(0) && (
                  <span className="font-bold tabular-nums text-emerald-700 dark:text-mint">
                    +{fmtUnits(y, dec)} {sym}
                  </span>
                )}
              </div>
              <p className="mt-1.5 font-display text-lg leading-snug">“{String(it.message ?? "")}”</p>
            </>
          );
        } else if (it.kind === "compound") {
          tint = "color-mix(in oklab, var(--mint) 26%, var(--st-bg))";
          icon = (
            <span className="grid h-full w-full place-items-center rounded-full bg-mint">
              <FeedGlyph kind="harvest" />
            </span>
          );
          body = (
            <p className="text-sm">
              {chogLink} was harvested by <span className="font-semibold">{shortAddr(String(it.caller ?? ""))}</span>.{" "}
              <span className="font-bold text-emerald-700 dark:text-mint">
                +{fmtUnits(toBigIntSafe(it.profit), dec)} {sym}
              </span>{" "}
              grown, <span className="font-bold text-orange-700 dark:text-spark">{fmtUnits(toBigIntSafe(it.bounty), dec)} tip</span>.
            </p>
          );
        } else {
          tint = "color-mix(in oklab, var(--butter) 40%, var(--st-bg))";
          const isMon = String(it.token ?? "").toLowerCase() === zeroAddress;
          icon = (
            <span className="grid h-full w-full place-items-center rounded-full bg-butter">
              <FeedGlyph kind="hype" />
            </span>
          );
          body = (
            <p className="text-sm">
              <span className="font-semibold">{shortAddr(String(it.from ?? ""))}</span> hyped {chogLink} with{" "}
              <span className="font-bold text-orange-700 dark:text-spark">
                {fmtUnits(toBigIntSafe(it.amount), isMon ? 18 : (chog?.decimals ?? 18))} {isMon ? "MON" : (chog?.symbol ?? "CHOG")}
              </span>
              .
            </p>
          );
        }
        return (
          <li key={`${it.kind}-${it.id}`} className="relative pb-6 pl-[4.25rem] last:pb-0" style={{ animation: "rise .4s ease both" }}>
            <span
              className="absolute left-0 top-0 grid h-12 w-12 place-items-center overflow-hidden rounded-full border-[3px] border-[color:var(--st-line)] bg-[var(--surface)] shadow-[2px_2px_0_var(--st-shadow)]"
              aria-hidden
            >
              {icon}
            </span>
            <div className="stk relative !rounded-2xl px-4 py-3" style={{ background: tint }}>
              {/* speech-bubble tail */}
              <span aria-hidden className="absolute -left-[10px] top-4 h-[17px] w-[17px] rotate-45 border-b-[3px] border-l-[3px] border-[color:var(--st-line)] [background:inherit]" />
              <div className="relative">
                <ErrorBoundary>{body}</ErrorBoundary>
                {typeof it.txHash === "string" && it.txHash && (
                  <a href={txUrl(it.txHash)} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs font-semibold text-dim underline-offset-4 hover:text-fg hover:underline">
                    View receipt
                  </a>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const PODIUM = [
  { rank: 1, fill: "bg-butter", block: "h-28", face: "h-20 w-20 sm:h-24 sm:w-24" },
  { rank: 2, fill: "bg-sky", block: "h-20", face: "h-16 w-16 sm:h-20 sm:w-20" },
  { rank: 3, fill: "bg-pink", block: "h-14", face: "h-14 w-14 sm:h-16 sm:w-16" },
] as const;

function Leaderboard() {
  const { asset } = useProtocol();
  const q = useQuery({
    queryKey: ["indexer-leaderboard"],
    refetchInterval: 30_000,
    queryFn: async () =>
      arr((await gql<{ Daemon: unknown }>(LEADERBOARD_QUERY, { limit: 20 })).Daemon).filter(
        // Daemon rows carry no block number, so check just the fields the board uses.
        (x): x is DaemonRow => isObj(x) && typeof x.id === "string" && toBigIntSafe(x.tokenId) !== undefined && toBigIntSafe(x.lifetimeYield) !== undefined,
      ),
  });
  if (q.isLoading) return <Loading label="Tallying up…" />;
  if (q.error) return <Notice tone="error" title="The leaderboard is taking a nap">Try again in a moment.</Notice>;
  if (!q.data?.length) return <Empty title="No one on the board yet">Earn a harvest to claim the top spot.</Empty>;

  const earned = (d: DaemonRow) => `+${fmtUnits(toBigIntSafe(d.lifetimeYield), asset?.decimals ?? 18, 2)}`;
  const top = q.data.slice(0, 3);
  const rest = q.data.slice(3);
  // silver on the left, gold in the middle, bronze on the right
  const stage = [1, 0, 2].filter((i) => top[i]).map((i) => ({ d: top[i]!, p: PODIUM[i]! }));

  return (
    <div>
      <ol className="flex items-end justify-center" aria-label="Top three">
        {stage.map(({ d, p }) => (
          <li key={d.id} className={cx("min-w-0 flex-1", p.rank !== 1 && "max-w-[34%]")}>
            <ErrorBoundary>
              <Link href={`/daemon/${d.tokenId}`} className="group flex flex-col items-center text-center focus-visible:outline-offset-0">
                <ChogFace mood={d.mood} seed={Number(d.tokenId) || 0} className={cx("transition-transform duration-300 group-hover:-translate-y-1.5 group-hover:-rotate-3", p.face)} />
                <span className="mt-2 font-display text-base leading-none sm:text-lg">#{d.tokenId}</span>
                <span className="mb-2 mt-1 max-w-full truncate text-xs font-bold tabular-nums text-emerald-700 dark:text-mint">{earned(d)}</span>
                <span className={cx("stk grid w-full place-items-center !rounded-b-none !rounded-t-xl text-[#1e1238]", p.fill, p.block)}>
                  <span className="font-display text-3xl leading-none sm:text-5xl">{p.rank}</span>
                </span>
              </Link>
            </ErrorBoundary>
          </li>
        ))}
      </ol>
      {/* podium floor */}
      <div aria-hidden className="h-[6px] rounded-full bg-[color:var(--st-line)]" />

      {rest.length > 0 && (
        <ol start={4} className="mt-5 divide-y-2 divide-dashed divide-[color:var(--st-line)]/20">
          {rest.map((d, i) => {
            const m = moodOf(d.mood);
            return (
              <li key={d.id}>
                <ErrorBoundary>
                  <Link href={`/daemon/${d.tokenId}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-jelly/10">
                    <span className="w-6 text-center font-display text-lg text-dim">{i + 4}</span>
                    <ChogFace mood={d.mood} seed={Number(d.tokenId) || 0} className="h-9 w-9 shrink-0" />
                    <span className="font-semibold">#{d.tokenId}</span>
                    {m && <span className="hidden text-xs text-dim sm:inline">{m.name}</span>}
                    <span className="ml-auto font-display tabular-nums text-emerald-700 dark:text-mint">{earned(d)}</span>
                  </Link>
                </ErrorBoundary>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function SectionTag({ tone, children, live }: { tone: string; children: ReactNode; live?: boolean }) {
  return (
    <h2 className="stk mb-6 inline-flex -rotate-1 items-center gap-2.5 !rounded-xl px-4 py-1.5 font-display text-xl text-[#1e1238]" style={{ background: `var(${tone})` }}>
      {live && <span aria-hidden className="live-dot h-2.5 w-2.5 rounded-full border-2 border-[#1e1238] bg-pink" />}
      {children}
    </h2>
  );
}

export function Feed() {
  return (
    <div>
      <PageHero tone="--sky" kicker="Right now" title="Live activity" face={{ mood: 3, seed: 6 }}>
        What every Daemon is saying, who&apos;s harvesting, and who&apos;s hyping.
      </PageHero>

      {!indexerConfigured ? (
        <section className="relative overflow-hidden px-4 py-8 sm:px-6 sm:py-14 lg:px-10">
          <div className="mx-auto grid max-w-4xl items-center gap-5 sm:gap-8 sm:grid-cols-[auto_1fr]">
            <ChogFace mood={0} className="animate-float mx-auto h-28 w-28 -rotate-3 sm:h-52 sm:w-52" />
            <div className="stk relative p-5 sm:p-8">
              <span aria-hidden className="absolute -left-[11px] top-12 hidden h-5 w-5 rotate-45 border-b-[3px] border-l-[3px] border-[color:var(--st-line)] [background:inherit] sm:block" />
              <h2 className="font-display text-2xl leading-tight sm:text-4xl">The live feed is warming up</h2>
              <p className="mt-2 max-w-md text-sm text-dim sm:mt-3 sm:text-base">
                Soon you&apos;ll see every harvest, hype and mood swing here as it happens. Meanwhile, every Daemon&apos;s own page is fully live.
              </p>
              <Link href="/explore" className={cx("mt-5 inline-flex items-center rounded-full bg-jelly px-5 py-2.5 text-sm font-semibold sm:mt-6 sm:px-6 sm:py-3 sm:text-base text-white transition hover:bg-jelly-deep", STICKER_BTN)}>
                Visit a Daemon
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid gap-8 px-4 py-6 sm:gap-12 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16 lg:px-10">
          <section aria-label="Happening now" className="min-w-0">
            <SectionTag tone="--sky" live>
              Happening now
            </SectionTag>
            <ErrorBoundary fallback={<Notice tone="error" title="Couldn't show the feed" />}>
              <FeedList />
            </ErrorBoundary>
          </section>
          <section aria-label="Top earners" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <SectionTag tone="--butter">Top earners</SectionTag>
            <div className="stk p-4 pt-8 sm:p-6 sm:pt-10">
              <ErrorBoundary fallback={<Notice tone="error" title="Couldn't show the leaderboard" />}>
                <Leaderboard />
              </ErrorBoundary>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

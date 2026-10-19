"use client";

import Link from "next/link";
import { fmtUnits } from "@/lib/format";
import { useChog, useDaemonAddress, useDaemonSummary, useProtocol, useSlowNow } from "@/lib/hooks";
import { moodOf } from "@/lib/mood";
import { useInView } from "@/lib/useInView";
import { inkOn } from "./app/color";
import { ChogImage } from "./ChogImage";
import { ChogFace } from "@/components/ChogFace";
import { cx, Spinner } from "./ui";

/** Trading-card tile. Lazy: shows a blank card (and makes no network calls) until scrolled near the viewport. */
export function ChogCard({ tokenId }: { tokenId: bigint }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return <div ref={ref}>{seen ? <ChogCardBody tokenId={tokenId} /> : <div className="stk aspect-[3/4] animate-pulse !rounded-[1.25rem] !bg-surface-2 opacity-60" />}</div>;
}

function ChogCardBody({ tokenId }: { tokenId: bigint }) {
  const chog = useChog(tokenId, { live: false });
  const daemon = useDaemonAddress(tokenId, { live: false });
  const state = useDaemonSummary(daemon.address, daemon.deployed);
  const { asset } = useProtocol();
  const m = moodOf(state.mood);
  const now = useSlowNow();
  const boosted = state.boostExpiresAt !== undefined ? Number(state.boostExpiresAt) > now : false;
  // cards lean a little, alternating, so a grid feels hand-placed
  const lean = Number(tokenId % BigInt(2)) === 0 ? "-rotate-[1.4deg]" : "rotate-[1.4deg]";

  if (chog.exists === false) {
    return (
      <div className="stk grid aspect-[3/4] place-items-center !rounded-[1.25rem] border-dashed p-4 text-center text-sm text-dim">
        Chog #{tokenId.toString()} hasn&apos;t been minted yet.
      </div>
    );
  }
  const need = daemon.deployed ? needsYou(state, now) : undefined;
  const cardMood = daemon.deployed ? state.mood : undefined;
  const tabColor = daemon.deployed && m ? m.hex : undefined;
  const tabLabel = daemon.isLoading || chog.isLoading ? null : !daemon.deployed ? "Asleep" : (m?.name ?? null);
  return (
    <Link
      href={`/daemon/${tokenId.toString()}`}
      className={cx(
        "group block rounded-[1.25rem] transition-[rotate,translate] duration-300 ease-[cubic-bezier(.3,1.5,.5,1)] hover:-translate-y-2 hover:rotate-0 focus-visible:-translate-y-2 focus-visible:rotate-0",
        lean,
      )}
    >
      <div className="stk overflow-hidden !rounded-[1.25rem] transition-shadow duration-300 group-hover:shadow-[8px_9px_0_var(--st-shadow)]">
        {/* colour tab: the Daemon's mood */}
        <div
          className={cx("flex items-center justify-between gap-2 border-b-[3px] border-[color:var(--st-line)] px-3 py-1.5", !tabColor && "tape-bg bg-surface-2 text-fg")}
          style={tabColor ? { background: tabColor, color: inkOn(tabColor) } : undefined}
        >
          <span className="font-display text-lg leading-none">#{tokenId.toString()}</span>
          {tabLabel ? <span className="text-[11px] font-bold uppercase tracking-wider">{tabLabel}</span> : <Spinner className="h-4 w-4" />}
        </div>

        <div className="p-2">
          <div
            className="relative aspect-square overflow-hidden rounded-xl border-[3px] border-[color:var(--st-line)]"
            style={{ background: `radial-gradient(70% 70% at 50% 40%, ${m?.hex ?? "#b9a6fa"}55, var(--surface-2))` }}
          >
            <ChogImage
              srcs={chog.images}
              alt={chog.realName ?? `Chog #${tokenId.toString()}`}
              className="group-hover:scale-105"
              overlay={
                <div
                  className="absolute bottom-2 left-2 h-12 w-12 overflow-hidden rounded-full border-[3px] border-[#1e1238] shadow-[2px_2px_0_#1e1238]"
                  style={{ background: `radial-gradient(circle at 50% 40%, ${m?.hex ?? "#a8a3b8"}88, var(--surface))` }}
                >
                  <ChogFace mood={cardMood} boosted={boosted} className="h-full w-full p-0.5" />
                </div>
              }
              fallback={<ChogFace mood={cardMood} className="h-full w-full p-4" />}
            />
            {boosted && (
              <span className="absolute right-2 top-2 -rotate-6 rounded-md border-2 border-[#1e1238] bg-pink px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#1e1238] shadow-[2px_2px_0_#1e1238]">
                Boosted
              </span>
            )}
          </div>
          <div className="px-1 pb-1 pt-2.5">
            {daemon.deployed ? (
              <>
                <div className="truncate font-display text-xl leading-none tabular-nums">{fmtUnits(state.totalAssets, asset?.decimals ?? 18, 2)}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-dim">{asset?.symbol ?? ""} saved</div>
                {need && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-pink/25 px-2 py-1 text-[11px] font-extrabold leading-none">
                    <i aria-hidden className="live-dot h-2 w-2 shrink-0 rounded-full border border-[#1e1238] bg-pink" />
                    <span className="truncate">{need}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="font-display text-lg leading-none">Fast asleep</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-dim">Tap to wake it up</div>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** The one thing a holder should know about their Daemon right now (undefined = all good). */
function needsYou(
  s: { mood?: number; boostExpiresAt?: bigint; nextCompoundAt?: bigint; pendingProfit?: bigint; totalAssets?: bigint },
  now: number,
): string | undefined {
  if (s.mood === 4) return "Needs you";
  const boostLeft = s.boostExpiresAt !== undefined ? Number(s.boostExpiresAt) - now : 0;
  if (boostLeft > 0 && boostLeft < 3600) return "Boost ends soon";
  const ready = s.nextCompoundAt !== undefined && Number(s.nextCompoundAt) <= now;
  if (ready && (s.pendingProfit ?? BigInt(0)) > BigInt(0) && (s.totalAssets ?? BigInt(0)) > BigInt(0)) return "Ready to harvest";
  return undefined;
}

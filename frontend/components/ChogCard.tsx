"use client";

import Link from "next/link";
import { fmtUnits } from "@/lib/format";
import { useChog, useDaemonAddress, useDaemonSummary, useProtocol, useSlowNow } from "@/lib/hooks";
import { moodOf } from "@/lib/mood";
import { useInView } from "@/lib/useInView";
import { Creature } from "./creature/Creature";
import { cx, Spinner } from "./ui";

/** Lazy: renders a placeholder (and makes no network calls) until scrolled near the viewport. */
export function ChogCard({ tokenId }: { tokenId: bigint }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return <div ref={ref}>{seen ? <ChogCardBody tokenId={tokenId} /> : <div className="clay-sunk aspect-[4/5] rounded-[1.75rem]" />}</div>;
}

function ChogCardBody({ tokenId }: { tokenId: bigint }) {
  const chog = useChog(tokenId, { live: false });
  const daemon = useDaemonAddress(tokenId, { live: false });
  const state = useDaemonSummary(daemon.address, daemon.deployed);
  const { asset } = useProtocol();
  const m = moodOf(state.mood);
  const now = useSlowNow();
  const boosted = state.boostExpiresAt !== undefined ? Number(state.boostExpiresAt) > now : false;

  if (chog.exists === false) {
    return (
      <div className="clay-sunk grid aspect-[4/5] place-items-center rounded-[1.75rem] p-4 text-center text-sm text-dim">
        Chog #{tokenId.toString()} hasn&apos;t been minted yet.
      </div>
    );
  }
  const image = chog.metadata?.image;
  return (
    <Link
      href={`/daemon/${tokenId.toString()}`}
      className="clay group block overflow-hidden rounded-[1.75rem] p-2.5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_50px_-24px_var(--glow)]"
    >
      <div
        className="relative aspect-square overflow-hidden rounded-[1.35rem]"
        style={{ background: `radial-gradient(70% 70% at 50% 40%, ${m?.hex ?? "#b9a6fa"}55, var(--surface-2))` }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={`Chog #${tokenId.toString()}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <Creature mood={daemon.deployed ? state.mood : undefined} className="h-full w-full p-4" />
        )}
        {boosted && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-spark px-2.5 py-1 text-[11px] font-bold text-white shadow">⚡ Boosted</span>
        )}
      </div>
      <div className="px-2 pb-1.5 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-lg font-bold">#{tokenId.toString()}</span>
          {daemon.isLoading || chog.isLoading ? (
            <Spinner className="h-4 w-4 text-dim" />
          ) : !daemon.deployed ? (
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-dim">Asleep</span>
          ) : m ? (
            <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold", m.bg, m.text)}>
              {m.emoji} {m.name}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-sm text-dim tabular-nums">
          {daemon.deployed ? `${fmtUnits(state.totalAssets, asset?.decimals ?? 18, 2)} ${asset?.symbol ?? ""} saved` : "Tap to wake it up"}
        </div>
      </div>
    </Link>
  );
}

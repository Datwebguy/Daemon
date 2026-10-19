"use client";

import Link from "next/link";
import { useInView } from "@/lib/useInView";
import { useChog, useDaemonAddress, useDaemonSummary, useProtocol, useSlowNow } from "@/lib/hooks";
import { fmtUnits } from "@/lib/format";
import { moodOf } from "@/lib/mood";
import { DaemonAvatar } from "./DaemonAvatar";
import { Pill, Spinner } from "./ui";

/** Lazy: renders a placeholder (and makes no RPC calls) until scrolled near the viewport. */
export function ChogCard({ tokenId }: { tokenId: bigint }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return <div ref={ref}>{seen ? <ChogCardBody tokenId={tokenId} /> : <div className="aspect-[4/5] rounded-3xl border border-line bg-muted/40" />}</div>;
}

function ChogCardBody({ tokenId }: { tokenId: bigint }) {
  // live=false: cards poll slowly; only the active Daemon page polls every 10s.
  const chog = useChog(tokenId, { live: false });
  const daemon = useDaemonAddress(tokenId, { live: false });
  const state = useDaemonSummary(daemon.address, daemon.deployed);
  const { asset } = useProtocol();
  const m = moodOf(state.mood);
  const now = useSlowNow();
  const boosted = state.boostExpiresAt !== undefined ? Number(state.boostExpiresAt) > now : false;
  if (chog.exists === false) {
    return (
      <div className="rounded-3xl border border-dashed border-line p-4 text-center text-sm text-dim">Chog #{tokenId.toString()} isn&apos;t minted yet.</div>
    );
  }
  return (
    <Link
      href={`/daemon/${tokenId.toString()}`}
      className="group block rounded-3xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-monad/60 hover:shadow-lg hover:shadow-monad/10"
    >
      <DaemonAvatar image={chog.metadata?.image} mood={state.mood} size="sm" boosted={boosted} />
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="font-bold">Chog #{tokenId.toString()}</div>
        {daemon.isLoading || chog.isLoading ? (
          <Spinner className="h-4 w-4" />
        ) : !daemon.deployed ? (
          <Pill className="bg-muted text-dim">Not activated</Pill>
        ) : m ? (
          <Pill className={`${m.bg} ${m.text}`}>{m.name}</Pill>
        ) : null}
      </div>
      {daemon.deployed && (
        <div className="mt-1 text-sm text-dim tabular-nums">
          {fmtUnits(state.totalAssets, asset?.decimals ?? 18, 2)} {asset?.symbol ?? ""} managed
        </div>
      )}
    </Link>
  );
}

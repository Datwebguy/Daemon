"use client";

import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { daemonAccountAbi } from "@/lib/abis";
import { CHAIN_ID, LOG_BLOCK_RANGE } from "@/lib/config";
import { fmtUnits } from "@/lib/format";
import { gql, indexerConfigured, LAST_UPDATE_QUERY, type DaemonUpdateRow } from "@/lib/indexer";
import { moodOf } from "@/lib/mood";
import { ChogFace } from "@/components/ChogFace";
import { ChogImage } from "@/components/ChogImage";
import { StickerButton } from "./bits";
import { StickerDialog } from "./StickerDialog";
import type { DaemonCtx } from "./types";

/** Last harvest amount: from the activity index if available, else recent history. */
function useLastYield(account: Address, tokenId: bigint, enabled: boolean) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["last-yield", account, tokenId.toString()],
    enabled: enabled && Boolean(client),
    staleTime: 30_000,
    queryFn: async (): Promise<bigint | null> => {
      if (indexerConfigured) {
        try {
          const d = await gql<{ DaemonUpdate: DaemonUpdateRow[] }>(LAST_UPDATE_QUERY, { tokenId: tokenId.toString() });
          const row = d.DaemonUpdate[0];
          if (row) return BigInt(row.yieldAmount);
        } catch {
          /* fall back to recent history */
        }
      }
      if (!client) return null;
      const latest = await client.getBlockNumber();
      const logs = await client.getLogs({
        address: account,
        event: getAbiItem({ abi: daemonAccountAbi, name: "DaemonUpdate" }),
        fromBlock: latest > LOG_BLOCK_RANGE ? latest - LOG_BLOCK_RANGE : BigInt(0),
        toBlock: latest,
      });
      return logs[logs.length - 1]?.args.yieldAmount ?? null;
    },
  });
}

export function ShareButton({ ctx, images, bar }: { ctx: DaemonCtx; images?: readonly string[]; bar?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {bar ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="sticker squish flex w-full items-center justify-between gap-3 !rounded-2xl px-5 py-4 text-left"
          style={{ background: "var(--butter)" }}
        >
          <span>
            <span className="block font-display text-xl leading-none sm:text-2xl">Show it off</span>
            <span className="mt-1 block text-xs font-bold opacity-80 sm:text-sm">Get a card of this Daemon and post it on X</span>
          </span>
          <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
          </svg>
        </button>
      ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sticker squish relative z-10 inline-flex rotate-3 items-center gap-1.5 !rounded-full px-3.5 py-2 text-sm font-extrabold !shadow-[3px_3px_0_var(--st-shadow)]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </svg>
        Share
      </button>
      )}
      <StickerDialog open={open} onClose={() => setOpen(false)} title="Show it off" wide>
        {open && <ShareCard ctx={ctx} images={images} />}
      </StickerDialog>
    </>
  );
}

/** The saved picture always uses fixed colours, so it looks the same whatever theme you are in. */
const INK = "#1e1238";

/** A ready-to-post X link: what the Daemon is doing, plus a link anyone can open to hype it. */
function xPostUrl(tokenId: bigint, mood: string | undefined, yieldLine: string): string {
  const link = typeof window !== "undefined" ? `${window.location.origin}/daemon/${tokenId.toString()}` : "";
  const text = `My Chog #${tokenId.toString()} is feeling ${mood ? mood.toLowerCase() : "sleepy"} and its Daemon is working while I'm not. ${yieldLine}. Come hype it:`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
}

function ShareCard({ ctx, images }: { ctx: DaemonCtx; images?: readonly string[] }) {
  const { tokenId, account, deployed, state, protocol } = ctx;
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const lastYield = useLastYield(account, tokenId, deployed);
  const m = moodOf(state.mood);
  const hex = m?.hex ?? "#8b5cf6";
  const dec = protocol.asset?.decimals ?? 18;
  const sym = protocol.asset?.symbol ?? "";
  const yieldLine =
    lastYield.data !== undefined && lastYield.data !== null
      ? `+${fmtUnits(lastYield.data, dec)} ${sym} last harvest`
      : `+${fmtUnits(state.lifetimeYield, dec)} ${sym} earned so far`;

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `daemon-chog-${tokenId.toString()}.png`;
      a.click();
    } catch {
      toast.error("Couldn't make the image", { description: "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const edge = { border: `4px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}`, color: INK } as const;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border-4 border-[var(--st-line)]">
        <div
          ref={ref}
          className="relative p-3.5 sm:p-5"
          style={{
            background: `radial-gradient(60% 70% at 18% 12%, rgba(255,255,255,.5), transparent 70%), linear-gradient(150deg, color-mix(in oklab, ${hex} 62%, white), ${hex} 55%, color-mix(in oklab, ${hex} 75%, ${INK}))`,
          }}
        >
          <div aria-hidden className="absolute inset-0" style={{ backgroundImage: `radial-gradient(rgba(30,18,56,.16) 1.4px, transparent 1.6px)`, backgroundSize: "20px 20px" }} />
          <div className="relative flex aspect-[1.6] w-full gap-3 sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div className="space-y-2">
                <div className="inline-block -rotate-2 rounded-lg bg-white px-2.5 py-1 text-xs font-extrabold sm:text-sm" style={edge}>
                  Chog #{tokenId.toString()}
                </div>
                <div className="block w-fit -rotate-1 rounded-xl px-3 py-1 font-display text-3xl leading-none sm:text-5xl" style={{ ...edge, background: "#ffd84d" }}>
                  {m?.name ?? "Asleep"}
                </div>
                <div className="block w-fit max-w-full rotate-1 rounded-lg px-2.5 py-1 font-display text-sm leading-tight sm:text-lg" style={{ ...edge, background: "#4be3b0" }}>
                  {yieldLine}
                </div>
              </div>
              <div>
                <div className="rounded-xl bg-white px-3 py-2 font-display text-sm leading-snug sm:text-lg" style={edge}>
                  “{state.lastMessage || "gm. I'm a Daemon now."}”
                </div>
                <div className="mt-2 text-xs font-extrabold sm:text-sm" style={{ color: INK }}>
                  daemon · on Monad
                </div>
              </div>
            </div>
            <div className="flex w-[40%] shrink-0 items-center justify-center">
              <div className="relative aspect-square w-full rotate-3 overflow-hidden rounded-2xl bg-white" style={{ ...edge, border: `5px solid ${INK}`, boxShadow: `8px 8px 0 ${INK}` }}>
                <ChogImage
                  srcs={images ?? []}
                  alt={`Chog #${tokenId.toString()}`}
                  eager
                  fallback={<ChogFace mood={state.mood} className="h-full w-full" />}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-2">
        <StickerButton tone="jelly" size="lg" className="w-full" onClick={download} loading={busy}>
          Save image
        </StickerButton>
        <a href={xPostUrl(tokenId, m?.name, yieldLine)} target="_blank" rel="noreferrer" className="dm-btn dm-btn-lg dm-t-butter w-full font-display">
          Post on X
        </a>
      </div>
      <p className="mt-2 text-center text-xs text-dim">Save the picture first and attach it to your post.</p>
    </div>
  );
}

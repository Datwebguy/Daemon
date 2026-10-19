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
import { Button, Dialog } from "../ui";
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

export function ShareButton({ ctx, image }: { ctx: DaemonCtx; image?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </svg>
        Share
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Show it off" wide>
        {open && <ShareCard ctx={ctx} image={image} />}
      </Dialog>
    </>
  );
}

function ShareCard({ ctx, image }: { ctx: DaemonCtx; image?: string }) {
  const { tokenId, account, deployed, state, protocol } = ctx;
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const lastYield = useLastYield(account, tokenId, deployed);
  const m = moodOf(state.mood);
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

  return (
    <div>
      <div className="overflow-hidden rounded-[1.75rem]">
        <div
          ref={ref}
          className="relative flex aspect-[1.6] w-full flex-col justify-between overflow-hidden p-6 text-white sm:p-8"
          style={{ background: `radial-gradient(90% 120% at 85% 20%, ${m?.hex ?? "#7a5af0"}, #5134c9 55%, #1e1238)` }}
        >
          <div className="absolute -right-4 -bottom-6 h-[78%] w-[52%]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" crossOrigin="anonymous" className="h-full w-full rounded-[1.5rem] object-cover shadow-2xl" />
            ) : (
              <ChogFace mood={state.mood} className="h-full w-full" />
            )}
          </div>
          <div className="relative max-w-[55%]">
            <div className="text-sm font-semibold text-white/75">Chog #{tokenId.toString()}</div>
            <div className="mt-1 font-display text-4xl font-extrabold leading-none sm:text-5xl">
              {m?.name ?? "Asleep"}
            </div>
            <div className="mt-3 font-display text-lg font-bold tabular-nums">{yieldLine}</div>
          </div>
          <div className="relative max-w-[55%]">
            <div className="font-display text-lg font-semibold leading-snug">“{state.lastMessage || "gm. I'm a Daemon now."}”</div>
            <div className="mt-4 text-sm font-bold">daemon · on Monad</div>
          </div>
        </div>
      </div>
      <Button className="mt-5 w-full" size="lg" onClick={download} loading={busy}>
        Save image
      </Button>
    </div>
  );
}

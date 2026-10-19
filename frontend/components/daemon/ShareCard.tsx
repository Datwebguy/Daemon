"use client";

import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { daemonAccountAbi } from "@/lib/abis";
import { CHAIN_ID, LOG_BLOCK_RANGE } from "@/lib/config";
import { errorMessage, fmtUnits } from "@/lib/format";
import { gql, indexerConfigured, LAST_UPDATE_QUERY, type DaemonUpdateRow } from "@/lib/indexer";
import { moodOf } from "@/lib/mood";
import { Button, Card } from "../ui";
import type { DaemonCtx } from "./types";

/** Last DaemonUpdate.yieldAmount: indexer first, else a small recent log window. */
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
          /* fall back to logs */
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
      const last = logs[logs.length - 1];
      return last?.args.yieldAmount ?? null;
    },
  });
}

export function ShareCard({ ctx, image }: { ctx: DaemonCtx; image?: string }) {
  const { tokenId, account, deployed, state, protocol } = ctx;
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const lastYield = useLastYield(account, tokenId, deployed);
  const m = moodOf(state.mood);
  const dec = protocol.asset?.decimals ?? 18;
  const sym = protocol.asset?.symbol ?? "";

  const yieldLine =
    lastYield.data !== undefined && lastYield.data !== null
      ? `Last yield: +${fmtUnits(lastYield.data, dec)} ${sym}`
      : `Lifetime yield: +${fmtUnits(state.lifetimeYield, dec)} ${sym}`;

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `daemon-chog-${tokenId.toString()}.png`;
      a.click();
    } catch (e) {
      toast.error("Couldn't render the card", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="📸 Share card">
      <div className="overflow-hidden rounded-3xl">
        <div
          ref={ref}
          style={{ background: `linear-gradient(135deg, #2f2370 0%, #836ef9 55%, ${m?.hex ?? "#836ef9"} 100%)` }}
          className="flex w-full flex-col gap-4 p-6 text-white"
        >
          <div className="flex items-center gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-white/15">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-5xl">{m?.emoji ?? "🐸"}</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm opacity-80">Chog #{tokenId.toString()}</div>
              <div className="text-3xl font-black">
                {m?.emoji} {m?.name ?? "Dormant"}
              </div>
              <div className="text-sm font-semibold tabular-nums">{yieldLine}</div>
            </div>
          </div>
          <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm">“{state.lastMessage || "gm. I'm a Daemon now."}”</div>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest opacity-90">
            <span>😈 Daemon on Monad</span>
            <span>testnet · 10143</span>
          </div>
        </div>
      </div>
      <Button variant="secondary" className="mt-4 w-full" onClick={download} loading={busy}>
        Download PNG
      </Button>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi } from "@/lib/abis";
import { CHAIN_ID } from "@/lib/config";
import { fmtUnits } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { Spinner } from "../ui";
import { StickerButton } from "./bits";
import { StickerDialog } from "./StickerDialog";
import type { DaemonCtx } from "./types";

const LABEL = "Take everything out";

/** Holder only: empties every vault and sends it all, plus the hype jar, to the holder's wallet. */
export function SweepPanel({ ctx }: { ctx: DaemonCtx }) {
  const { account, deployed, user, isOwner, protocol, state } = ctx;
  const [open, setOpen] = useState(false);
  const { run, pending } = useTx();
  if (!isOwner || !deployed || !user) return null;
  const sym = protocol.asset?.symbol ?? "";

  const sweep = async () => {
    const r = await run(
      LABEL,
      async (config) => {
        const { request } = await simulateContract(config, {
          address: account,
          abi: daemonAccountAbi,
          functionName: "sweepToOwner",
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      },
      { done: "Everything is in your wallet" },
    );
    if (r?.status === "success") setOpen(false);
  };

  return (
    <section className="dm-tear" aria-label="Take everything out">
      <button type="button" className="dm-tear-btn" onClick={() => setOpen(true)} disabled={pending === LABEL}>
        <span className="min-w-0">
          <span className="block font-display text-xl leading-tight sm:text-2xl">Take everything out</span>
          <span className="mt-0.5 block max-w-md text-sm text-dim">
            Empty every vault and the hype jar straight into your wallet. Always available to you, no questions asked.
          </span>
        </span>
        <span className="dm-tab" aria-hidden>
          {pending === LABEL ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          )}
          Pull
        </span>
      </button>

      <StickerDialog open={open} onClose={() => setOpen(false)} title="Take everything out?">
        <div className="space-y-2 rounded-2xl border-[3px] border-dashed border-[var(--st-line)] p-4 text-sm">
          <Row k="Savings" v={`about ${fmtUnits(state.totalAssets, protocol.asset?.decimals ?? 18)} ${sym}`} />
          <Row
            k="Hype jar"
            v={`${fmtUnits(state.boost?.potMon, 18)} MON${protocol.chog ? ` + ${fmtUnits(state.boost?.potChog, protocol.chog.decimals)} ${protocol.chog.symbol}` : ""}`}
          />
          <Row k="Goes to" v="Your wallet" />
        </div>
        <p className="mt-4 text-sm text-dim">Your Daemon will stop earning until you put money back in. Its mood and history stay.</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <StickerButton tone="butter" size="md" onClick={() => setOpen(false)}>
            Keep it working
          </StickerButton>
          <button
            type="button"
            onClick={sweep}
            disabled={pending === LABEL}
            className="dm-btn dm-btn-md font-display"
            style={{ ["--tone" as string]: "#f43f5e", ["--on" as string]: "#fff" }}
          >
            {pending === LABEL && <Spinner className="h-4 w-4" />}
            Yes, take it all out
          </button>
        </div>
      </StickerDialog>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-dim">{k}</span>
      <span className="text-right font-bold tabular-nums">{v}</span>
    </div>
  );
}

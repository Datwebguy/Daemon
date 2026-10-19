"use client";

import { useState } from "react";
import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi } from "@/lib/abis";
import { CHAIN_ID } from "@/lib/config";
import { fmtUnits } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { Button, Dialog } from "../ui";
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
    <section className="flex flex-col gap-4 rounded-[1.75rem] border border-dashed border-line p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <h2 className="font-display text-lg font-bold">Take everything out</h2>
        <p className="mt-1 max-w-md text-sm text-dim">Empty every vault and the hype jar straight into your wallet. Always available to you, no questions asked.</p>
      </div>
      <Button variant="ghost" onClick={() => setOpen(true)} loading={pending === LABEL} className="shrink-0">
        Take it all out
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Take everything out?">
        <div className="clay-sunk space-y-2 rounded-2xl p-4 text-sm">
          <Row k="Savings" v={`about ${fmtUnits(state.totalAssets, protocol.asset?.decimals ?? 18)} ${sym}`} />
          <Row
            k="Hype jar"
            v={`${fmtUnits(state.boost?.potMon, 18)} MON${protocol.chog ? ` + ${fmtUnits(state.boost?.potChog, protocol.chog.decimals)} ${protocol.chog.symbol}` : ""}`}
          />
          <Row k="Goes to" v="Your wallet" />
        </div>
        <p className="mt-4 text-sm text-dim">Your Daemon will stop earning until you put money back in. Its mood and history stay.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Keep it working
          </Button>
          <Button variant="danger" onClick={sweep} loading={pending === LABEL}>
            Yes, take it all out
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-dim">{k}</span>
      <span className="text-right font-semibold tabular-nums">{v}</span>
    </div>
  );
}

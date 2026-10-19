"use client";

import { useState } from "react";
import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi } from "@/lib/abis";
import { CHAIN_ID } from "@/lib/config";
import { fmtUnits, shortAddr } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { Button, Card, Dialog } from "../ui";
import type { DaemonCtx } from "./types";

/** Owner-only: exits every source and sends assets, rewards, pots and MON to the owner. */
export function SweepPanel({ ctx }: { ctx: DaemonCtx }) {
  const { account, deployed, user, isOwner, protocol, state } = ctx;
  const [open, setOpen] = useState(false);
  const { run, pending } = useTx();
  if (!isOwner || !deployed || !user) return null;
  const sym = protocol.asset?.symbol ?? "";

  const sweep = async () => {
    const r = await run("Sweep to wallet", async (config) => {
      const { request } = await simulateContract(config, {
        address: account,
        abi: daemonAccountAbi,
        functionName: "sweepToOwner",
        account: user,
        chainId: CHAIN_ID,
      });
      return writeContract(config, request);
    });
    // Only close on a confirmed success (not on revert or unknown confirmation).
    if (r?.status === "success") setOpen(false);
  };

  return (
    <Card title="🧹 Exit" className="border-rose-500/30">
      <p className="text-sm text-dim">
        Non-custodial exit: pull everything out of every vault and send it, plus any unused boost pot and MON, to your wallet. Always
        available to the current Chog holder.
      </p>
      <Button variant="danger" className="mt-4 w-full" onClick={() => setOpen(true)} loading={pending === "Sweep to wallet"}>
        Sweep All to My Wallet
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Sweep everything?">
        <ul className="space-y-1 text-sm">
          <li>
            • ~{fmtUnits(state.totalAssets, protocol.asset?.decimals ?? 18)} {sym} across all sources + idle
          </li>
          <li>• Boost pot: {fmtUnits(state.boost?.potMon, 18)} MON{protocol.chog ? ` + ${fmtUnits(state.boost?.potChog, protocol.chog.decimals)} ${protocol.chog.symbol}` : ""}</li>
          <li>
            • Destination: <span className="font-mono">{shortAddr(user, 6)}</span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-dim">Your Daemon stops earning until you deposit again.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={sweep} loading={pending === "Sweep to wallet"}>
            Yes, sweep it
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

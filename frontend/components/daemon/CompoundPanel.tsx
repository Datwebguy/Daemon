"use client";

import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi } from "@/lib/abis";
import { CHAIN_ID } from "@/lib/config";
import { fmtAgo, fmtDuration, fmtUnits } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { Button } from "../ui";
import type { DaemonCtx } from "./types";

const LABEL = "Harvest";

/** Anyone can harvest any Daemon and keep a small tip. */
export function CompoundPanel({ ctx }: { ctx: DaemonCtx }) {
  const { account, deployed, user, protocol, state, isOwner } = ctx;
  const now = useNow();
  const { run, pending } = useTx();
  const dec = protocol.asset?.decimals ?? 18;
  const sym = protocol.asset?.symbol ?? "";

  // Ready time comes from the contract (it accounts for the first deposit before any harvest).
  const last = state.lastCompoundAt !== undefined ? Number(state.lastCompoundAt) : undefined;
  const readyAt = state.nextCompoundAt !== undefined ? Number(state.nextCompoundAt) : undefined;
  const remaining = readyAt !== undefined ? readyAt - now : undefined;
  const resting = remaining !== undefined && remaining > 0;
  const tooSmall = state.pendingBounty !== undefined && state.pendingBounty === BigInt(0);
  const cooldown = protocol.config ? Number(protocol.config.compoundCooldown) : undefined;
  const restProgress = resting && cooldown ? 1 - (remaining ?? 0) / cooldown : 1;

  const harvest = () =>
    user &&
    run(
      LABEL,
      async (config) => {
        const { request } = await simulateContract(config, {
          address: account,
          abi: daemonAccountAbi,
          functionName: "compound",
          args: [user],
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      },
      { done: "Harvested! Your tip is in your wallet" },
    );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <RestRing progress={restProgress} label={resting ? fmtDuration(remaining ?? 0) : "Ready"} resting={resting} />
        <div>
          <div className="text-sm text-dim">Rewards waiting to be harvested</div>
          <div className="font-display text-4xl font-extrabold tabular-nums">
            {fmtUnits(state.pendingProfit, dec)} <span className="text-2xl text-dim">{sym}</span>
          </div>
          <div className="mt-1 text-sm">
            {resting ? (
              <span className="text-dim">Resting. It can be harvested again when the timer ends.</span>
            ) : (
              <>
                {isOwner ? "Anyone can harvest this for you, or do it yourself." : "Harvest it and you keep the tip."}{" "}
                {!tooSmall && <span className="font-semibold text-spark">Tip now: about {fmtUnits(state.pendingBounty, dec)} {sym}</span>}
              </>
            )}
          </div>
        </div>
      </div>

      {deployed && !resting && tooSmall && (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-dim">Not enough has grown yet to make a harvest worth it. Check back in a little while.</p>
      )}

      <Button size="lg" className="w-full" onClick={harvest} loading={pending === LABEL} disabled={!user || !deployed || resting}>
        {!user ? "Sign in to harvest" : resting ? `Resting for ${fmtDuration(remaining ?? 0)}` : "Harvest & keep the tip"}
      </Button>

      <p className="text-center text-xs text-dim">
        {last ? `Last harvested ${fmtAgo(last, now)}.` : "Never harvested yet."}{" "}
        {protocol.config && `Tips start at ${protocol.config.bountyStartBps / 100}% and grow to ${protocol.config.bountyMaxBps / 100}% the longer it waits.`}
      </p>
    </div>
  );
}

function RestRing({ progress, label, resting }: { progress: number; label: string; resting: boolean }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={resting ? "var(--jelly)" : "var(--mint)"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
          className="transition-[stroke-dashoffset] duration-1000"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center font-display text-sm font-bold leading-tight">{label}</div>
    </div>
  );
}

"use client";

import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi } from "@/lib/abis";
import { CHAIN_ID } from "@/lib/config";
import { fmtAgo, fmtDuration, fmtUnits } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { Note, StickerButton } from "./bits";
import type { DaemonCtx } from "./types";

const LABEL = "Harvest";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

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

  // The tip grows from its start share to its max share the longer a harvest waits.
  const startBps = protocol.config?.bountyStartBps;
  const maxBps = protocol.config?.bountyMaxBps;
  const profit = state.pendingProfit;
  const bounty = state.pendingBounty;
  const shareBps = profit !== undefined && bounty !== undefined && profit > BigInt(0) ? (Number(bounty) / Number(profit)) * 10_000 : undefined;
  const haveTip = startBps !== undefined && maxBps !== undefined && maxBps > startBps;
  const nowBps = haveTip && shareBps !== undefined ? Math.max(startBps, Math.min(maxBps, shareBps)) : startBps;
  const tipMeter = haveTip && nowBps !== undefined ? clamp01((nowBps - startBps) / (maxBps - startBps)) : 0;

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
    <div className="space-y-6">
      <div className="grid items-center gap-6 @lg:grid-cols-[auto_1fr]">
        <Dial progress={restProgress} tip={tipMeter} resting={resting} label={resting ? fmtDuration(remaining ?? 0) : "Ready"} />

        <div className="min-w-0 text-center @lg:text-left">
          <div className="text-xs font-extrabold uppercase tracking-wider text-dim">Rewards waiting</div>
          <div className="font-display text-[clamp(2rem,9cqi,3.2rem)] leading-none tabular-nums">
            {fmtUnits(state.pendingProfit, dec)} <span className="text-[0.55em] text-dim">{sym}</span>
          </div>

          <div className="mt-3 space-y-2 text-sm">
            <p>
              {resting ? (
                <span className="text-dim">Resting. It can be harvested again when the timer ends.</span>
              ) : (
                <>
                  {isOwner ? "Anyone can harvest this for you, or do it yourself." : "Harvest it and you keep the tip."}{" "}
                  {!tooSmall && (
                    <span className="inline-block rounded-md px-1.5 font-extrabold text-[#1e1238]" style={{ background: "var(--butter)" }}>
                      Tip now: about {fmtUnits(state.pendingBounty, dec)} {sym}
                    </span>
                  )}
                </>
              )}
            </p>
            {protocol.config && (
              <p className="text-dim">
                {haveTip && shareBps !== undefined && !resting && !tooSmall ? (
                  <>
                    Right now the tip is about <b className="text-fg">{Math.round((nowBps ?? 0) / 100)}%</b> of the rewards.{" "}
                  </>
                ) : null}
                Tips start at {protocol.config.bountyStartBps / 100}% and grow to {protocol.config.bountyMaxBps / 100}% the longer it waits.
              </p>
            )}
          </div>

          <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-bold text-dim @lg:justify-start">
            <li className="flex items-center gap-1.5">
              <i className="h-3 w-3 rounded-full border-2 border-[var(--st-line)]" style={{ background: resting ? "var(--jelly)" : "var(--mint)" }} /> Rest timer
            </li>
            <li className="flex items-center gap-1.5">
              <i className="h-3 w-3 rounded-full border-2 border-[var(--st-line)]" style={{ background: "var(--butter)" }} /> Tip meter
            </li>
          </ul>
        </div>
      </div>

      {deployed && !resting && tooSmall && <Note>Not enough has grown yet to make a harvest worth it. Check back in a little while.</Note>}

      <StickerButton tone="jelly" size="xl" onClick={harvest} loading={pending === LABEL} disabled={!user || !deployed || resting}>
        {!user ? "Sign in to harvest" : resting ? `Resting for ${fmtDuration(remaining ?? 0)}` : "Harvest & keep the tip"}
      </StickerButton>

      <p className="text-center text-xs text-dim">{last ? `Last harvested ${fmtAgo(last, now)}.` : "Never harvested yet."}</p>
    </div>
  );
}

/** A clock face: the outer ring is the rest timer, the inner ring is how far the tip has grown. */
function Dial({ progress, tip, resting, label }: { progress: number; tip: number; resting: boolean; label: string }) {
  const R1 = 88;
  const R2 = 68;
  const c1 = 2 * Math.PI * R1;
  const c2 = 2 * Math.PI * R2;
  return (
    <div
      className="sticker relative mx-auto aspect-square w-60 max-w-full !rounded-full !border-4 !shadow-[6px_6px_0_var(--st-shadow)]"
      role="img"
      aria-label={`${resting ? `Resting, ${label} left` : "Ready to harvest"}. The tip is ${Math.round(tip * 100)} percent of the way to its maximum.`}
    >
      <svg viewBox="0 0 240 240" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        {Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * Math.PI * 2;
          const lit = i / 48 <= progress;
          const r1 = 112;
          const r2 = i % 4 === 0 ? 105 : 108;
          return (
            <line
              key={i}
              x1={120 + Math.cos(a) * r1}
              y1={120 + Math.sin(a) * r1}
              x2={120 + Math.cos(a) * r2}
              y2={120 + Math.sin(a) * r2}
              stroke={lit ? "var(--st-line)" : "var(--sep, rgb(0 0 0 / 0.2))"}
              strokeWidth={i % 4 === 0 ? 3 : 2}
              strokeLinecap="round"
            />
          );
        })}
        {/* rest timer */}
        <circle cx="120" cy="120" r={R1} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
        <circle
          cx="120"
          cy="120"
          r={R1}
          fill="none"
          stroke={resting ? "var(--jelly)" : "var(--mint)"}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c1}
          strokeDashoffset={c1 * (1 - Math.max(0.001, Math.min(1, progress)))}
          className="transition-[stroke-dashoffset] duration-1000"
        />
        {/* tip meter */}
        <circle cx="120" cy="120" r={R2} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
        <circle
          cx="120"
          cy="120"
          r={R2}
          fill="none"
          stroke="var(--butter)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={c2}
          strokeDashoffset={c2 * (1 - Math.max(0.001, Math.min(1, tip)))}
          className="transition-[stroke-dashoffset] duration-1000"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display text-[clamp(1.5rem,6vw,2.1rem)] leading-none tabular-nums">{label}</div>
          <div className="mt-1 text-[10px] font-extrabold uppercase tracking-widest text-dim">{resting ? "until harvest" : "go for it"}</div>
        </div>
      </div>
    </div>
  );
}

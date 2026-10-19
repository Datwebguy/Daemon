"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { useBalance, useReadContract } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi, erc20Abi } from "@/lib/abis";
import { CHAIN_ID } from "@/lib/config";
import { fmtDuration, fmtUnits, fractionDigits, safeParseUnits } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { Segmented } from "../ui";
import { Note, Ring, StickerButton } from "./bits";
import type { DaemonCtx } from "./types";

/** Anyone can hype any Daemon with MON or CHOG. It goes into the Daemon's hype jar. */
export function HypePanel({ ctx }: { ctx: DaemonCtx }) {
  const { account, deployed, user, protocol, state } = ctx;
  const now = useNow();
  const { run, pending } = useTx();
  const chog = protocol.chog;
  const [mode, setMode] = useState<"mon" | "chog">("mon");
  const cfg = protocol.config;
  const minMon = cfg?.minHypeMon;
  const minChog = cfg?.minHypeChog;
  const [amount, setAmount] = useState("");

  const decimals = mode === "mon" ? 18 : (chog?.decimals ?? 18);
  const unit = mode === "mon" ? "MON" : (chog?.symbol ?? "CHOG");
  const min = mode === "mon" ? minMon : minChog;
  const parsed = amount.trim() ? safeParseUnits(amount, decimals) : undefined;
  const tooPrecise = amount.trim() !== "" && parsed === undefined && fractionDigits(amount) > decimals;
  const belowMin = parsed !== undefined && min !== undefined && parsed < min;
  const presets = min !== undefined ? [min, min * BigInt(3), min * BigInt(10)] : [];

  const monBal = useBalance({ address: user, chainId: CHAIN_ID, query: { enabled: Boolean(user) } });
  const chogBal = useReadContract({
    address: chog?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: user ? [user] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(user && chog) },
  });
  const allowance = useReadContract({
    address: chog?.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: user ? [user, account] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(user && chog && deployed) },
  });
  const lastByUser = useReadContract({
    address: account,
    abi: daemonAccountAbi,
    functionName: "lastHypeBy",
    args: user ? [user] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(user && deployed), refetchInterval: 10_000 },
  });
  const userReadyAt =
    lastByUser.data !== undefined && lastByUser.data > BigInt(0) && cfg ? Number(lastByUser.data) + Number(cfg.hypeCooldownPerUser) : undefined;
  const daemonReadyAt =
    state.lastHypeAt !== undefined && state.lastHypeAt > BigInt(0) && cfg ? Number(state.lastHypeAt) + Number(cfg.hypeCooldownPerDaemon) : undefined;
  const userWait = userReadyAt !== undefined ? userReadyAt - now : 0;
  const daemonWait = daemonReadyAt !== undefined ? daemonReadyAt - now : 0;
  const waiting = userWait > 0 || daemonWait > 0;
  const cooldownUser = cfg ? Number(cfg.hypeCooldownPerUser) : 0;
  const cooldownDaemon = cfg ? Number(cfg.hypeCooldownPerDaemon) : 0;

  const boost = state.boost;
  const expiresAt = boost ? Number(boost.expiresAt) : 0;
  const active = expiresAt > now && Boolean(boost && boost.multiplierBps > BigInt(10_000));
  const mult = active && boost ? Number(boost.multiplierBps) / 10_000 : 1;
  const maxMult = cfg ? 1 + cfg.maxBoostBps / 10_000 : 1.25;
  const fill = maxMult > 1 ? Math.max(0, Math.min(1, (mult - 1) / (maxMult - 1))) : 0;

  // How full the jar looks: the pot measured in "minimum hypes", on a gentle curve.
  const potUnits =
    (minMon && minMon > BigInt(0) && boost?.potMon !== undefined ? Number(boost.potMon) / Number(minMon) : 0) +
    (minChog && minChog > BigInt(0) && boost?.potChog !== undefined ? Number(boost.potChog) / Number(minChog) : 0);
  const jarCoins = potUnits > 0 ? Math.max(1, Math.round(Math.min(1, Math.log2(1 + potUnits) / Math.log2(61)) * 9)) : 0;

  const hype = async () => {
    if (!user || parsed === undefined || parsed === BigInt(0) || waiting) return;
    if (mode === "mon") {
      await run(
        "Hype",
        async (config) => {
          const { request } = await simulateContract(config, {
            address: account,
            abi: daemonAccountAbi,
            functionName: "hype",
            value: parsed,
            account: user,
            chainId: CHAIN_ID,
          });
          return writeContract(config, request);
        },
        { done: "Hyped! The boost is on" },
      );
      setAmount("");
      return;
    }
    if (!chog) return;
    if ((allowance.data ?? BigInt(0)) < parsed) {
      const ok = await run(`Allow ${chog.symbol} for this hype`, async (config) => {
        const { request } = await simulateContract(config, {
          address: chog.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [account, parsed],
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      });
      if (ok?.status !== "success") return;
    }
    await run(
      "Hype",
      async (config) => {
        const { request } = await simulateContract(config, {
          address: account,
          abi: daemonAccountAbi,
          functionName: "hypeWithChog",
          args: [parsed],
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      },
      { done: "Hyped! The boost is on" },
    );
    setAmount("");
  };

  const needsAllow = mode === "chog" && parsed !== undefined && (allowance.data ?? BigInt(0)) < parsed;
  const busy = pending !== null && (pending === "Hype" || pending.startsWith("Allow"));

  return (
    <div className="grid gap-6 @lg:grid-cols-[auto_1fr]">
      {/* gauges: the boost thermometer and the hype jar */}
      <div className="flex items-end justify-center gap-3 @lg:self-center">
        <Thermometer fill={fill} mult={mult} maxMult={maxMult} />
        <Jar coins={jarCoins} />
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-dim">Boost</div>
            <div className="font-display text-5xl leading-none tabular-nums text-[color:var(--c-pink)]">x{mult.toFixed(2)}</div>
          </div>
          <div className="text-right text-xs font-bold text-dim">
            <div>{active ? `Ends in ${fmtDuration(expiresAt - now)}` : "No boost right now"}</div>
            <div>max x{maxMult.toFixed(2)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border-[3px] border-dashed border-[var(--st-line)] px-3 py-2 text-sm">
          <span className="font-bold text-dim">In the hype jar</span>
          <span className="text-right font-extrabold tabular-nums">
            {fmtUnits(boost?.potMon, 18, 3)} MON{chog ? ` · ${fmtUnits(boost?.potChog, chog.decimals, 2)} ${chog.symbol}` : ""}
          </span>
        </div>

        <div className="rounded-full border-[3px] border-[var(--st-line)] shadow-[3px_3px_0_var(--st-shadow)]">
          <Segmented
            label="Hype with"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setAmount("");
            }}
            options={[
              { value: "mon", label: "MON" },
              { value: "chog", label: chog?.symbol ?? "CHOG", disabled: !chog },
            ]}
          />
        </div>

        {presets.length > 0 && (
          <div className="flex flex-wrap gap-3" role="group" aria-label="Quick amounts">
            {presets.map((p) => (
              <button
                key={p.toString()}
                type="button"
                aria-pressed={parsed === p}
                onClick={() => setAmount(formatUnits(p, decimals))}
                className="dm-coin"
                title={`${formatUnits(p, decimals)} ${unit}`}
              >
                <span>
                  <span className="block font-display text-[0.95rem] leading-none">{formatUnits(p, decimals)}</span>
                  <span className="mt-0.5 block text-[9px] font-extrabold uppercase tracking-wider">{unit}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <input
          className="dm-input"
          inputMode="decimal"
          placeholder={`Amount in ${unit}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Hype amount"
        />

        <div className="flex items-center gap-3">
          <StickerButton
            tone="pink"
            size="lg"
            className="min-w-0 flex-1"
            onClick={hype}
            loading={busy}
            disabled={!user || !deployed || parsed === undefined || parsed === BigInt(0) || belowMin || waiting}
          >
            {!user ? "Sign in" : needsAllow ? "Allow & hype" : "Hype it"}
          </StickerButton>
          <CooldownRing waiting={waiting} wait={userWait > 0 ? userWait : daemonWait} total={userWait > 0 ? cooldownUser : cooldownDaemon} />
        </div>

        <div className="flex flex-wrap justify-between gap-2 text-xs text-dim">
          <span>You have {mode === "mon" ? `${fmtUnits(monBal.data?.value, 18, 3)} MON` : `${fmtUnits(chogBal.data, chog?.decimals ?? 18, 2)} ${unit}`}</span>
          {min !== undefined && (
            <span className={belowMin ? "font-extrabold text-rose-500" : undefined}>
              Minimum {formatUnits(min, decimals)} {unit}
            </span>
          )}
        </div>
        {tooPrecise && <p className="text-xs font-bold text-rose-500">That&apos;s too many decimal places.</p>}
        {waiting && (
          <Note tone="warn">
            {userWait > 0
              ? `You can hype this Daemon again in ${fmtDuration(userWait)}.`
              : `This Daemon was just hyped. It can take another in ${fmtDuration(daemonWait)}.`}
          </Note>
        )}
        {cfg && (
          <p className="text-xs leading-relaxed text-dim">
            Each hype adds +{(cfg.boostStepBps / 10_000).toFixed(2)}x to its harvests for {fmtDuration(cfg.boostDuration)}, paid from the jar. Anything left in the
            jar belongs to the Chog&apos;s holder.
          </p>
        )}
      </div>
    </div>
  );
}

/** Cooldown shown as a ring: fills while you wait, turns green when you can hype again. */
function CooldownRing({ waiting, wait, total }: { waiting: boolean; wait: number; total: number }) {
  const progress = waiting && total > 0 ? 1 - wait / total : 1;
  return (
    <Ring
      progress={progress}
      size={72}
      stroke={14}
      color={waiting ? "var(--pink)" : "var(--mint)"}
      className="rounded-full border-[3px] border-[var(--st-line)] bg-[var(--st-bg)]"
      label={waiting ? `Hype cooldown, ${fmtDuration(wait)} left` : "Ready to hype"}
    >
      <span className="font-display text-[0.8rem] leading-none tabular-nums">{waiting ? fmtDuration(wait) : "Go"}</span>
    </Ring>
  );
}

/** A tall thermometer that fills toward the maximum boost. */
function Thermometer({ fill, mult, maxMult }: { fill: number; mult: number; maxMult: number }) {
  const marks = [
    { y: 12, t: `max x${maxMult.toFixed(2)}` },
    { y: 92, t: "" },
    { y: 164, t: "x1.00" },
  ];
  return (
    <figure className="m-0 text-center">
      <svg viewBox="0 0 124 200" className="h-48 w-[7.6rem]" role="img" aria-label={`Boost thermometer, x${mult.toFixed(2)} of a maximum x${maxMult.toFixed(2)}`}>
        <rect x="19" y="6" width="20" height="160" rx="10" fill="var(--surface-2)" stroke="var(--st-line)" strokeWidth="4" />
        <circle cx="29" cy="172" r="22" fill="var(--surface-2)" stroke="var(--st-line)" strokeWidth="4" />
        {/* the filled part grows up from the bulb */}
        <rect
          x="24"
          y="12"
          width="10"
          height="160"
          rx="5"
          fill="var(--pink)"
          style={{ transform: `scaleY(${fill})`, transformOrigin: "29px 172px", transition: "transform .7s cubic-bezier(.3,1.3,.5,1)" }}
        />
        <circle cx="29" cy="172" r="15" fill={fill > 0 ? "var(--pink)" : "var(--surface-2)"} stroke="var(--st-line)" strokeWidth="2" />
        <path d="M24 166v-6" stroke="#fff" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" />
        {marks.map((k) => (
          <g key={k.y}>
            <line x1="44" y1={k.y} x2="52" y2={k.y} stroke="var(--st-line)" strokeWidth="3" strokeLinecap="round" />
            {k.t && (
              <text x="56" y={k.y + 4} fontSize="11" fontWeight="800" fill="currentColor">
                {k.t}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="text-[11px] font-extrabold uppercase tracking-wider text-dim">Boost</figcaption>
    </figure>
  );
}

const JAR_SLOTS: [number, number][] = [
  [34, 132],
  [56, 132],
  [78, 132],
  [45, 116],
  [67, 116],
  [34, 100],
  [56, 100],
  [78, 100],
  [56, 84],
];

/** The hype jar, drawn as a glass jar that fills with coins as hype piles up. */
function Jar({ coins }: { coins: number }) {
  return (
    <figure className="m-0 text-center">
      <svg viewBox="0 0 112 150" className="h-36 w-[6.6rem]" role="img" aria-label={coins > 0 ? "A hype jar with coins in it" : "An empty hype jar"}>
        <path
          d="M26 24h60v10c14 8 20 20 20 36v52c0 14-8 24-22 24H28c-14 0-22-10-22-24V70c0-16 6-28 20-36z"
          fill="color-mix(in oklab, var(--st-bg) 78%, var(--sky))"
          stroke="var(--st-line)"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        {JAR_SLOTS.slice(0, coins).map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="10.5" fill="var(--butter)" stroke="#1e1238" strokeWidth="2.6" />
            <circle cx={x} cy={y} r="5.5" fill="none" stroke="#1e1238" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="3 2" />
          </g>
        ))}
        <path d="M18 62c-2 8-2 20-2 32" stroke="#fff" strokeOpacity="0.6" strokeWidth="5" strokeLinecap="round" fill="none" />
        <rect x="22" y="6" width="68" height="20" rx="6" fill="var(--jelly)" stroke="var(--st-line)" strokeWidth="4.5" />
        <path d="M32 14h48" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <figcaption className="text-[11px] font-extrabold uppercase tracking-wider text-dim">Hype jar</figcaption>
    </figure>
  );
}

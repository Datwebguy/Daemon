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
import { Button, cx, Input, Segmented } from "../ui";
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

  const boost = state.boost;
  const expiresAt = boost ? Number(boost.expiresAt) : 0;
  const active = expiresAt > now && Boolean(boost && boost.multiplierBps > BigInt(10_000));
  const mult = active && boost ? Number(boost.multiplierBps) / 10_000 : 1;
  const maxMult = cfg ? 1 + cfg.maxBoostBps / 10_000 : 1.25;

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
    <div className="space-y-5">
      {/* boost meter */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-dim">Boost</span>
          <span className="font-display text-3xl font-extrabold tabular-nums text-spark">{mult.toFixed(2)}×</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-300 to-spark transition-all duration-700"
            style={{ width: `${((mult - 1) / (maxMult - 1)) * 100}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-dim">
          <span>{active ? `Ends in ${fmtDuration(expiresAt - now)}` : "No boost right now"}</span>
          <span>max {maxMult.toFixed(2)}×</span>
        </div>
      </div>

      <div className="clay-sunk flex items-center justify-between rounded-2xl px-4 py-3 text-sm">
        <span className="text-dim">In the hype jar</span>
        <span className="font-semibold tabular-nums">
          {fmtUnits(boost?.potMon, 18, 3)} MON{chog ? ` · ${fmtUnits(boost?.potChog, chog.decimals, 2)} ${chog.symbol}` : ""}
        </span>
      </div>

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

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.toString()}
              type="button"
              onClick={() => setAmount(formatUnits(p, decimals))}
              className={cx(
                "rounded-full border px-4 py-1.5 text-sm font-semibold transition",
                parsed === p ? "border-spark bg-spark/12 text-spark" : "border-line hover:bg-surface-2",
              )}
            >
              {formatUnits(p, decimals)} {unit}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input inputMode="decimal" placeholder={`Amount in ${unit}`} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Hype amount" />
        <Button variant="spark" onClick={hype} loading={busy} disabled={!user || !deployed || parsed === undefined || parsed === BigInt(0) || belowMin || waiting}>
          {!user ? "Sign in" : needsAllow ? "Allow & hype" : "Hype it"}
        </Button>
      </div>

      <div className="flex flex-wrap justify-between gap-2 text-xs text-dim">
        <span>You have {mode === "mon" ? `${fmtUnits(monBal.data?.value, 18, 3)} MON` : `${fmtUnits(chogBal.data, chog?.decimals ?? 18, 2)} ${unit}`}</span>
        {min !== undefined && <span className={belowMin ? "font-semibold text-rose-500" : undefined}>Minimum {formatUnits(min, decimals)} {unit}</span>}
      </div>
      {tooPrecise && <p className="text-xs text-rose-500">That&apos;s too many decimal places.</p>}
      {waiting && (
        <p className="rounded-2xl bg-amber-400/12 px-4 py-3 text-sm" role="status">
          {userWait > 0
            ? `You can hype this Daemon again in ${fmtDuration(userWait)}.`
            : `This Daemon was just hyped. It can take another in ${fmtDuration(daemonWait)}.`}
        </p>
      )}
      {cfg && (
        <p className="text-xs leading-relaxed text-dim">
          Each hype adds +{(cfg.boostStepBps / 10_000).toFixed(2)}× to its harvests for {fmtDuration(cfg.boostDuration)}, paid from the jar. Anything left in the
          jar belongs to the Chog&apos;s holder.
        </p>
      )}
    </div>
  );
}

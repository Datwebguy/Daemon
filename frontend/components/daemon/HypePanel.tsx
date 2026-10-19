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
import { Button, Card, cx, Input, Stat } from "../ui";
import type { DaemonCtx } from "./types";

/** Public: anyone can hype any Daemon with MON or $CHOG. Payment goes to its boost pot. */
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
  const placeholder =
    mode === "mon"
      ? minMon !== undefined
        ? formatUnits(minMon, 18)
        : "0.1"
      : minChog !== undefined
        ? formatUnits(minChog, decimals)
        : "10";
  // Never fall back to the placeholder: an empty input means nothing to send.
  const parsed = amount.trim() ? safeParseUnits(amount, decimals) : undefined;
  const tooPrecise = amount.trim() !== "" && parsed === undefined && fractionDigits(amount) > decimals;
  const min = mode === "mon" ? minMon : minChog;
  const belowMin = parsed !== undefined && min !== undefined && parsed < min;

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
  const coolingDown = userWait > 0 || daemonWait > 0;

  const boost = state.boost;
  const expiresAt = boost ? Number(boost.expiresAt) : 0;
  const active = expiresAt > now;
  const mult = boost ? Number(boost.multiplierBps) / 10_000 : undefined;

  const hype = async () => {
    if (!user || parsed === undefined || parsed === BigInt(0) || coolingDown) return;
    if (mode === "mon") {
      await run("Hype with MON", async (config) => {
        const { request } = await simulateContract(config, {
          address: account,
          abi: daemonAccountAbi,
          functionName: "hype",
          value: parsed,
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      });
      return;
    }
    if (!chog) return;
    if ((allowance.data ?? BigInt(0)) < parsed) {
      const ok = await run(`Approve ${chog.symbol}`, async (config) => {
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
    await run(`Hype with ${chog.symbol}`, async (config) => {
      const { request } = await simulateContract(config, {
        address: account,
        abi: daemonAccountAbi,
        functionName: "hypeWithChog",
        args: [parsed],
        account: user,
        chainId: CHAIN_ID,
      });
      return writeContract(config, request);
    });
  };

  const needsApprove = mode === "chog" && parsed !== undefined && (allowance.data ?? BigInt(0)) < parsed;
  const busy = pending !== null && (pending.startsWith("Hype") || pending.startsWith("Approve"));

  return (
    <Card title="⚡ Hype" right={<span className="text-xs text-dim">anyone can hype</span>}>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Boost"
          value={active && mult ? `${mult.toFixed(2)}x` : "None"}
          hint={active ? `ends in ${fmtDuration(expiresAt - now)}` : cfg ? `up to ${(1 + cfg.maxBoostBps / 10_000).toFixed(2)}x` : undefined}
        />
        <Stat
          label="Boost pot"
          value={`${fmtUnits(boost?.potMon, 18, 3)} MON`}
          hint={chog ? `+ ${fmtUnits(boost?.potChog, chog.decimals, 2)} ${chog.symbol}` : undefined}
        />
      </div>

      <div className="mt-4 flex gap-1 rounded-2xl bg-muted p-1 text-sm font-semibold">
        {(["mon", "chog"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setAmount("");
            }}
            disabled={m === "chog" && !chog}
            className={cx("flex-1 rounded-xl px-3 py-1.5 disabled:opacity-40", mode === m ? "bg-surface shadow-sm" : "text-dim")}
          >
            {m === "mon" ? "MON" : chog?.symbol ? `$${chog.symbol}` : "$CHOG (n/a)"}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Input inputMode="decimal" placeholder={placeholder} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Hype amount" />
        <Button onClick={hype} loading={busy} disabled={!user || !deployed || parsed === undefined || parsed === BigInt(0) || belowMin || coolingDown}>
          {needsApprove ? "Approve & hype" : "Hype"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-dim">
        <span>
          Balance:{" "}
          {mode === "mon"
            ? `${fmtUnits(monBal.data?.value, 18, 3)} MON`
            : `${fmtUnits(chogBal.data, chog?.decimals ?? 18, 2)} ${chog?.symbol ?? ""}`}
        </span>
        {min !== undefined && <span className={belowMin ? "text-rose-500" : undefined}>min {formatUnits(min, decimals)}</span>}
      </div>
      {tooPrecise && <p className="mt-2 text-xs text-rose-500">Too many decimals: {decimals} max for this token.</p>}
      {(userWait > 0 || daemonWait > 0) && (
        <div className="mt-3 space-y-1 text-xs text-amber-600 dark:text-amber-300" role="status">
          {userWait > 0 && <div>You can hype this Daemon again in {fmtDuration(userWait)}.</div>}
          {daemonWait > 0 && <div>This Daemon is resting for {fmtDuration(daemonWait)} before anyone can hype it.</div>}
        </div>
      )}
      {cfg && (
        <p className="mt-3 text-xs text-dim">
          Each hype adds +{(cfg.boostStepBps / 10_000).toFixed(2)}x for {fmtDuration(cfg.boostDuration)}. One hype per person every{" "}
          {fmtDuration(cfg.hypeCooldownPerUser)}, and the Daemon rests {fmtDuration(cfg.hypeCooldownPerDaemon)} between hypes. The pot
          funds the boost; unused pot goes to the owner on sweep.
        </p>
      )}
    </Card>
  );
}

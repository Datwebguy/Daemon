"use client";

import { useState } from "react";
import { formatUnits, type Address } from "viem";
import { useReadContract } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi, erc20Abi, strategyRegistryAbi } from "@/lib/abis";
import { addressUrl, CHAIN_ID, contracts } from "@/lib/config";
import { fmtUnits, fractionDigits, safeParseUnits, shortAddr } from "@/lib/format";
import { useBalances, usePositions, type Position } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { Button, Card, cx, Empty, Input, Loading, Notice, Pill } from "../ui";
import type { DaemonCtx } from "./types";

/** DaemonAccount.MAX_SOURCES */
const MAX_SOURCES = 8;

function RiskPill({ label }: { label: string }) {
  const l = label.toLowerCase();
  const cls = l.includes("degen")
    ? "bg-orange-400/20 text-orange-600 dark:text-orange-300"
    : l.includes("stable")
      ? "bg-emerald-400/20 text-emerald-700 dark:text-emerald-300"
      : "bg-muted text-dim";
  return <Pill className={cls}>{l.includes("degen") ? "🎢" : l.includes("stable") ? "🛡️" : "🏦"} {label}</Pill>;
}

/** Positions per source + owner-only deposit (transfer -> allocate) and withdraw (deallocate). */
export function YieldPanel({ ctx }: { ctx: DaemonCtx }) {
  const { account, deployed, user, isOwner, protocol, state } = ctx;
  const asset = protocol.asset;
  const dec = asset?.decimals ?? 18;
  const sym = asset?.symbol ?? "";
  const { positions, isLoading, error } = usePositions(account, protocol.sources, protocol.unlistedSources, deployed);
  const daemonBal = useBalances(account, asset?.address);
  const userBal = useBalances(user, asset?.address);
  const idle = daemonBal.asset ?? BigInt(0);
  const { run, pending } = useTx();

  const [source, setSource] = useState<Address | "">("");
  const firstApproved = positions.find((p) => p.approved)?.source ?? "";
  const selected = source || firstApproved;
  const selectedPos = positions.find((p) => p.source === selected);
  const [amount, setAmount] = useState("");
  const parsed = safeParseUnits(amount, dec);
  const tooPrecise = amount.trim() !== "" && parsed === undefined && fractionDigits(amount) > dec;
  /** Set when the transfer succeeded but allocate did not: the funds sit idle in the Daemon. */
  const [stuck, setStuck] = useState<{ source: Address; amount: bigint } | null>(null);

  const approvedRead = useReadContract({
    address: contracts.strategyRegistry,
    abi: strategyRegistryAbi,
    functionName: "isApproved",
    args: selected ? [selected] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(contracts.strategyRegistry && selected), refetchInterval: 30_000 },
  });
  const heldList = state.heldSources;
  const alreadyHeld = Boolean(selected && heldList?.some((h) => h.toLowerCase() === selected.toLowerCase()));
  const capLeft =
    selectedPos?.cap !== undefined ? (selectedPos.cap > selectedPos.assets ? selectedPos.cap - selectedPos.assets : BigInt(0)) : undefined;

  /** Preflight: everything allocate() would revert on, checked BEFORE any funds move. */
  const blocked: string | null = (() => {
    if (!selected || !selectedPos) return "Pick a yield source.";
    if (!selectedPos.approved || approvedRead.data === false)
      return "This source isn't approved in the StrategyRegistry, so it can't accept deposits.";
    if (approvedRead.data === undefined) return "Checking source approval…";
    if (heldList === undefined) return "Reading your held sources…";
    if (!alreadyHeld && heldList.length >= MAX_SOURCES)
      return `This Daemon already holds ${MAX_SOURCES} sources (the maximum). Withdraw fully from one before adding another.`;
    if (capLeft === undefined) return "Reading the source cap…";
    if (capLeft === BigInt(0)) return `Cap reached: this source accepts at most ${fmtUnits(selectedPos.cap, dec, 0)} ${sym} per Daemon.`;
    if (parsed !== undefined && parsed > capLeft) return `Over the cap: only ${fmtUnits(capLeft, dec)} ${sym} of room left in this source.`;
    return null;
  })();

  const shortfall = parsed !== undefined && parsed > idle ? parsed - idle : BigInt(0);
  const walletOk = shortfall === BigInt(0) || (userBal.asset ?? BigInt(0)) >= shortfall;

  const allocate = async (src: Address, amt: bigint) => {
    if (!user) return false;
    const r = await run("Allocate", async (config) => {
      const { request } = await simulateContract(config, {
        address: account,
        abi: daemonAccountAbi,
        functionName: "allocate",
        args: [src, amt],
        account: user,
        chainId: CHAIN_ID,
      });
      return writeContract(config, request);
    });
    return r?.status === "success";
  };

  const deposit = async () => {
    if (!user || !asset || !selected || parsed === undefined || parsed === BigInt(0) || blocked) return;
    if (shortfall > BigInt(0)) {
      const r = await run(`Send ${sym} to Daemon`, async (config) => {
        const { request } = await simulateContract(config, {
          address: asset.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [account, shortfall],
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      });
      if (r?.status !== "success") return;
    }
    if (await allocate(selected, parsed)) {
      setAmount("");
      setStuck(null);
    } else {
      // Funds are now idle in the Daemon: say so explicitly and offer a retry.
      setStuck({ source: selected, amount: parsed });
    }
  };

  const retry = async () => {
    if (!stuck) return;
    if (await allocate(stuck.source, stuck.amount)) {
      setStuck(null);
      setAmount("");
    }
  };

  const busy = pending !== null && (pending === "Allocate" || pending.startsWith("Send"));

  return (
    <Card title="🏦 Yield sources" right={<span className="text-xs text-dim">idle in Daemon: {fmtUnits(idle, dec)} {sym}</span>}>
      {protocol.sources.length === 0 && protocol.unlistedSources.length === 0 ? (
        <Notice tone="warn" title="No yield sources configured">
          Set NEXT_PUBLIC_STRATEGY_REGISTRY and approve sources there. Only StrategyRegistry.sources() can accept deposits.
        </Notice>
      ) : !deployed ? (
        <Empty emoji="💤" title="Activate this Daemon first">Positions appear once the token-bound account exists.</Empty>
      ) : isLoading ? (
        <Loading label="Reading positions…" />
      ) : error ? (
        <Notice tone="error" title="Couldn't read positions">{error.message.slice(0, 200)}</Notice>
      ) : (
        <ul className="space-y-3">
          {positions.map((p) => (
            <PositionRow key={p.source} p={p} ctx={ctx} dec={dec} sym={sym} />
          ))}
        </ul>
      )}

      {stuck && isOwner && (
        <div className="mt-4">
          <Notice tone="warn" title="Funds are idle in your Daemon: retry allocation">
            {fmtUnits(stuck.amount, dec)} {sym} reached your Daemon, but allocating it to the vault failed or wasn&apos;t confirmed. Nothing is
            lost: the funds are idle in your Daemon (and can be moved out with Sweep).
            <div className="mt-2">
              <Button onClick={retry} loading={pending === "Allocate"}>
                Retry allocation
              </Button>
            </div>
          </Notice>
        </div>
      )}

      {isOwner && deployed && protocol.sources.length + protocol.unlistedSources.length > 0 && (
        <div className="mt-5 rounded-2xl border border-line p-4">
          <div className="mb-3 text-sm font-bold">Deposit</div>
          {!asset ? (
            <Notice tone="warn">Base asset address unknown (StrategyRegistry.config().asset).</Notice>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={selected}
                  onChange={(e) => setSource(e.target.value as Address)}
                  className="rounded-2xl border border-line bg-bg px-3 py-2 text-sm"
                  aria-label="Yield source"
                >
                  {positions.map((p) => (
                    <option key={p.source} value={p.source} disabled={!p.approved}>
                      {p.label} · {shortAddr(p.source)}
                      {p.approved ? "" : " (unapproved)"}
                    </option>
                  ))}
                </select>
                <div className="flex flex-1 gap-2">
                  <Input inputMode="decimal" placeholder={`Amount ${sym}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <Button
                    variant="ghost"
                    onClick={() => setAmount(formatUnits(idle + (userBal.asset ?? BigInt(0)), dec))}
                    className="shrink-0"
                  >
                    Max
                  </Button>
                </div>
                <Button
                  onClick={deposit}
                  loading={busy}
                  disabled={parsed === undefined || parsed === BigInt(0) || !walletOk || blocked !== null}
                >
                  Deposit
                </Button>
              </div>
              {blocked && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-300" role="status">
                  {blocked}
                </p>
              )}
              {tooPrecise && <p className="mt-2 text-xs text-rose-500">Too many decimals: {sym} supports {dec}.</p>}
              <p className="mt-2 text-xs text-dim">
                Wallet: {fmtUnits(userBal.asset, dec)} {sym}.{" "}
                {shortfall > BigInt(0)
                  ? `Step 1 sends ${fmtUnits(shortfall, dec)} ${sym} from your wallet to the Daemon, step 2 allocates it.`
                  : parsed
                    ? "Allocates idle funds already in the Daemon (1 tx)."
                    : "Funds go wallet → Daemon → vault. Only the Chog owner can allocate."}
                {!walletOk && <span className="text-rose-500"> Not enough {sym} in your wallet.</span>}
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function PositionRow({ p, ctx, dec, sym }: { p: Position; ctx: DaemonCtx; dec: number; sym: string }) {
  const { account, user, isOwner } = ctx;
  const { run, pending } = useTx();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const parsed = safeParseUnits(amount, dec);
  // assets -> shares, proportional; "Max" sends exactly all shares
  const [max, setMax] = useState(false);
  const shares =
    max ? p.shares : parsed !== undefined && p.assets > BigInt(0) ? (parsed * p.shares) / p.assets : undefined;
  const tooMuch = shares !== undefined && shares > p.shares;

  const withdraw = async () => {
    if (!user || shares === undefined || shares === BigInt(0)) return;
    const r = await run(`Withdraw from ${p.label}`, async (config) => {
      const { request } = await simulateContract(config, {
        address: account,
        abi: daemonAccountAbi,
        functionName: "deallocate",
        args: [p.source, shares],
        account: user,
        chainId: CHAIN_ID,
      });
      return writeContract(config, request);
    });
    if (r?.status === "success") {
      setAmount("");
      setMax(false);
      setOpen(false);
    }
  };

  const rewardText =
    p.reward?.decimals === undefined
      ? p.reward
        ? "…"
        : "n/a"
      : `${fmtUnits(p.pendingRewards, p.reward.decimals)} ${p.reward.symbol ?? ""}`.trim();

  return (
    <li className="rounded-2xl bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <RiskPill label={p.label} />
          {!p.approved && <Pill className="bg-rose-500/15 text-rose-600 dark:text-rose-300">unapproved</Pill>}
          <a href={addressUrl(p.source)} target="_blank" rel="noreferrer" className="font-mono text-xs text-dim hover:underline">
            {shortAddr(p.source)}
          </a>
        </div>
        <div className="text-right font-bold tabular-nums">
          {fmtUnits(p.assets, dec)} {sym}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-dim tabular-nums">
        <span>Pending rewards: {rewardText}</span>
        {p.cap !== undefined && <span>Cap: {fmtUnits(p.cap, dec, 0)} {sym}</span>}
      </div>
      {isOwner && p.shares > BigInt(0) && (
        <div className="mt-3">
          {!open ? (
            <Button variant="ghost" className="!py-1 text-xs" onClick={() => setOpen(true)}>
              Withdraw to Daemon
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                placeholder={`Amount ${sym}`}
                value={max ? formatUnits(p.assets, dec) : amount}
                onChange={(e) => {
                  setMax(false);
                  setAmount(e.target.value);
                }}
                className={cx(tooMuch && "border-rose-500")}
              />
              <Button variant="ghost" onClick={() => setMax(true)} className="shrink-0">
                Max
              </Button>
              <Button
                variant="secondary"
                onClick={withdraw}
                loading={pending?.startsWith("Withdraw") ?? false}
                disabled={!shares || tooMuch}
              >
                Withdraw
              </Button>
            </div>
          )}
          {open && <p className="mt-1 text-xs text-dim">Funds return to the Daemon as idle {sym}. Use Sweep to move everything to your wallet.</p>}
        </div>
      )}
    </li>
  );
}

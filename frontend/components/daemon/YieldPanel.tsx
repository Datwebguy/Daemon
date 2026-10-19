"use client";

import { useState } from "react";
import { formatUnits, type Address } from "viem";
import { useReadContract } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi, erc20Abi, strategyRegistryAbi } from "@/lib/abis";
import { CHAIN_ID, contracts } from "@/lib/config";
import { fmtUnits, fractionDigits, safeParseUnits } from "@/lib/format";
import { useBalances, usePositions, type Position } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { Button, cx, Input, Loading, Notice } from "../ui";
import type { DaemonCtx } from "./types";

/** Most vaults one Daemon can use at once (contract limit). */
const MAX_SOURCES = 8;
const DEPOSIT = "Put money to work";
const MOVE = "Send to your Daemon";

function vaultLook(label: string) {
  const l = label.toLowerCase();
  if (l.includes("degen")) return { name: "Degen vault", note: "Bigger swings, more fun", tone: "#ff7a45", path: "M6 26 L12 12 L18 22 L25 6 L31 18 L38 8" };
  if (l.includes("stable")) return { name: "Stable vault", note: "Calm, steady rewards", tone: "#12a57a", path: "M6 24 C12 16 18 20 24 14 S34 8 38 8" };
  return { name: `${label} vault`, note: "Earns rewards over time", tone: "#7a5af0", path: "M6 20 H38" };
}

/** Savings: the owner's vault positions, with deposit (send → put to work) and withdraw. */
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
  const firstOpen = positions.find((p) => p.approved)?.source ?? "";
  const selected = source || firstOpen;
  const selectedPos = positions.find((p) => p.source === selected);
  const [amount, setAmount] = useState("");
  const parsed = safeParseUnits(amount, dec);
  const tooPrecise = amount.trim() !== "" && parsed === undefined && fractionDigits(amount) > dec;
  /** The money reached the Daemon but putting it to work didn't go through. */
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
  const room =
    selectedPos?.cap !== undefined ? (selectedPos.cap > selectedPos.assets ? selectedPos.cap - selectedPos.assets : BigInt(0)) : undefined;

  /** Everything that would make the deposit fail, checked before any money moves. */
  const blocked: string | null = (() => {
    if (!selected || !selectedPos) return "Pick a vault.";
    if (!selectedPos.approved || approvedRead.data === false) return "This vault isn't open for deposits.";
    if (approvedRead.data === undefined || heldList === undefined || room === undefined) return "Checking the vault…";
    if (!alreadyHeld && heldList.length >= MAX_SOURCES) return "Your Daemon is using the maximum number of vaults. Empty one first.";
    if (room === BigInt(0)) return `This vault is full for your Daemon (${fmtUnits(selectedPos.cap, dec, 0)} ${sym} max).`;
    if (parsed !== undefined && parsed > room) return `Only ${fmtUnits(room, dec)} ${sym} of room left in this vault.`;
    return null;
  })();

  const shortfall = parsed !== undefined && parsed > idle ? parsed - idle : BigInt(0);
  const walletOk = shortfall === BigInt(0) || (userBal.asset ?? BigInt(0)) >= shortfall;

  const allocate = async (src: Address, amt: bigint) => {
    if (!user) return false;
    const r = await run(
      DEPOSIT,
      async (config) => {
        const { request } = await simulateContract(config, {
          address: account,
          abi: daemonAccountAbi,
          functionName: "allocate",
          args: [src, amt],
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      },
      { done: "Your money is working" },
    );
    return r?.status === "success";
  };

  const deposit = async () => {
    if (!user || !asset || !selected || parsed === undefined || parsed === BigInt(0) || blocked) return;
    if (shortfall > BigInt(0)) {
      const r = await run(MOVE, async (config) => {
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

  const busy = pending === DEPOSIT || pending === MOVE;

  if (!deployed) return <p className="text-sm text-dim">Wake this Daemon up first, then you can start saving.</p>;
  if (protocol.sources.length === 0 && protocol.unlistedSources.length === 0)
    return <Notice title="Vaults are opening soon">There&apos;s nowhere to put money to work just yet. Check back shortly.</Notice>;
  if (isLoading) return <Loading label="Checking your savings…" />;
  if (error) return <Notice tone="error" title="We couldn't load your savings">The network didn&apos;t answer. It usually comes back in a moment.</Notice>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {positions.map((p) => (
          <VaultCard
            key={p.source}
            p={p}
            ctx={ctx}
            dec={dec}
            sym={sym}
            selected={isOwner && p.source === selected}
            onSelect={isOwner && p.approved ? () => setSource(p.source) : undefined}
          />
        ))}
      </div>

      {idle > BigInt(0) && (
        <p className="text-sm text-dim">
          {fmtUnits(idle, dec)} {sym} is sitting in your Daemon, not earning yet.
        </p>
      )}

      {stuck && isOwner && (
        <Notice tone="warn" title="Your money arrived, but isn't working yet">
          {fmtUnits(stuck.amount, dec)} {sym} reached your Daemon, but putting it into the vault didn&apos;t go through. Nothing is lost.
          <div className="mt-3">
            <Button size="sm" onClick={retry} loading={pending === DEPOSIT}>
              Try again
            </Button>
          </div>
        </Notice>
      )}

      {isOwner && asset && (
        <div className="clay-sunk rounded-[1.5rem] p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-display text-lg font-bold">Add to {selectedPos ? vaultLook(selectedPos.label).name : "a vault"}</div>
            <div className="text-xs text-dim tabular-nums">
              Wallet: {fmtUnits(userBal.asset, dec)} {sym}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Input inputMode="decimal" placeholder={`Amount in ${sym}`} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount to save" />
            <Button variant="ghost" className="shrink-0" onClick={() => setAmount(formatUnits(idle + (userBal.asset ?? BigInt(0)), dec))}>
              Max
            </Button>
          </div>
          <Button
            className="mt-3 w-full"
            size="lg"
            onClick={deposit}
            loading={busy}
            disabled={parsed === undefined || parsed === BigInt(0) || !walletOk || blocked !== null}
          >
            Put it to work
          </Button>
          <div className="mt-2 space-y-1 text-xs">
            {blocked && parsed !== undefined && <p className="text-amber-700 dark:text-amber-300">{blocked}</p>}
            {tooPrecise && <p className="text-rose-500">That&apos;s too many decimal places.</p>}
            {!walletOk && <p className="text-rose-500">You don&apos;t have enough {sym}. Grab free test dollars from the menu.</p>}
            {walletOk && shortfall > BigInt(0) && (
              <p className="text-dim">This takes two quick approvals: one to send the money to your Daemon, one to put it to work.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VaultCard({
  p,
  ctx,
  dec,
  sym,
  selected,
  onSelect,
}: {
  p: Position;
  ctx: DaemonCtx;
  dec: number;
  sym: string;
  selected: boolean;
  onSelect?: () => void;
}) {
  const { account, user, isOwner } = ctx;
  const { run, pending } = useTx();
  const look = vaultLook(p.label);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [max, setMax] = useState(false);
  const parsed = safeParseUnits(amount, dec);
  const shares = max ? p.shares : parsed !== undefined && p.assets > BigInt(0) ? (parsed * p.shares) / p.assets : undefined;
  const tooMuch = shares !== undefined && shares > p.shares;
  const label = `Bring back from ${look.name}`;

  const withdraw = async () => {
    if (!user || shares === undefined || shares === BigInt(0)) return;
    const r = await run(
      label,
      async (config) => {
        const { request } = await simulateContract(config, {
          address: account,
          abi: daemonAccountAbi,
          functionName: "deallocate",
          args: [p.source, shares],
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      },
      { done: "Moved back into your Daemon" },
    );
    if (r?.status === "success") {
      setAmount("");
      setMax(false);
      setOpen(false);
    }
  };

  const rewards =
    p.reward?.decimals === undefined ? "…" : `${fmtUnits(p.pendingRewards, p.reward.decimals, 2)} ${p.reward.symbol ?? ""}`.trim();

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => onSelect && (e.key === "Enter" || e.key === " ") && onSelect()}
      className={cx(
        "rounded-[1.5rem] border-2 bg-surface p-4 transition",
        selected ? "border-jelly shadow-[0_14px_30px_-18px_var(--glow)]" : "border-transparent",
        onSelect && "cursor-pointer hover:border-jelly/40",
        !p.approved && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <svg viewBox="0 0 44 32" className="h-7 w-9" fill="none" stroke={look.tone} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={look.path} />
          </svg>
          <div className="mt-1.5 font-display text-lg font-bold">{look.name}</div>
          <div className="text-xs text-dim">{p.approved ? look.note : "Closed to new deposits"}</div>
        </div>
        {selected && <span className="rounded-full bg-jelly px-2.5 py-0.5 text-[11px] font-bold text-white">Selected</span>}
      </div>
      <div className="mt-4 font-display text-2xl font-extrabold tabular-nums">
        {fmtUnits(p.assets, dec, 2)} <span className="text-base text-dim">{sym}</span>
      </div>
      <div className="text-xs text-dim tabular-nums">+ {rewards} growing</div>

      {isOwner && p.shares > BigInt(0) && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          {!open ? (
            <button onClick={() => setOpen(true)} className="text-sm font-semibold text-jelly underline-offset-4 hover:underline">
              Bring some back
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  inputMode="decimal"
                  placeholder="Amount"
                  value={max ? formatUnits(p.assets, dec) : amount}
                  onChange={(e) => {
                    setMax(false);
                    setAmount(e.target.value);
                  }}
                  className={cx("!py-2", tooMuch && "!border-rose-500")}
                />
                <Button size="sm" variant="ghost" onClick={() => setMax(true)}>
                  All
                </Button>
              </div>
              <Button size="sm" variant="secondary" className="w-full" onClick={withdraw} loading={pending === label} disabled={!shares || tooMuch}>
                Bring back to Daemon
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

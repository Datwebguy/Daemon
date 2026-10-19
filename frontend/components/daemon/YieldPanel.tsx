"use client";

import { useState } from "react";
import { formatUnits, type Address } from "viem";
import { useReadContract } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi, erc20Abi, strategyRegistryAbi } from "@/lib/abis";
import { CHAIN_ID, contracts } from "@/lib/config";
import { cx } from "@/lib/cx";
import { fmtUnits, fractionDigits, safeParseUnits } from "@/lib/format";
import { useBalances, usePositions, type Position } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { Loading } from "../ui";
import { Note, StickerButton, type Tone } from "./bits";
import type { DaemonCtx } from "./types";

/** Most vaults one Daemon can use at once (contract limit). */
const MAX_SOURCES = 8;
const DEPOSIT = "Put money to work";
const MOVE = "Send to your Daemon";

function vaultLook(label: string): { name: string; note: string; tone: Tone; path: string } {
  const l = label.toLowerCase();
  if (l.includes("degen")) return { name: "Degen vault", note: "Bigger swings, more fun", tone: "spark", path: "M4 40 L22 14 L38 34 L56 8 L72 32 L90 12 L116 26" };
  if (l.includes("stable")) return { name: "Stable vault", note: "Calm, steady rewards", tone: "mint", path: "M4 34 C22 30 34 38 52 26 S88 14 116 12" };
  return { name: `${label} vault`, note: "Earns rewards over time", tone: "sky", path: "M4 26 H116" };
}

/** Trim a decimal string to at most `max` fraction digits (never rounds up). */
function trimFraction(s: string, max: number): string {
  const [i = "0", f = ""] = s.split(".");
  const frac = f.slice(0, max).replace(/0+$/, "");
  return frac ? `${i}.${frac}` : i;
}

/** Savings: the owner's vault positions, with deposit (send then put to work) and withdraw. */
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

  // Slider: 0 to 1000 thousandths of everything you could put in (money already in the Daemon plus your wallet).
  const maxAmt = idle + (userBal.asset ?? BigInt(0));
  const frac = parsed !== undefined && maxAmt > BigInt(0) ? Math.max(0, Math.min(1000, Number((parsed * BigInt(1000)) / maxAmt))) : 0;
  const slide = (v: number) => {
    if (maxAmt === BigInt(0) || v <= 0) return setAmount("");
    if (v >= 1000) return setAmount(formatUnits(maxAmt, dec));
    setAmount(trimFraction(formatUnits((maxAmt * BigInt(v)) / BigInt(1000), dec), Math.min(dec, 6)));
  };

  if (!deployed) return <p className="text-sm text-dim">Wake this Daemon up first, then you can start saving.</p>;
  if (protocol.sources.length === 0 && protocol.unlistedSources.length === 0)
    return (
      <Note title="Vaults are opening soon">There&apos;s nowhere to put money to work just yet. Check back shortly.</Note>
    );
  if (isLoading) return <Loading label="Checking your savings…" />;
  if (error) return <Note tone="error" title="We couldn't load your savings">The network didn&apos;t answer. It usually comes back in a moment.</Note>;

  const selTone = selectedPos ? vaultLook(selectedPos.label).tone : "sky";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 items-start gap-3 sm:gap-4">
        {positions.map((p) => (
          <Cartridge
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
        <Note tone="warn" title="Your money arrived, but isn't working yet">
          {fmtUnits(stuck.amount, dec)} {sym} reached your Daemon, but putting it into the vault didn&apos;t go through. Nothing is lost.
          <div className="mt-3">
            <StickerButton size="md" tone="butter" onClick={retry} loading={pending === DEPOSIT}>
              Try again
            </StickerButton>
          </div>
        </Note>
      )}

      {isOwner && asset && (
        <div className={cx("rounded-2xl border-[3px] border-[var(--st-line)] bg-[var(--st-bg)] p-4 shadow-[4px_4px_0_var(--st-shadow)] sm:p-5", `dm-t-${selTone}`)}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <div className="font-display text-xl leading-tight">Add to {selectedPos ? vaultLook(selectedPos.label).name : "a vault"}</div>
            <div className="text-xs font-bold tabular-nums text-dim">
              Wallet: {fmtUnits(userBal.asset, dec)} {sym}
            </div>
          </div>

          {/* the deposit rail */}
          <div className="mt-4">
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={frac}
              disabled={maxAmt === BigInt(0)}
              onChange={(e) => slide(Number(e.target.value))}
              aria-label="How much to save"
              className="dm-rail"
              style={{ "--p": `${frac / 10}%` } as React.CSSProperties}
            />
            <div className="dm-ticks" aria-hidden>
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className="dm-input"
              inputMode="decimal"
              placeholder={`Amount in ${sym}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount to save"
            />
            <StickerButton size="md" tone="butter" className="shrink-0" onClick={() => setAmount(formatUnits(maxAmt, dec))} disabled={maxAmt === BigInt(0)}>
              Max
            </StickerButton>
          </div>

          <StickerButton
            tone="jelly"
            size="xl"
            className="mt-4"
            onClick={deposit}
            loading={busy}
            disabled={parsed === undefined || parsed === BigInt(0) || !walletOk || blocked !== null}
          >
            Put it to work
          </StickerButton>

          <div className="mt-3 space-y-1 text-xs">
            {blocked && parsed !== undefined && <p className="font-bold text-amber-700 dark:text-amber-300">{blocked}</p>}
            {tooPrecise && <p className="font-bold text-rose-500">That&apos;s too many decimal places.</p>}
            {!walletOk && <p className="font-bold text-rose-500">You don&apos;t have enough {sym}. Grab free test dollars from the menu.</p>}
            {walletOk && shortfall > BigInt(0) && (
              <p className="text-dim">This takes two quick approvals: one to send the money to your Daemon, one to put it to work.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A vault as a game cartridge: grip on top, a label window with its line, pins at the bottom. */
function Cartridge({
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
  const capPct = p.cap !== undefined && p.cap > BigInt(0) ? Math.max(0, Math.min(100, Number((p.assets * BigInt(100)) / p.cap))) : undefined;

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

  const face = (
    <>
      <div className="dm-cart-grip">
        <span className="min-w-0 truncate font-display text-[0.95rem] leading-none sm:text-base">{look.name}</span>
        <span className="shrink-0 whitespace-nowrap text-[9px] font-extrabold uppercase tracking-wider">
          {!p.approved ? "Closed" : selected ? (
            <>
              <span className="max-sm:hidden">In the slot</span>
              <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full bg-[#1e1238] text-white sm:hidden">
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </span>
              <span className="sr-only sm:hidden">In the slot</span>
            </>
          ) : (
            ""
          )}
        </span>
      </div>
      <div className="dm-cart-window">
        <svg viewBox="0 0 120 48" className="block h-12 w-full" fill="none" stroke="#1e1238" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={look.path} />
        </svg>
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <div className="text-[11px] font-bold leading-tight text-dim">{p.approved ? look.note : "Closed to new deposits"}</div>
        <div className="mt-1.5 break-words font-display text-[clamp(1.25rem,5.4cqi,1.7rem)] leading-none tabular-nums">
          {fmtUnits(p.assets, dec, 2)} <span className="text-[0.55em] text-dim">{sym}</span>
        </div>
        <div className="mt-1 text-[11px] font-bold tabular-nums text-[color:var(--c-mint)]">+ {rewards} growing</div>
        {capPct !== undefined && (
          <div className="mt-2.5">
            <div className="h-2.5 overflow-hidden rounded-full border-2 border-[var(--st-line)] bg-[var(--surface-2)]" role="img" aria-label={`${capPct} percent of the cap used`}>
              <div className="h-full" style={{ width: `${capPct}%`, background: "var(--tone)" }} />
            </div>
            <div className="mt-1 text-[10px] font-bold text-dim">Cap {fmtUnits(p.cap, dec, 0)} {sym}</div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className={cx("dm-cart", `dm-t-${look.tone}`, !p.approved && "opacity-70")} data-selected={selected}>
      {onSelect ? (
        <button type="button" aria-pressed={selected} onClick={onSelect} className="dm-cart-main">
          {face}
        </button>
      ) : (
        <div className="dm-cart-main">{face}</div>
      )}

      {isOwner && p.shares > BigInt(0) && (
        <div className="border-t-[3px] border-dashed border-[var(--sep)] px-3 py-2.5">
          {!open ? (
            <button type="button" onClick={() => setOpen(true)} className="text-xs font-extrabold text-jelly underline-offset-4 hover:underline dark:text-jelly">
              Bring some back
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <input
                  className={cx("dm-input !px-2.5 !py-1.5 !text-sm", tooMuch && "!border-rose-500")}
                  inputMode="decimal"
                  placeholder="Amount"
                  aria-label="Amount to bring back"
                  value={max ? formatUnits(p.assets, dec) : amount}
                  onChange={(e) => {
                    setMax(false);
                    setAmount(e.target.value);
                  }}
                />
                <button type="button" onClick={() => setMax(true)} className="shrink-0 rounded-lg border-[3px] border-[var(--st-line)] px-2 text-xs font-extrabold">
                  All
                </button>
              </div>
              <StickerButton size="md" tone="mint" className="w-full !px-2 !py-1.5 !text-sm" onClick={withdraw} loading={pending === label} disabled={!shares || tooMuch}>
                Bring back
              </StickerButton>
            </div>
          )}
        </div>
      )}
      <div className="dm-cart-pins" aria-hidden />
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { zeroAddress, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { daemonHubAbi, erc6551RegistryAbi, mockChogAbi } from "@/lib/abis";
import { CHAIN_ID, contracts, env } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { fmtUnits } from "@/lib/format";
import { useProtocol } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { ChogCard } from "./ChogCard";
import { ChogFace } from "./ChogFace";
import { PageHero } from "./app/PageHero";
import { STICKER_BTN } from "./app/color";
import { Button, cx, Input, Notice } from "./ui";

/** Harvest-round limit per transaction (contract limit). */
const MAX_BATCH = 50;

/** Parses "1-40, 77" into at most MAX_BATCH distinct numbers. Never hangs or throws. */
function parseIds(text: string): { ids: bigint[]; truncated: boolean } {
  const out: bigint[] = [];
  const seen = new Set<string>();
  let truncated = false;
  try {
    const add = (v: bigint) => {
      const k = v.toString();
      if (seen.has(k)) return;
      if (out.length >= MAX_BATCH) {
        truncated = true;
        return;
      }
      seen.add(k);
      out.push(v);
    };
    for (const part of text.trim().split(/[\s,]+/)) {
      if (!part) continue;
      const range = /^(\d{1,78})-(\d{1,78})$/.exec(part);
      if (range) {
        const x = BigInt(range[1] ?? "0");
        const y = BigInt(range[2] ?? "0");
        const lo = x < y ? x : y;
        const hi = x < y ? y : x;
        const length = hi - lo + BigInt(1);
        const room = BigInt(MAX_BATCH - out.length);
        const take = length > room ? room : length;
        if (length > room) truncated = true;
        for (let i = BigInt(0); i < take; i++) add(lo + i);
      } else if (/^\d{1,78}$/.test(part)) {
        add(BigInt(part));
      }
    }
  } catch {
    return { ids: [], truncated: false };
  }
  return { ids: out, truncated };
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function Explore() {
  const router = useRouter();
  const [id, setId] = useState("");
  const valid = /^\d{1,78}$/.test(id.trim());
  const supply = useReadContract({
    address: contracts.mockChog,
    abi: mockChogAbi,
    functionName: "totalSupply",
    chainId: CHAIN_ID,
    query: { enabled: Boolean(contracts.mockChog), staleTime: 60_000 },
  });
  const total = supply.data ? Number(supply.data) : 0;

  const surprise = () => {
    if (total < 1) return;
    const pick = 1 + Math.floor(Math.random() * total);
    router.push(`/daemon/${pick}`);
  };

  return (
    <div>
      <PageHero tone="--pink" kicker="Look around" title="Find a Daemon" face={{ mood: 2, seed: 4 }}>
        Visit any Chog&apos;s Daemon. Harvest it and keep the tip, or hype it to cheer it on.
      </PageHero>

      <div className="space-y-14 px-4 py-10 sm:px-6 lg:px-10">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
          {/* the ticket: type a number, tear off a Daemon */}
          <div className="mx-auto w-full max-w-3xl [filter:drop-shadow(6px_6px_0_var(--st-shadow))] lg:mx-0">
            <div className="ticket bg-[color:var(--st-line)] p-[3px]">
              <form
                className="ticket grid min-h-[17rem] grid-rows-2 bg-[var(--st-bg)] text-[color:var(--st-fg)]"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (valid) router.push(`/daemon/${id.trim()}`);
                }}
              >
                <label className="flex flex-col justify-center gap-1 px-8 pt-3 sm:px-12">
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-dim">Admit one Daemon &middot; Chog number</span>
                  <span className="flex items-center gap-2 border-b-4 border-dashed border-[color:var(--st-line)]/30 transition-colors has-[input:focus-visible]:border-jelly">
                    <span aria-hidden className="font-display text-5xl text-jelly sm:text-7xl">
                      #
                    </span>
                    <input
                      inputMode="numeric"
                      placeholder="0000"
                      value={id}
                      onChange={(e) => setId(e.target.value.replace(/[^\d]/g, ""))}
                      aria-label="Chog number"
                      className="w-full min-w-0 bg-transparent py-1 font-display text-5xl outline-none placeholder:text-dim/40 sm:text-7xl"
                    />
                  </span>
                </label>
                <div className="flex flex-wrap content-center items-center justify-between gap-x-4 gap-y-3 border-t-[3px] border-dashed border-[color:var(--st-line)]/50 px-8 py-3 sm:px-12">
                  <span className="text-sm text-dim">{total > 0 ? `${total.toLocaleString()} Chogs minted so far` : "Pick any number you like"}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={surprise}
                      disabled={total < 1}
                      className="bouncy stk squish inline-flex items-center gap-2 !rounded-full bg-butter px-4 py-2.5 text-sm font-bold text-[#1e1238] disabled:animate-none disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
                        <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" strokeWidth="3.4" />
                      </svg>
                      Surprise me
                    </button>
                    <Button type="submit" size="lg" className={STICKER_BTN} disabled={!valid || !contracts.mockChog}>
                      Visit
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* preview card, or a sleepy placeholder until a number is typed */}
          <div className="mx-auto w-full max-w-[15rem] lg:mx-0">
            {valid && contracts.mockChog ? (
              <div className="animate-pop">
                <ChogCard tokenId={BigInt(id.trim())} />
              </div>
            ) : (
              <div className="stk flex aspect-[3/4] flex-col items-center justify-center gap-3 !rounded-[1.25rem] border-dashed p-5 text-center !shadow-none">
                <ChogFace className="h-24 w-24 -rotate-3" />
                <p className="text-sm font-semibold text-dim">Type a number and its card shows up here.</p>
              </div>
            )}
          </div>
        </div>

        <HarvestRound />
      </div>
    </div>
  );
}

/** Check many Daemons at once and harvest every ready one in a single go. */
function HarvestRound() {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const { address: user } = useAccount();
  const { asset } = useProtocol();
  const { run, pending } = useTx();
  const [text, setText] = useState("");
  const [scan, setScan] = useState<{ account: Address; tokenId: bigint; bounty: bigint }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  if (!contracts.hub) {
    return (
      <section className="stk flex items-center gap-5 !rounded-[1.5rem] border-dashed p-5 sm:p-7">
        <ChogFace className="hidden h-20 w-20 shrink-0 -rotate-6 sm:block" />
        <div>
          <h2 className="font-display text-2xl">Harvest rounds</h2>
          <p className="mt-1 text-sm text-dim">Harvesting many Daemons at once is coming soon. You can still harvest them one by one.</p>
        </div>
      </section>
    );
  }

  const doScan = async () => {
    if (!client || !contracts.mockChog) return;
    setErr(null);
    setScanning(true);
    try {
      const { ids } = parseIds(text);
      if (ids.length === 0) throw new Error("none");
      const accounts = (
        contracts.accountImpl
          ? await client.multicall({
              allowFailure: false,
              contracts: ids.map((id) => ({
                address: contracts.registry,
                abi: erc6551RegistryAbi,
                functionName: "account" as const,
                args: [contracts.accountImpl!, env.salt, BigInt(CHAIN_ID), contracts.mockChog!, id] as const,
              })),
            })
          : await client.multicall({
              allowFailure: false,
              contracts: ids.map((id) => ({ address: contracts.mockChog!, abi: mockChogAbi, functionName: "daemonOf" as const, args: [id] as const })),
            })
      ) as Address[];
      const tips: bigint[] = [];
      for (const part of chunk(accounts, MAX_BATCH)) {
        tips.push(...(await client.readContract({ address: contracts.hub!, abi: daemonHubAbi, functionName: "pendingBounties", args: [part] })));
      }
      setScan(
        accounts.map((account, i) => ({ account, tokenId: ids[i] ?? BigInt(0), bounty: tips[i] ?? BigInt(0) })).filter((r) => r.account !== zeroAddress),
      );
    } catch (e) {
      setErr(e instanceof Error && e.message === "none" ? "Enter at least one Chog number." : friendlyError(e));
      setScan(null);
    } finally {
      setScanning(false);
    }
  };

  const parsedIds = parseIds(text);
  const ready = scan?.filter((r) => r.bounty > BigInt(0)) ?? [];
  const total = ready.reduce((s, r) => s + r.bounty, BigInt(0));

  const harvestAll = async () => {
    if (!user) return;
    const batches = chunk(ready.map((r) => r.account), MAX_BATCH);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i] ?? [];
      const label = batches.length > 1 ? `Harvest round ${i + 1} of ${batches.length}` : "Harvest round";
      const r = await run(
        label,
        async (config) => {
          const { request } = await simulateContract(config, {
            address: contracts.hub!,
            abi: daemonHubAbi,
            functionName: "compoundMany",
            args: [batch],
            account: user,
            chainId: CHAIN_ID,
          });
          return writeContract(config, request);
        },
        { done: "Round complete! Tips are in your wallet" },
      );
      if (r?.status !== "success") break;
    }
  };

  return (
    <section className="stk grid overflow-hidden !rounded-[1.75rem] !shadow-[6px_6px_0_var(--st-shadow)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* colour block: what it is and where to type the numbers */}
      <div className="split-a relative z-10 bg-butter p-6 pb-10 text-[#1e1238] sm:p-8 md:pb-8 md:pr-20">
        <div aria-hidden className="tape-bg absolute inset-0 opacity-60" />
        <div className="relative">
          <h2 className="font-display text-3xl leading-none sm:text-4xl">Go on a harvest round</h2>
          <p className="mt-3 text-sm font-medium">Check a bunch of Daemons and harvest every ready one at once. You keep all the tips.</p>
          <form
            className="mt-5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (parsedIds.ids.length > 0 && !scanning) void doScan();
            }}
          >
            <Input
              aria-label="Chog numbers to check"
              placeholder="e.g. 1-20, 42"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="!rounded-xl !border-[3px] !border-[#1e1238] !bg-white !text-[#1e1238] placeholder:!text-[#1e1238]/50"
            />
            <Button type="submit" loading={scanning} disabled={parsedIds.ids.length === 0} className="shrink-0 !border-[3px] !border-[#1e1238] !shadow-[3px_3px_0_#1e1238]">
              Check
            </Button>
          </form>
          {parsedIds.truncated && (
            <p className="mt-2 text-xs font-semibold">
              Up to {MAX_BATCH} Chogs per round. We&apos;ll check the first {MAX_BATCH}.
            </p>
          )}
          {err && (
            <div className="mt-3">
              <Notice tone="error">{err}</Notice>
            </div>
          )}
        </div>
      </div>

      {/* dark block: the tally */}
      <div className="split-b relative z-20 -mt-3.5 bg-night px-6 pb-8 pt-12 text-white sm:px-8 md:z-0 md:-ml-[3.2rem] md:mt-0 md:pl-20 md:pt-8">
        <div className="grid grid-cols-2 gap-3">
          <Counter label="Ready to harvest" dim={!scan}>
            <span className="text-white">{scan ? ready.length : "0"}</span>
            {scan && <span className="ml-1.5 text-lg text-white/55">of {scan.length}</span>}
          </Counter>
          <Counter label="Your total tip" dim={!scan}>
            <span className="text-butter">{scan ? fmtUnits(total, asset?.decimals ?? 18, 2) : "0"}</span>
            {scan && asset?.symbol && <span className="ml-1.5 text-lg text-butter/70">{asset.symbol}</span>}
          </Counter>
        </div>
        {scan ? (
          <Button
            variant="spark"
            size="lg"
            className="mt-5 w-full !border-[3px] !border-white !shadow-[4px_4px_0_var(--pink)] hover:-translate-y-0.5"
            onClick={harvestAll}
            disabled={!user || ready.length === 0}
            loading={pending?.startsWith("Harvest round") ?? false}
          >
            {!user ? "Sign in to harvest" : ready.length === 0 ? "Nothing ready yet" : `Harvest ${ready.length} Daemon${ready.length === 1 ? "" : "s"}`}
          </Button>
        ) : (
          <p className="mt-5 text-sm text-white/65">Type some Chog numbers, press Check, and the tally shows up here.</p>
        )}
      </div>
    </section>
  );
}

/** Big arcade-style counter. */
function Counter({ label, dim, children }: { label: string; dim?: boolean; children: ReactNode }) {
  return (
    <div className={cx("min-w-0 rounded-2xl border-[3px] border-white/25 bg-white/[0.06] px-4 py-3", dim && "opacity-70")}>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">{label}</div>
      <div className="mt-1 flex items-baseline truncate font-display text-5xl leading-none tabular-nums">{children}</div>
    </div>
  );
}

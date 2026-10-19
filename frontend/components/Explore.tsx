"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Button, Input, Notice } from "./ui";

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
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold leading-none tracking-tight">Find a Daemon</h1>
        <p className="mt-2 max-w-xl text-lg text-dim">Visit any Chog&apos;s Daemon. Harvest it and keep the tip, or hype it to cheer it on.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section className="clay rounded-[2rem] p-5 sm:p-7">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) router.push(`/daemon/${id.trim()}`);
            }}
          >
            <label className="clay-sunk flex flex-1 items-center gap-2 rounded-full px-5">
              <span className="font-display text-3xl font-extrabold text-dim">#</span>
              <input
                inputMode="numeric"
                placeholder="Chog number"
                value={id}
                onChange={(e) => setId(e.target.value.replace(/[^\d]/g, ""))}
                aria-label="Chog number"
                className="w-full min-w-0 bg-transparent py-3.5 font-display text-2xl font-bold outline-none placeholder:text-dim/60"
              />
            </label>
            <Button type="submit" size="lg" disabled={!valid || !contracts.mockChog}>
              Visit
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-dim">
            <button onClick={surprise} disabled={total < 1} className="rounded-full bg-jelly/12 px-4 py-2 font-semibold text-jelly-deep transition hover:bg-jelly/20 disabled:opacity-40 dark:text-jelly-soft">
              Surprise me
            </button>
            {total > 0 && <span>{total.toLocaleString()} Chogs minted so far</span>}
          </div>
          {valid && contracts.mockChog && (
            <div className="mt-6 max-w-[15rem] animate-pop">
              <ChogCard tokenId={BigInt(id.trim())} />
            </div>
          )}
        </section>
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
      <section className="clay rounded-[2rem] p-5 sm:p-7">
        <h2 className="font-display text-xl font-bold">Harvest rounds</h2>
        <p className="mt-2 text-sm text-dim">Harvesting many Daemons at once is coming soon. You can still harvest them one by one.</p>
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
    <section className="relative overflow-hidden rounded-[2rem] bg-night p-5 text-white sm:p-7">
      <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-jelly/40 blur-3xl" />
      <h2 className="relative font-display text-2xl font-bold">Go on a harvest round</h2>
      <p className="relative mt-1 text-sm text-white/70">Check a bunch of Daemons and harvest every ready one at once. You keep all the tips.</p>
      <div className="relative mt-5 flex gap-2">
        <Input placeholder="e.g. 1-20, 42" value={text} onChange={(e) => setText(e.target.value)} className="!bg-white/10 !text-white placeholder:!text-white/40" />
        <Button variant="secondary" onClick={doScan} loading={scanning} disabled={parsedIds.ids.length === 0} className="!bg-white !text-jelly-deep">
          Check
        </Button>
      </div>
      {parsedIds.truncated && <p className="relative mt-2 text-xs text-amber-300">Up to {MAX_BATCH} Chogs per round. We&apos;ll check the first {MAX_BATCH}.</p>}
      {err && (
        <div className="relative mt-3">
          <Notice tone="error">{err}</Notice>
        </div>
      )}
      {scan && (
        <div className="relative mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="text-xs text-white/60">Ready to harvest</div>
              <div className="font-display text-2xl font-bold">
                {ready.length} <span className="text-base text-white/60">of {scan.length}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="text-xs text-white/60">Your total tip</div>
              <div className="font-display text-2xl font-bold tabular-nums text-[#ffb08a]">
                {fmtUnits(total, asset?.decimals ?? 18, 2)} <span className="text-base">{asset?.symbol ?? ""}</span>
              </div>
            </div>
          </div>
          <Button variant="spark" size="lg" className="w-full" onClick={harvestAll} disabled={!user || ready.length === 0} loading={pending?.startsWith("Harvest round") ?? false}>
            {!user ? "Sign in to harvest" : ready.length === 0 ? "Nothing ready yet" : `Harvest ${ready.length} Daemon${ready.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </section>
  );
}

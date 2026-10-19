"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { zeroAddress, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { daemonHubAbi, erc6551RegistryAbi, mockChogAbi } from "@/lib/abis";
import { CHAIN_ID, contracts, env } from "@/lib/config";
import { errorMessage, fmtUnits } from "@/lib/format";
import { useProtocol } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { ChogCard } from "./ChogCard";
import { Button, Card, Input, Notice } from "./ui";

/** DaemonHub.MAX_BATCH: both pendingBounties and compoundMany revert above this. */
const MAX_BATCH = 50;

/**
 * Parses "1-40, 77" into at most MAX_BATCH distinct ids. Uses BigInt, caps range length BEFORE
 * looping (so "1-99999999999999999999" can't hang) and never throws (it runs during render).
 */
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

/** Batch compound through DaemonHub: one tx, bounties paid to the caller. */
function HubPanel() {
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
      <Card title="🤖 Batch compound">
        <Notice tone="warn">DaemonHub isn&apos;t configured (NEXT_PUBLIC_DAEMON_HUB). You can still compound Daemons one by one.</Notice>
      </Card>
    );
  }

  const doScan = async () => {
    if (!client || !contracts.mockChog) return;
    setErr(null);
    setScanning(true);
    try {
      const { ids } = parseIds(text);
      if (ids.length === 0) throw new Error("Enter at least one token id.");
      let accounts: Address[];
      if (contracts.accountImpl) {
        const res = await client.multicall({
          allowFailure: false,
          contracts: ids.map((id) => ({
            address: contracts.registry,
            abi: erc6551RegistryAbi,
            functionName: "account" as const,
            args: [contracts.accountImpl!, env.salt, BigInt(CHAIN_ID), contracts.mockChog!, id] as const,
          })),
        });
        accounts = res as Address[];
      } else {
        const res = await client.multicall({
          allowFailure: false,
          contracts: ids.map((id) => ({ address: contracts.mockChog!, abi: mockChogAbi, functionName: "daemonOf" as const, args: [id] as const })),
        });
        accounts = res as Address[];
      }
      // pendingBounties reverts above MAX_BATCH accounts: read in chunks.
      const bounties: bigint[] = [];
      for (const part of chunk(accounts, MAX_BATCH)) {
        const got = await client.readContract({
          address: contracts.hub!,
          abi: daemonHubAbi,
          functionName: "pendingBounties",
          args: [part],
        });
        bounties.push(...got);
      }
      setScan(
        accounts
          .map((account, i) => ({ account, tokenId: ids[i] ?? BigInt(0), bounty: bounties[i] ?? BigInt(0) }))
          .filter((r) => r.account !== zeroAddress),
      );
    } catch (e) {
      setErr(errorMessage(e));
      setScan(null);
    } finally {
      setScanning(false);
    }
  };

  const parsedIds = parseIds(text);
  const ready = scan?.filter((r) => r.bounty > BigInt(0)) ?? [];
  const total = ready.reduce((s, r) => s + r.bounty, BigInt(0));

  const compoundAll = async () => {
    if (!user) return;
    const batches = chunk(ready.map((r) => r.account), MAX_BATCH);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i] ?? [];
      const label = batches.length > 1 ? `Batch compound ${i + 1}/${batches.length}` : "Batch compound";
      const r = await run(label, async (config) => {
        const { request } = await simulateContract(config, {
          address: contracts.hub!,
          abi: daemonHubAbi,
          functionName: "compoundMany",
          args: [batch],
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      });
      if (r?.status !== "success") break; // stop on revert/cancel/unknown; the user can re-scan
    }
  };

  return (
    <Card title="🤖 Batch compound" right={<span className="text-xs text-dim">via DaemonHub</span>}>
      <p className="text-sm text-dim">Be the keeper: scan token IDs (e.g. <code>1-40, 77</code>) and compound every ready Daemon (up to 50 per transaction).</p>
      <div className="mt-3 flex gap-2">
        <Input placeholder="1-20" value={text} onChange={(e) => setText(e.target.value)} />
        <Button variant="secondary" onClick={doScan} loading={scanning} disabled={parsedIds.ids.length === 0}>
          Scan
        </Button>
      </div>
      {parsedIds.truncated && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">Only the first {MAX_BATCH} ids are used per scan.</p>
      )}
      {err && (
        <div className="mt-3">
          <Notice tone="error">{err.slice(0, 240)}</Notice>
        </div>
      )}
      {scan && (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            {ready.length} of {scan.length} ready · total bounty{" "}
            <b className="tabular-nums">
              {fmtUnits(total, asset?.decimals ?? 18)} {asset?.symbol ?? ""}
            </b>
          </p>
          <Button className="w-full" onClick={compoundAll} disabled={!user || ready.length === 0} loading={pending?.startsWith("Batch compound") ?? false}>
            {!user ? "Sign in to compound" : `Compound ${ready.length} Daemon${ready.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </Card>
  );
}

export function Explore() {
  const router = useRouter();
  const [id, setId] = useState("");
  const valid = /^\d{1,78}$/.test(id.trim());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Explore</h1>
        <p className="mt-1 text-dim">Open any Chog&apos;s Daemon. Compound it for the bounty, or hype it to boost its yield.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Card title="🔎 Find a Daemon">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) router.push(`/daemon/${id.trim()}`);
            }}
          >
            <Input inputMode="numeric" placeholder="Token ID, e.g. 1" value={id} onChange={(e) => setId(e.target.value)} aria-label="Token ID" />
            <Button type="submit" disabled={!valid || !contracts.mockChog}>
              Open
            </Button>
          </form>
          {!contracts.mockChog && (
            <div className="mt-3">
              <Notice tone="warn">Contracts not deployed yet: set NEXT_PUBLIC_MOCK_CHOG.</Notice>
            </div>
          )}
          {valid && contracts.mockChog && (
            <div className="mt-4 max-w-56">
              <ChogCard tokenId={BigInt(id.trim())} />
            </div>
          )}
        </Card>
        <HubPanel />
      </div>
    </div>
  );
}

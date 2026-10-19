"use client";

import Link from "next/link";
import { getAddress } from "viem";
import { useAccount } from "wagmi";
import { addressUrl, contracts } from "@/lib/config";
import { fmtAgo, fmtUnits, shortAddr } from "@/lib/format";
import { useBalances, useChog, useDaemonAddress, useDaemonState, useNow, useProtocol } from "@/lib/hooks";
import { vibeName } from "@/lib/mood";
import { DaemonAvatar } from "../DaemonAvatar";
import { Card, Empty, Loading, Notice, Pill, Stat } from "../ui";
import { CompoundPanel } from "./CompoundPanel";
import { DeployPanel } from "./DeployPanel";
import { HypePanel } from "./HypePanel";
import { ShareCard } from "./ShareCard";
import { SweepPanel } from "./SweepPanel";
import type { DaemonCtx } from "./types";
import { YieldPanel } from "./YieldPanel";

function CopyAddr({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <a href={addressUrl(value)} target="_blank" rel="noreferrer" className="font-mono text-sm hover:underline">
        {shortAddr(value, 6)}
      </a>
      <button
        className="rounded-lg border border-line px-2 py-0.5 text-xs text-dim hover:bg-muted"
        onClick={() => void navigator.clipboard?.writeText(value)}
      >
        copy
      </button>
    </span>
  );
}

export function DaemonView({ tokenId }: { tokenId: bigint }) {
  const { address: user } = useAccount();
  const now = useNow();
  const protocol = useProtocol();
  const chog = useChog(tokenId);
  const daemon = useDaemonAddress(tokenId);
  const state = useDaemonState(daemon.address, daemon.deployed);
  const bal = useBalances(daemon.address, protocol.asset?.address, protocol.chog?.address);

  if (!contracts.mockChog) {
    return (
      <Empty emoji="🚧" title="Contracts not deployed yet">
        Set NEXT_PUBLIC_MOCK_CHOG (and the other addresses in .env.example) to load Daemons.
      </Empty>
    );
  }
  if (chog.isLoading) return <Loading label={`Loading Chog #${tokenId.toString()}…`} />;
  if (chog.error) return <Notice tone="error" title="Couldn't reach Monad Testnet">{chog.error.message.slice(0, 240)}</Notice>;
  if (chog.exists === false)
    return (
      <Empty emoji="🔍" title={`Chog #${tokenId.toString()} doesn't exist`}>
        It hasn&apos;t been minted yet. <Link href="/explore" className="underline">Try another ID</Link>.
      </Empty>
    );

  const owner = state.owner ?? chog.owner;
  const isOwner = Boolean(user && owner && getAddress(user) === getAddress(owner));
  const boosted = state.boost ? Number(state.boost.expiresAt) > now : false;
  const dec = protocol.asset?.decimals ?? 18;
  const sym = protocol.asset?.symbol ?? "";

  const ctx: DaemonCtx | undefined = daemon.address
    ? { tokenId, account: daemon.address, deployed: daemon.deployed, user, isOwner, protocol, state }
    : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {/* left: identity */}
      <div className="space-y-6">
        <Card>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black">Chog #{tokenId.toString()}</h1>
            {isOwner ? <Pill className="bg-monad/15 text-monad-700 dark:text-monad-200">You own this</Pill> : <Pill className="bg-muted text-dim">Visitor</Pill>}
          </div>
          <div className="mt-6">
            <DaemonAvatar image={chog.metadata?.image} mood={daemon.deployed ? state.mood : undefined} message={state.lastMessage} boosted={boosted} />
          </div>
          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-dim">Owner</dt>
              <dd>{owner ? <CopyAddr value={owner} /> : "–"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-dim">Daemon account</dt>
              <dd>{daemon.address ? <CopyAddr value={daemon.address} /> : daemon.isLoading ? "…" : "unknown"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-dim">Status</dt>
              <dd>{daemon.deployed ? <span className="text-emerald-600 dark:text-emerald-400">Active</span> : "Not deployed"}</dd>
            </div>
            {state.lastActivityAt !== undefined && (
              <div className="flex justify-between gap-2">
                <dt className="text-dim">Last activity</dt>
                <dd>{fmtAgo(Number(state.lastActivityAt), now)}</dd>
              </div>
            )}
          </dl>
          {chog.traits && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill className="bg-muted">🎨 bg {chog.traits.background}</Pill>
              <Pill className="bg-muted">🐸 body {chog.traits.body}</Pill>
              <Pill className="bg-muted">👀 eyes {chog.traits.eyes}</Pill>
              <Pill className="bg-monad/15 text-monad-700 dark:text-monad-200">✨ {vibeName(chog.traits.vibe)}</Pill>
            </div>
          )}
        </Card>
        {ctx && daemon.deployed && <ShareCard ctx={ctx} image={chog.metadata?.image} />}
      </div>

      {/* right: economics */}
      <div className="space-y-6">
        {daemon.error && !daemon.address && (
          <Notice tone="error" title="Couldn't compute the Daemon address">{daemon.error.message.slice(0, 240)}</Notice>
        )}
        {!daemon.address && !daemon.isLoading && !daemon.error && (
          <Notice tone="warn" title="Daemon address unavailable">
            Set NEXT_PUBLIC_DAEMON_ACCOUNT_IMPL (registry.account) or deploy a MockChog that exposes daemonOf().
          </Notice>
        )}
        {ctx && !daemon.deployed && !daemon.isLoading && (
          <DeployPanel tokenId={tokenId} user={user} isOwner={isOwner} canCreate={daemon.canCreate} onDeployed={() => void daemon.refetchCode()} />
        )}
        {protocol.warnings.length > 0 && (
          <Notice tone="warn" title="Configuration warning">
            <ul className="list-disc space-y-1 pl-4">
              {protocol.warnings.map((w) => (
                <li key={w} className="break-all">
                  {w}
                </li>
              ))}
            </ul>
          </Notice>
        )}
        {/* Only decode failures mean "ABI may not match"; transient RPC errors are not that. */}
        {ctx && daemon.deployed && state.decodeFailures > 0 && !state.isLoading && (
          <Notice tone="warn" title="Some reads failed to decode">
            The deployed account doesn&apos;t answer every IDaemonAccount view. The implementation address or ABI may not match the final deployment.
          </Notice>
        )}
        {ctx && daemon.deployed && state.decodeFailures === 0 && state.transientFailures > 0 && !state.isLoading && (
          <Notice tone="info" title="Some values are temporarily unavailable">
            The RPC didn&apos;t answer every read. They will refresh automatically.
          </Notice>
        )}

        {ctx && daemon.deployed && (
          <>
            <Card title="📊 Balances">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Total assets" value={`${fmtUnits(state.totalAssets, dec)} ${sym}`} />
                <Stat label="Lifetime yield" value={`+${fmtUnits(state.lifetimeYield, dec)} ${sym}`} />
                <Stat label={`Idle ${sym}`} value={fmtUnits(bal.asset, dec)} />
                <Stat label="MON" value={fmtUnits(bal.mon, 18)} />
                {protocol.chog && <Stat label={`$${protocol.chog.symbol}`} value={fmtUnits(bal.chog, protocol.chog.decimals, 2)} />}
              </div>
            </Card>
            <div className="grid gap-6 xl:grid-cols-2">
              <CompoundPanel ctx={ctx} />
              <HypePanel ctx={ctx} />
            </div>
            <YieldPanel ctx={ctx} />
            <SweepPanel ctx={ctx} />
            {!isOwner && (
              <p className="text-center text-xs text-dim">
                Deposits, withdrawals and sweeps are owner-only. You can still compound (and earn the bounty) or hype this Daemon.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

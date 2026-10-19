"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getAddress } from "viem";
import { useAccount } from "wagmi";
import { contracts } from "@/lib/config";
import { fmtAgo, fmtDuration, fmtUnits, shortAddr } from "@/lib/format";
import { useChog, useDaemonAddress, useDaemonState, useNow, useProtocol } from "@/lib/hooks";
import { BACKGROUNDS, BODIES, EYES, vibeName } from "@/lib/mood";
import { DaemonAvatar } from "../DaemonAvatar";
import { cx, Empty, Loading, Segmented, Stat } from "../ui";
import { CompoundPanel } from "./CompoundPanel";
import { DeployPanel } from "./DeployPanel";
import { HypePanel } from "./HypePanel";
import { ShareButton } from "./ShareCard";
import { SweepPanel } from "./SweepPanel";
import type { DaemonCtx } from "./types";
import { YieldPanel } from "./YieldPanel";

type Tab = "harvest" | "hype" | "save";

/** `?tab=hype` / `?tab=vaults` / `?tab=harvest` links straight to a tab. */
function tabFromQuery(q: string | null): Tab | null {
  if (q === "hype") return "hype";
  if (q === "harvest") return "harvest";
  if (q === "vaults" || q === "savings" || q === "save") return "save";
  return null;
}

export function DaemonView({ tokenId }: { tokenId: bigint }) {
  const { address: user } = useAccount();
  const now = useNow();
  const protocol = useProtocol();
  const chog = useChog(tokenId);
  const daemon = useDaemonAddress(tokenId);
  const state = useDaemonState(daemon.address, daemon.deployed);
  const queryTab = tabFromQuery(useSearchParams().get("tab"));
  const [tab, setTab] = useState<Tab | null>(null);

  if (!contracts.mockChog) {
    return (
      <Empty emoji="🌙" title="Daemons are still waking up">
        The app opens as soon as the network is ready. Check back shortly.
      </Empty>
    );
  }
  if (chog.isLoading) return <Loading label={`Finding Chog #${tokenId.toString()}…`} />;
  if (chog.error)
    return (
      <Empty emoji="📡" title="We couldn't reach the network">
        It usually comes back in a moment. Try refreshing the page.
      </Empty>
    );
  if (chog.exists === false)
    return (
      <Empty emoji="🔍" title={`Chog #${tokenId.toString()} doesn't exist yet`}>
        Nobody has minted it.{" "}
        <Link href="/explore" className="font-semibold text-jelly underline-offset-4 hover:underline">
          Try another number
        </Link>
      </Empty>
    );

  const owner = state.owner ?? chog.owner;
  const isOwner = Boolean(user && owner && getAddress(user) === getAddress(owner));
  const boostLive = state.boost ? Number(state.boost.expiresAt) > now && state.boost.multiplierBps > BigInt(10_000) : false;
  const mult = boostLive && state.boost ? Number(state.boost.multiplierBps) / 10_000 : undefined;
  const dec = protocol.asset?.decimals ?? 18;
  const sym = protocol.asset?.symbol ?? "";
  const ctx: DaemonCtx | undefined = daemon.address
    ? { tokenId, account: daemon.address, deployed: daemon.deployed, user, isOwner, protocol, state }
    : undefined;
  const awake = Boolean(ctx && daemon.deployed);
  const empty = state.totalAssets !== undefined && state.totalAssets === BigInt(0);
  const current: Tab = tab ?? queryTab ?? (isOwner && empty ? "save" : "harvest");

  return (
    <div className="space-y-8">
      {/* title row */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link href={isOwner ? "/app" : "/explore"} className="grid h-10 w-10 place-items-center rounded-full clay" aria-label="Back">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-none tracking-tight">Chog #{tokenId.toString()}</h1>
        <span className={cx("rounded-full px-3 py-1 text-sm font-semibold", isOwner ? "bg-jelly text-white" : "bg-surface-2 text-dim")}>
          {isOwner ? "Yours" : owner ? `Held by ${shortAddr(owner)}` : "Visitor"}
        </span>
        <div className="ml-auto">{ctx && awake && <ShareButton ctx={ctx} image={chog.metadata?.image} />}</div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-10">
        {/* stage */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="clay rounded-[2.25rem] px-5 pb-7 pt-6">
            <DaemonAvatar
              image={chog.metadata?.image}
              mood={awake ? state.mood : undefined}
              message={awake ? state.lastMessage : undefined}
              boosted={boostLive}
              multiplier={mult}
            />
            {chog.traits && (
              <dl className="mt-7 grid grid-cols-2 gap-2 text-sm">
                <Trait k="Vibe" v={vibeName(chog.traits.vibe)} />
                <Trait k="Body" v={BODIES[chog.traits.body] ?? "Mystery"} />
                <Trait k="Eyes" v={EYES[chog.traits.eyes] ?? "Mystery"} />
                <Trait k="Backdrop" v={BACKGROUNDS[chog.traits.background] ?? "Mystery"} />
              </dl>
            )}
            {awake && daemon.address && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-dim hover:text-fg">Daemon wallet details</summary>
                <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3 py-2">
                  <span className="truncate font-mono text-xs">{daemon.address}</span>
                  <button className="shrink-0 text-xs font-semibold text-jelly" onClick={() => void navigator.clipboard?.writeText(daemon.address!)}>
                    Copy
                  </button>
                </div>
                {state.lastActivityAt !== undefined && <p className="mt-2 text-xs text-dim">Last active {fmtAgo(Number(state.lastActivityAt), now)}</p>}
              </details>
            )}
          </div>
        </aside>

        {/* actions */}
        <div className="space-y-6">
          {ctx && !daemon.deployed && !daemon.isLoading && (
            <DeployPanel tokenId={tokenId} user={user} isOwner={isOwner} canCreate={daemon.canCreate} onDeployed={() => void daemon.refetchCode()} />
          )}
          {!ctx && !daemon.isLoading && (
            <Empty emoji="🌙" title="This Daemon can't be reached yet">
              Check back in a little while.
            </Empty>
          )}

          {ctx && awake && (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Stat label="Saved" value={`${fmtUnits(state.totalAssets, dec, 2)}`} hint={sym} />
                <Stat label="Earned so far" value={`+${fmtUnits(state.lifetimeYield, dec, 2)}`} hint={sym} tone="mint" />
                <Stat label="Boost" value={mult ? `${mult.toFixed(2)}×` : "1.00×"} hint={boostLive && state.boost ? `${fmtDuration(Number(state.boost.expiresAt) - now)} left` : "hype to boost"} tone={mult ? "spark" : undefined} />
                <Stat
                  label="Next harvest"
                  value={
                    state.nextCompoundAt !== undefined && Number(state.nextCompoundAt) > now ? fmtDuration(Number(state.nextCompoundAt) - now) : "Ready"
                  }
                  hint={state.nextCompoundAt !== undefined && Number(state.nextCompoundAt) > now ? "resting" : "anyone can do it"}
                  tone="jelly"
                />
              </div>

              <section className="clay rounded-[2rem] p-5 sm:p-7">
                <Segmented<Tab>
                  label="What do you want to do?"
                  value={current}
                  onChange={setTab}
                  options={[
                    { value: "harvest", label: "Harvest" },
                    { value: "hype", label: "Hype" },
                    { value: "save", label: isOwner ? "Savings" : "Vaults" },
                  ]}
                />
                <div key={current} className="mt-6" style={{ animation: "rise .4s ease both" }}>
                  {current === "harvest" && <CompoundPanel ctx={ctx} />}
                  {current === "hype" && <HypePanel ctx={ctx} />}
                  {current === "save" && <YieldPanel ctx={ctx} />}
                </div>
              </section>

              <SweepPanel ctx={ctx} />

              {!isOwner && (
                <p className="text-center text-sm text-dim">
                  This isn&apos;t your Chog, but you can still harvest it (and keep the tip) or hype it to cheer it on.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Trait({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-2">
      <dt className="text-xs text-dim">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

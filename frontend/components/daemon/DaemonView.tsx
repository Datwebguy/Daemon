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
        <div className="ml-auto">{ctx && awake && <ShareButton ctx={ctx} image={chog.image} />}</div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-10">
        {/* stage */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="clay rounded-[2.25rem] px-5 pb-7 pt-6">
            <DaemonAvatar
              images={chog.images}
              name={chog.realName ?? `Chog #${tokenId.toString()}`}
              mood={awake ? state.mood : undefined}
              message={awake ? state.lastMessage : undefined}
              boosted={boostLive}
              multiplier={mult}
            />
            <Traits chog={chog} />
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

type ChogData = ReturnType<typeof useChog>;

const TIER_STYLE: Record<string, string> = {
  common: "bg-slate-400/20 text-slate-700 dark:text-slate-300",
  uncommon: "bg-emerald-400/20 text-emerald-700 dark:text-emerald-300",
  rare: "bg-sky-400/20 text-sky-700 dark:text-sky-300",
  epic: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
  legendary: "bg-amber-400/25 text-amber-700 dark:text-amber-300",
};
const SHOWN = ["Head", "Eyes", "Accessory", "Body", "Background", "Form"] as const;
const isEmpty = (v: string) => !v || /^(none|null|undefined|-)$/i.test(v);

/** The Chog's real traits; falls back to the Daemon's own invented traits if the art data is unavailable. */
function Traits({ chog }: { chog: ChogData }) {
  const find = (name: string) => chog.attributes.find((a) => a.trait_type.toLowerCase() === name.toLowerCase())?.value;
  const tier = find("Tier");
  const chips = SHOWN.map((k) => ({ k, v: find(k) })).filter((c): c is { k: (typeof SHOWN)[number]; v: string } => c.v !== undefined && !isEmpty(c.v));

  if (chog.attributes.length > 0 && (tier || chips.length > 0)) {
    return (
      <div className="mt-7">
        {chog.realName && <p className="mb-3 text-center text-xs text-dim">{chog.realName} · testnet replica</p>}
        {tier && !isEmpty(tier) && (
          <div className="mb-3 flex justify-center">
            <span
              className={cx(
                "rounded-full px-4 py-1.5 font-display text-base font-extrabold tracking-wide",
                TIER_STYLE[tier.toLowerCase()] ?? "bg-surface-2 text-fg",
              )}
            >
              {tier}
            </span>
          </div>
        )}
        <dl className="flex flex-wrap justify-center gap-1.5 text-xs">
          {chips.map((c) => (
            <div key={c.k} className="rounded-full bg-surface-2 px-3 py-1.5">
              <dt className="inline text-dim">{c.k}: </dt>
              <dd className="inline font-semibold">{c.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  if (!chog.traits) return null;
  return (
    <dl className="mt-7 grid grid-cols-2 gap-2 text-sm">
      <Trait k="Vibe" v={vibeName(chog.traits.vibe)} />
      <Trait k="Body" v={BODIES[chog.traits.body] ?? "Mystery"} />
      <Trait k="Eyes" v={EYES[chog.traits.eyes] ?? "Mystery"} />
      <Trait k="Backdrop" v={BACKGROUNDS[chog.traits.background] ?? "Mystery"} />
    </dl>
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

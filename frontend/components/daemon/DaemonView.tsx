"use client";

import "@/app/(app)/daemon.css";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { contracts } from "@/lib/config";
import { fmtAgo, fmtDuration, fmtUnits, shortAddr } from "@/lib/format";
import { useChog, useDaemonAddress, useDaemonState, useNow, useProtocol } from "@/lib/hooks";
import { BACKGROUNDS, BODIES, EYES, moodOf, vibeName } from "@/lib/mood";
import { cx } from "@/lib/cx";
import { DaemonAvatar } from "../DaemonAvatar";
import { Note, PadIcon, type Tone } from "./bits";
import { CompoundPanel } from "./CompoundPanel";
import { DeployPanel } from "./DeployPanel";
import { HypePanel } from "./HypePanel";
import { ShareButton } from "./ShareCard";
import { StateScreen } from "./StateScreen";
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

const PADS: { id: Tab; label: string; icon: "harvest" | "hype" | "vaults"; tone: Tone }[] = [
  { id: "harvest", label: "Harvest", icon: "harvest", tone: "butter" },
  { id: "hype", label: "Hype", icon: "hype", tone: "pink" },
  { id: "save", label: "Vaults", icon: "vaults", tone: "sky" },
];

export function DaemonView({ tokenId }: { tokenId: bigint }) {
  const { address: user } = useAccount();
  const now = useNow();
  const protocol = useProtocol();
  const chog = useChog(tokenId);
  const daemon = useDaemonAddress(tokenId);
  const state = useDaemonState(daemon.address, daemon.deployed);
  const queryTab = tabFromQuery(useSearchParams().get("tab"));

  if (!contracts.mockChog) {
    return (
      <StateScreen title="Daemons are still waking up" mood={4}>
        The app opens as soon as the network is ready. Check back shortly.
      </StateScreen>
    );
  }
  if (chog.isLoading) return <StateScreen title={`Finding Chog #${tokenId.toString()}`} loading />;
  if (chog.error)
    return (
      <StateScreen title="We couldn't reach the network" mood={4} seed={1}>
        It usually comes back in a moment. Try refreshing the page.
      </StateScreen>
    );
  if (chog.exists === false)
    return (
      <StateScreen
        title={`Chog #${tokenId.toString()} doesn't exist yet`}
        mood={2}
        action={
          <Link href="/explore" className="dm-btn dm-btn-lg dm-t-jelly font-display">
            Find another Chog
          </Link>
        }
      >
        Nobody has minted it.
      </StateScreen>
    );

  return <DaemonScreen tokenId={tokenId} user={user} now={now} protocol={protocol} chog={chog} daemon={daemon} state={state} queryTab={queryTab} />;
}

type ChogData = ReturnType<typeof useChog>;

/** The whole page once the data is in: the stage on the left, the deck on the right. */
export function DaemonScreen({
  tokenId,
  user,
  now,
  protocol,
  chog,
  daemon,
  state,
  queryTab,
}: {
  tokenId: bigint;
  user?: Address;
  now: number;
  protocol: DaemonCtx["protocol"];
  chog: ChogData;
  daemon: Pick<ReturnType<typeof useDaemonAddress>, "address" | "deployed" | "isLoading" | "canCreate" | "refetchCode">;
  state: DaemonCtx["state"];
  queryTab: Tab | null;
}) {
  const [tab, setTab] = useState<Tab | null>(null);
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
  const moodNow = awake ? state.mood : undefined;
  const wall = moodOf(moodNow)?.hex ?? "#94a3b8";
  const readyAt = state.nextCompoundAt !== undefined ? Number(state.nextCompoundAt) : undefined;
  const resting = readyAt !== undefined && readyAt > now;
  const padNote: Record<Tab, string> = {
    harvest: !awake ? "Keep the tip" : resting ? `Rests ${fmtDuration((readyAt ?? 0) - now)}` : "Ready, keep the tip",
    hype: mult ? `Boost x${mult.toFixed(2)}` : "Cheer it on",
    save: isOwner ? "Earn rewards" : "See the vaults",
  };
  const idx = PADS.findIndex((p) => p.id === current);
  const pad = PADS[idx] ?? PADS[0]!;

  return (
    <div className="dm-root" style={{ "--mood": wall } as CSSProperties}>
      {/* ------------------------------ the stage ------------------------------ */}
      <section className="dm-stage" aria-label={`Chog #${tokenId.toString()}`}>
        <div aria-hidden className="dm-layer dm-pop" />
        <div aria-hidden className="dm-layer dm-ink" />
        <div aria-hidden className="dm-layer dm-wall slash">
          <div className="dots absolute inset-0 opacity-70" />
          <div className="tape-bg absolute inset-x-0 top-0 h-16 opacity-70" />
          <span className="dm-watermark font-display">#{tokenId.toString()}</span>
        </div>

        <div className="dm-stage-inner">
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Link
                href={isOwner ? "/app" : "/explore"}
                aria-label="Back"
                className="sticker squish grid h-10 w-10 shrink-0 sm:h-11 sm:w-11 place-items-center !rounded-full !shadow-[3px_3px_0_var(--st-shadow)]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </Link>
              <h1
                className="sticker -rotate-2 !rounded-xl px-3 py-1.5 font-display text-lg leading-none sm:px-3.5 sm:text-2xl"
                style={{ background: "var(--butter)" }}
              >
                Chog #{tokenId.toString()}
              </h1>
            </div>
            {ctx && awake && <ShareButton ctx={ctx} images={chog.images} />}
          </div>

          <DaemonAvatar
            images={chog.images}
            name={chog.realName ?? `Chog #${tokenId.toString()}`}
            mood={moodNow}
            boosted={boostLive}
            multiplier={mult}
          >
            <TraitStickers chog={chog} />
          </DaemonAvatar>
          <TraitList chog={chog} className="mt-6 sm:mt-9 lg:hidden" />

          <HeldBy isOwner={isOwner} owner={owner} className="mt-5 self-start sm:mt-7 lg:absolute lg:bottom-5 lg:left-6 lg:mt-0" />

          <Bubble
            text={awake ? state.lastMessage : undefined}
            asleep={moodNow === undefined}
            className="mt-5 -mb-9 sm:mt-8 sm:-mb-10 lg:absolute lg:bottom-[4.4rem] lg:left-6 lg:-right-[1.6rem] lg:mb-0 lg:mt-0"
          />
        </div>
      </section>

      {/* ------------------------------- the deck ------------------------------ */}
      <section className="dm-deck" aria-label="Controls">
        {ctx && !daemon.deployed && !daemon.isLoading && (
          <DeployPanel tokenId={tokenId} user={user} isOwner={isOwner} canCreate={daemon.canCreate} onDeployed={() => void daemon.refetchCode()} />
        )}
        {ctx && daemon.isLoading && <Note>Looking for this Daemon…</Note>}
        {!ctx && !daemon.isLoading && (
          <Note tone="warn" title="This Daemon can't be reached yet">
            Check back in a little while.
          </Note>
        )}

        {ctx && awake && (
          <>
            {/* tape strip with the four numbers */}
            <div className="dm-strip">
              <div aria-hidden className="tape-bg h-2.5 border-b-[3px] border-[var(--st-line)]" />
              <dl className="dm-strip-grid">
                <Cell label="Saved" hint={sym || undefined}>
                  <span className="font-display">{fmtUnits(state.totalAssets, dec, 2)}</span>
                </Cell>
                <Cell label="Earned so far" hint={sym || undefined}>
                  <span className="font-display text-[color:var(--c-mint)]">+{fmtUnits(state.lifetimeYield, dec, 2)}</span>
                </Cell>
                <Cell label="Boost" hint={boostLive && state.boost ? `${fmtDuration(Number(state.boost.expiresAt) - now)} left` : "hype to boost"}>
                  <span className={cx("font-display", mult ? "text-[color:var(--c-pink)]" : "text-dim")}>x{(mult ?? 1).toFixed(2)}</span>
                </Cell>
                <Cell label="Next harvest" hint={resting ? "resting" : "anyone can do it"}>
                  <span className="dm-marker font-display">{resting ? fmtDuration((readyAt ?? 0) - now) : "Ready"}</span>
                </Cell>
              </dl>
            </div>

            {/* three pads */}
            <div role="group" aria-label="What do you want to do?" className="dm-pads">
              {PADS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={current === p.id}
                  aria-controls="dm-panel"
                  onClick={() => setTab(p.id)}
                  className={cx("dm-pad", `dm-t-${p.tone}`)}
                >
                  <PadIcon kind={p.icon} />
                  <span className="mt-0.5 font-display text-[1.05rem] leading-none sm:mt-1 sm:text-[1.4rem]">{p.label}</span>
                  <span className="text-[10px] font-bold leading-tight opacity-80 sm:text-xs">{padNote[p.id]}</span>
                </button>
              ))}
            </div>

            {/* the panel opens under the pressed pad */}
            <div className={cx("dm-panelwrap", `dm-t-${pad.tone}`)} style={{ "--i": idx } as CSSProperties}>
              <span aria-hidden className="dm-notch" />
              <div id="dm-panel" key={current} className="sticker dm-panel @container" style={{ animation: "rise .4s ease both" }}>
                {current === "harvest" && <CompoundPanel ctx={ctx} />}
                {current === "hype" && <HypePanel ctx={ctx} />}
                {current === "save" && <YieldPanel ctx={ctx} />}
              </div>
            </div>

            {daemon.address && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-dim hover:text-fg">Daemon wallet details</summary>
                <div className="dm-note mt-2 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">{daemon.address}</span>
                  <button className="shrink-0 text-xs font-extrabold text-jelly underline-offset-4 hover:underline" onClick={() => void navigator.clipboard?.writeText(daemon.address!)}>
                    Copy
                  </button>
                </div>
                {state.lastActivityAt !== undefined && <p className="mt-2 text-xs text-dim">Last active {fmtAgo(Number(state.lastActivityAt), now)}</p>}
              </details>
            )}

            {!isOwner && (
              <p className="text-center text-sm text-dim">
                This isn&apos;t your Chog, but you can still harvest it (and keep the tip) or hype it to cheer it on.
              </p>
            )}

            <SweepPanel ctx={ctx} />
          </>
        )}
      </section>
    </div>
  );
}

function Cell({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="dm-cell">
      <dt className="text-[11px] font-extrabold uppercase tracking-wider text-dim">{label}</dt>
      <dd className="dm-num">{children}</dd>
      {hint && <dd className="truncate text-xs text-dim">{hint}</dd>}
    </div>
  );
}

function HeldBy({ isOwner, owner, className }: { isOwner: boolean; owner?: string; className?: string }) {
  return (
    <div
      className={cx("sticker relative z-10 -rotate-3 !rounded-xl px-3 py-1.5 text-sm font-extrabold !shadow-[3px_3px_0_var(--st-shadow)]", className)}
      style={isOwner ? { background: "var(--butter)" } : undefined}
    >
      {isOwner ? "Yours" : owner ? `Held by ${shortAddr(owner)}` : "Visitor"}
    </div>
  );
}

/** The Daemon's latest words: a big speech bubble that spills over the seam into the deck. */
function Bubble({ text, asleep, className }: { text?: string; asleep: boolean; className?: string }) {
  const line = text ? `“${text}”` : asleep ? "zzz…" : "“gm. Nothing to report yet.”";
  return (
    <div key={text} className={cx("dm-bubble sticker animate-pop relative", className)} aria-live="polite">
      <span aria-hidden className="dm-bubble-tail" />
      <p className="relative font-display text-[1.05rem] leading-tight [text-wrap:balance] sm:text-[clamp(1.2rem,2.3vw,1.9rem)]">{line}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Traits: tilted stickers scattered around the art                    */
/* ------------------------------------------------------------------ */

const TIER_HEX: Record<string, string> = {
  common: "#cbd5e1",
  uncommon: "#6ee7b7",
  rare: "#7dd3fc",
  epic: "#c4b5fd",
  legendary: "#fcd34d",
};
const SHOWN = ["Head", "Eyes", "Accessory", "Body", "Form", "Background"] as const;
const isEmpty = (v: string) => !v || /^(none|null|undefined|-)$/i.test(v);

/** Where each sticker sits against the art frame on desktop (alternating left / right). */
const SLOTS: CSSProperties[] = [
  { left: "-10%", top: "15%", rotate: "-5deg" },
  { right: "-10%", top: "23%", rotate: "4deg" },
  { left: "-12%", top: "41%", rotate: "3deg" },
  { right: "-12%", top: "47%", rotate: "-4deg" },
  { left: "-9%", top: "63%", rotate: "-3deg" },
  { right: "-10%", top: "70%", rotate: "3deg" },
];

/** The Chog's real traits; falls back to the Daemon's own invented traits if the art data is unavailable. */
function traitsOf(chog: ChogData): { tier?: string; chips: { k: string; v: string }[] } {
  const find = (name: string) => chog.attributes.find((a) => a.trait_type.toLowerCase() === name.toLowerCase())?.value;
  const tier = find("Tier");
  const real = SHOWN.map((k) => ({ k: k as string, v: find(k) })).filter((c): c is { k: string; v: string } => c.v !== undefined && !isEmpty(c.v));
  if (chog.attributes.length > 0 && (tier || real.length > 0)) return { tier: tier && !isEmpty(tier) ? tier : undefined, chips: real };
  if (!chog.traits) return { chips: [] };
  return {
    chips: [
      { k: "Vibe", v: vibeName(chog.traits.vibe) },
      { k: "Body", v: BODIES[chog.traits.body] ?? "Mystery" },
      { k: "Eyes", v: EYES[chog.traits.eyes] ?? "Mystery" },
      { k: "Backdrop", v: BACKGROUNDS[chog.traits.background] ?? "Mystery" },
    ],
  };
}

function TraitStickers({ chog }: { chog: ChogData }) {
  const { tier, chips } = traitsOf(chog);
  return (
    <>
      {tier && (
        <div
          className="sticker absolute -top-[2.1rem] left-[4%] z-10 -rotate-6 !rounded-2xl px-4 py-1.5 sm:-top-9"
          style={{ background: TIER_HEX[tier.toLowerCase()] ?? "#e2e8f0" }}
        >
          <span className="block text-[10px] font-extrabold uppercase leading-none tracking-widest opacity-70">Tier</span>
          <span className="font-display text-2xl leading-none sm:text-3xl">{tier}</span>
        </div>
      )}
      <ul className="hidden lg:block">
        {chips.slice(0, SLOTS.length).map((c, i) => (
          <li key={c.k} className="absolute z-10 max-w-[52%]" style={SLOTS[i]}>
            <div className="sticker dm-chip !rounded-xl !shadow-[3px_3px_0_var(--st-shadow)]">
              <small>{c.k}</small>
              <b>{c.v}</b>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function TraitList({ chog, className }: { chog: ChogData; className?: string }) {
  const { chips } = traitsOf(chog);
  if (chips.length === 0) return null;
  return (
    <ul className={cx("relative z-10 flex flex-wrap justify-center gap-2.5", className)}>
      {chips.map((c, i) => (
        <li key={c.k} style={{ rotate: `${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg` }}>
          <div className="sticker dm-chip !rounded-xl !shadow-[3px_3px_0_var(--st-shadow)]">
            <small>{c.k}</small>
            <b>{c.v}</b>
          </div>
        </li>
      ))}
    </ul>
  );
}

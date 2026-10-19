"use client";

import Link from "next/link";
import { useState } from "react";
import "@/app/(app)/daemon.css";
import { fmtDuration } from "@/lib/format";
import { MOODS } from "@/lib/mood";
import * as P from "@/lib/practice";
import { ChogFace } from "./ChogFace";
import { PageHero } from "./app/PageHero";
import { StickerButton } from "./daemon/bits";

const n2 = (x: number) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A no-sign-in sandbox Daemon: same rules as the real thing, pretend money, time moves when you say so. */
export function PracticeDaemon() {
  const [p, setP] = useState(P.fresh);
  const mood = P.moodId(p);
  const m = MOODS[mood]!;
  const boosted = P.boostActive(p);
  const preview = P.harvestPreview(p);
  const line = p.harvests + p.hypes === 0 && P.saved(p) === 0 ? "gm. Put me to work?" : m.lines[(p.harvests + p.hypes + Math.round(P.saved(p))) % m.lines.length];
  const wait = Math.max(0, P.readyAt(p) - p.now);

  return (
    <div>
      <PageHero tone="--mint" kicker="No sign-in" title="Practice mode" face={{ mood: 0, seed: 7 }}>
        A pretend Daemon with pretend money. Same rules as the real one. Time only moves when you fast-forward.
      </PageHero>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:gap-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:px-10">
        {/* the Daemon */}
        <div className="stk relative overflow-hidden !rounded-[1.5rem] p-4 sm:p-6" style={{ background: `color-mix(in oklab, ${m.hex} 22%, var(--st-bg))` }}>
          <div className="flex items-center justify-between gap-2">
            <span className="stk -rotate-2 !rounded-lg px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider" style={{ background: m.hex, color: "#1e1238" }}>
              {m.name}
            </span>
            {boosted && <span className="stk rotate-2 !rounded-lg bg-pink px-2.5 py-0.5 text-xs font-bold text-[#1e1238]">Boost x{p.boostMult.toFixed(2)}</span>}
          </div>
          <ChogFace mood={mood} boosted={boosted} seed={p.harvests + p.hypes} className="mx-auto mt-3 aspect-square w-40 sm:w-56" />
          <p className="stk mx-auto mt-3 max-w-xs !rounded-2xl px-4 py-2 text-center font-display text-sm leading-snug sm:text-lg" aria-live="polite">
            “{line}”
          </p>
          <ol className="mt-4 space-y-1 text-xs text-dim sm:text-sm" aria-label="What just happened">
            {p.log.slice(0, 3).map((l, i) => (
              <li key={`${i}-${l}`} className={i === 0 ? "font-bold text-fg" : undefined}>
                {l}
              </li>
            ))}
          </ol>
        </div>

        {/* the controls */}
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <dl className="stk grid grid-cols-2 !rounded-2xl text-center sm:grid-cols-4">
            {[
              ["Saved", n2(P.saved(p)), "dUSD"],
              ["Rewards waiting", n2(p.pending), "dUSD"],
              ["In your wallet", n2(p.wallet), "dUSD"],
              ["Hype jar", p.jar.toFixed(2), "MON"],
            ].map(([k, v, u], i) => (
              <div key={k} className={`px-2 py-2.5 sm:py-3 ${i % 2 ? "border-l-2" : ""} ${i > 1 ? "border-t-2 sm:border-t-0" : ""} ${i > 0 ? "sm:border-l-2" : ""} border-dashed border-[var(--sep,rgb(0_0_0/0.2))]`}>
                <dt className="text-[10px] font-extrabold uppercase tracking-wider text-dim">{k}</dt>
                <dd className="font-display text-lg leading-tight tabular-nums sm:text-2xl">{v}</dd>
                <dd className="text-[10px] text-dim">{u}</dd>
              </div>
            ))}
          </dl>

          <Block title="1. Put it to work" hint="Each vault pays rewards over time. The Degen one swings more.">
            <div className="grid grid-cols-2 gap-2.5">
              {(Object.keys(P.VAULTS) as P.VaultId[]).map((v) => (
                <StickerButton key={v} tone={v === "stable" ? "mint" : "spark"} size="md" disabled={p.wallet < 1} onClick={() => setP(P.deposit(p, v, Math.min(100, p.wallet)))}>
                  <span className="text-left leading-tight">
                    <span className="block text-sm">+100 {P.VAULTS[v].name.split(" ")[0]}</span>
                    <span className="block text-[10px] font-sans font-bold opacity-75">{P.VAULTS[v].blurb}</span>
                  </span>
                </StickerButton>
              ))}
            </div>
          </Block>

          <Block title="2. Let time pass" hint={P.saved(p) > 0 ? `Next harvest ${wait > 0 ? `in ${fmtDuration(wait)}` : "is ready"}. Tips rise the longer it waits.` : "Rewards need something saved."}>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                ["1 hour", P.HOUR],
                ["6 hours", 6 * P.HOUR],
                ["1 day", 24 * P.HOUR],
              ].map(([label, secs]) => (
                <StickerButton key={label as string} tone="sky" size="md" onClick={() => setP(P.fastForward(p, secs as number))}>
                  <span className="text-sm">+{label}</span>
                </StickerButton>
              ))}
            </div>
          </Block>

          <Block title="3. Harvest it, or cheer it on" hint={preview.ok ? `You'd keep a ${(preview.share * 100).toFixed(1)}% tip: ${n2(preview.tip)} dUSD.` : (preview.reason ?? "")}>
            <div className="grid grid-cols-2 gap-2.5">
              <StickerButton tone="jelly" size="md" disabled={!preview.ok} onClick={() => setP(P.harvest(p))}>
                <span className="text-sm">Harvest & keep tip</span>
              </StickerButton>
              <StickerButton tone="pink" size="md" onClick={() => setP(P.hype(p, 0.5))}>
                <span className="text-sm">Hype it (0.5 MON)</span>
              </StickerButton>
            </div>
          </Block>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
            <button type="button" onClick={() => setP(P.withdrawAll(p))} disabled={P.saved(p) + p.pending + p.jar <= 0} className="font-bold text-dim underline-offset-4 hover:text-fg hover:underline disabled:opacity-40">
              Take everything out
            </button>
            <button type="button" onClick={() => setP(P.fresh())} className="font-bold text-dim underline-offset-4 hover:text-fg hover:underline">
              Start over
            </button>
          </div>

          <div className="stk !rounded-2xl p-4 sm:p-5">
            <h2 className="font-display text-lg sm:text-2xl">Ready for the real thing?</h2>
            <p className="mt-1 text-xs text-dim sm:text-sm">Real Chogs, a real wallet and friends who can hype yours. It&apos;s free on the test network.</p>
            <Link href="/app" className="stk squish mt-3 inline-flex h-10 items-center !rounded-full bg-jelly px-5 text-sm font-bold text-white">
              Open my den
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-base sm:text-xl">{title}</h2>
      {hint && <p className="mb-2 text-xs text-dim sm:text-sm">{hint}</p>}
      {children}
    </div>
  );
}

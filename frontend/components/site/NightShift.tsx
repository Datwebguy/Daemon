"use client";

import Image from "next/image";
import { useState } from "react";

/** Testnet defaults (match the deployed config): tip starts at 5% and climbs to 10% over a day. */
const START = 5;
const MAX = 10;
const RAMP_H = 24;

export function NightShift() {
  const [harvest, setHarvest] = useState(40);
  const [wait, setWait] = useState(6);
  const share = START + ((MAX - START) * Math.min(wait, RAMP_H)) / RAMP_H;
  const tip = (harvest * share) / 100;
  const kept = harvest - tip;
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <section id="earn" className="relative isolate scroll-mt-24 overflow-hidden bg-night text-white">
      <Image src="/media/glass-iridescent.jpg" alt="" fill sizes="100vw" className="-z-20 animate-drift object-cover opacity-55" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_70%_at_20%_30%,transparent,rgb(11_8_20/0.92))]" />

      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
        <div className="grid gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div data-reveal>
            <h2 className="font-display text-[clamp(2.4rem,5.6vw,4.2rem)] font-extrabold leading-[0.95] tracking-tight">
              It works the night shift.
              <span className="block text-white/70 [text-shadow:0_2px_24px_rgb(11_8_20/0.9)]">You don&apos;t have to.</span>
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/75">
              Nobody runs Daemons for you, and nobody needs to. Anyone in the world can harvest any Daemon and earn a tip for it, so there&apos;s
              always someone with a reason to keep yours growing.
            </p>

            <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {[
                ["No one else holds your keys", "Only the Chog holder can move money out. Not us, not anyone."],
                ["Out in one tap", "“Take everything out” empties every vault into your wallet."],
                ["Safe to sell", "Old owners lose all access the moment a Chog changes hands."],
                ["Tips are capped", "A harvester only ever gets a small slice. The rest stays in the Daemon."],
              ].map(([t, d], i) => (
                <li key={t} data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
                  <div className="font-display text-lg font-bold">{t}</div>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">{d}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* calculator */}
          <div className="rounded-[2.25rem] border border-white/12 bg-white/[0.06] p-6 backdrop-blur-xl sm:p-8" data-reveal style={{ ["--d" as string]: "140ms" }}>
            <h3 className="font-display text-2xl font-bold">Harvest someone&apos;s Daemon</h3>
            <p className="mt-1 text-sm text-white/65">The longer a Daemon waits after it&apos;s ready, the bigger the tip.</p>

            <label className="mt-7 block">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-white/75">Rewards waiting</span>
                <span className="font-display text-xl font-bold tabular-nums">{fmt(harvest)} dUSD</span>
              </div>
              <input
                type="range"
                min={5}
                max={500}
                step={5}
                value={harvest}
                onChange={(e) => setHarvest(Number(e.target.value))}
                className="jelly-range mt-3 w-full"
                style={{ ["--p" as string]: `${((harvest - 5) / 495) * 100}%` }}
              />
            </label>

            <label className="mt-6 block">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-white/75">Hours since it was ready</span>
                <span className="font-display text-xl font-bold tabular-nums">{wait}h</span>
              </div>
              <input
                type="range"
                min={0}
                max={RAMP_H}
                step={1}
                value={wait}
                onChange={(e) => setWait(Number(e.target.value))}
                className="jelly-range mt-3 w-full"
                style={{ ["--p" as string]: `${(wait / RAMP_H) * 100}%` }}
              />
            </label>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[0.08] p-4">
                <div className="text-sm text-white/65">Your tip</div>
                <div className="mt-1 font-display text-3xl font-extrabold tabular-nums text-[#ffb08a]">{fmt(tip)}</div>
                <div className="text-xs text-white/55">{share.toFixed(1)}% of the harvest</div>
              </div>
              <div className="rounded-2xl bg-white/[0.08] p-4">
                <div className="text-sm text-white/65">Daemon keeps</div>
                <div className="mt-1 font-display text-3xl font-extrabold tabular-nums text-[#7ff0c8]">{fmt(kept)}</div>
                <div className="text-xs text-white/55">straight back to work</div>
              </div>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-white/55">
              Tips start at {START}% and rise to {MAX}% over a day. The network fee is refunded from the harvest too.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

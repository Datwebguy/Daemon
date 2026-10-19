"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChogFace } from "@/components/ChogFace";
import { MOODS } from "@/lib/mood";
import { cx } from "@/lib/cx";

/**
 * A looping SAMPLE of a day with a Daemon. It plays by itself; there is nothing to press and nothing
 * on this page runs, spends or saves anything. The real controls live in the app.
 */
type Beat = {
  when: string;
  title: string;
  line: string;
  mood: number;
  saved: number;
  boost: number;
  tip: number;
  earned: number;
};

const BEATS: Beat[] = [
  { when: "Morning", title: "1,000 dUSD goes in", line: "You put it to work in the Stable vault.", mood: 0, saved: 1000, boost: 1, tip: 0, earned: 0 },
  { when: "Noon", title: "A friend hypes it", line: "0.1 MON lands in the hype jar. Boost on for three hours.", mood: 3, saved: 1000, boost: 1.1, tip: 0, earned: 0 },
  { when: "Evening", title: "A stranger harvests it", line: "They keep a small tip for helping: 4.20 dUSD.", mood: 1, saved: 1024.5, boost: 1.1, tip: 4.2, earned: 28.7 },
  { when: "Next morning", title: "The rest goes back to work", line: "Nothing for you to do. It just grew.", mood: 1, saved: 1028.7, boost: 1, tip: 0, earned: 28.7 },
  { when: "Day four", title: "Nobody visits", line: "So sleepy. Someone hype me?", mood: 4, saved: 1041.9, boost: 1, tip: 0, earned: 41.9 },
];

const STEP_MS = 3200;

function useTween(target: number, ms = 900) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const next = a + (target - a) * e;
      from.current = next;
      setV(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DayInLife() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const b = BEATS[i]!;
  const m = MOODS[b.mood]!;

  useEffect(() => {
    if (paused) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => setI((x) => (x + 1) % BEATS.length), STEP_MS);
    return () => clearInterval(t);
  }, [paused]);

  // Pause while the tab is hidden so the loop does not run in the background.
  useEffect(() => {
    const on = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const saved = useTween(b.saved);
  const earned = useTween(b.earned);
  const tip = useTween(b.tip);
  const boost = useTween(b.boost);

  return (
    <section id="day" className="relative scroll-mt-24 overflow-hidden py-0">
      <div className="grid lg:min-h-[44rem] lg:grid-cols-[1.05fr_1fr]">
        {/* left: the Chog, on a colour wall that bleeds off the edge */}
        <div className="slash relative isolate overflow-hidden px-5 py-16 sm:px-10 lg:py-20 lg:pr-24">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 transition-colors duration-700"
            style={{ background: `linear-gradient(135deg, ${m.hex}, var(--butter) 55%, var(--pink))` }}
          />
          <div aria-hidden className="tape-bg absolute inset-0 -z-10 opacity-60" />
          <div className="mx-auto flex max-w-md flex-col items-center lg:ml-auto lg:mr-0">
            <p className="sticker !bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide" style={{ transform: "rotate(-3deg)" }}>
              Sample · plays by itself
            </p>
            <div key={`${i}-bubble`} className="sticker animate-pop mt-6 max-w-xs px-5 py-3 text-center">
              <span className="font-display text-xl leading-snug">“{m.lines[i % m.lines.length]}”</span>
            </div>
            <div className="relative mt-8 w-[min(78vw,21rem)]" style={{ transform: "rotate(-3deg)" }}>
              <ChogFace mood={b.mood} seed={i} boosted={b.boost > 1} className="aspect-square w-full" />
              {b.tip > 0 && (
                <div key={`${i}-tip`} className="sticker animate-pop absolute -right-6 top-6 !bg-butter px-3 py-1.5 font-display text-lg">
                  +{money(tip)} tip
                </div>
              )}
              {b.boost > 1 && (
                <div className="sticker animate-pop absolute -left-6 bottom-8 !bg-pink px-3 py-1.5 font-display text-lg">{boost.toFixed(2)}× boost</div>
              )}
            </div>
            <p className="mt-8 text-center font-display text-3xl text-[#1e1238]">{m.name}</p>
          </div>
        </div>

        {/* right: the day, as a tape of beats */}
        <div className="relative bg-night px-5 py-16 text-white sm:px-10 lg:py-20 lg:pl-16">
          <h2 className="font-display text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">A day with a Daemon.</h2>
          <p className="mt-3 max-w-md text-lg text-white/70">This is what happens while you do something else. It&apos;s a looping sample, so there is nothing to press here.</p>

          <ol className="mt-10 space-y-3">
            {BEATS.map((x, k) => {
              const on = k === i;
              return (
                <li
                  key={x.title}
                  className={cx(
                    "grid grid-cols-[5.5rem_1fr] items-center gap-4 rounded-2xl border-2 px-4 py-3 transition-all duration-500",
                    on ? "scale-[1.02] border-butter bg-white/10" : "border-white/10 opacity-50",
                  )}
                  aria-current={on ? "step" : undefined}
                >
                  <span className={cx("font-display text-sm", on ? "text-butter" : "text-white/60")}>{x.when}</span>
                  <span>
                    <span className="block font-display text-xl leading-tight">{x.title}</span>
                    <span className={cx("block text-sm text-white/70 transition-all", on ? "mt-1 max-h-12 opacity-100" : "max-h-0 overflow-hidden opacity-0")}>{x.line}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          <dl className="mt-8 grid grid-cols-3 border-y-2 border-white/15 py-4 text-center">
            <div>
              <dt className="text-xs text-white/60">Saved</dt>
              <dd className="font-display text-2xl tabular-nums">{money(saved)}</dd>
            </div>
            <div className="border-x-2 border-white/15">
              <dt className="text-xs text-white/60">Earned so far</dt>
              <dd className="font-display text-2xl tabular-nums text-mint">+{money(earned)}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/60">Boost</dt>
              <dd className="font-display text-2xl tabular-nums text-pink">{boost.toFixed(2)}×</dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/app" className="sticker sticker-pop squish !bg-butter px-7 py-3.5 font-bold">
              Do this for real
            </Link>
            <p className="text-sm text-white/60">The sample uses pretend numbers.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

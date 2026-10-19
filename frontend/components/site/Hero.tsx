"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MOODS } from "@/lib/mood";
import { Creature } from "../creature/Creature";
import { cx } from "../ui";

export function Hero() {
  const [mood, setMood] = useState(1);
  const [touched, setTouched] = useState(false);
  const [line, setLine] = useState(0);
  const m = MOODS[mood]!;

  // Cycle moods on its own until the visitor picks one.
  useEffect(() => {
    if (touched) return;
    const t = setInterval(() => {
      setMood((x) => (x + 1) % MOODS.length);
      setLine((l) => l + 1);
    }, 4200);
    return () => clearInterval(t);
  }, [touched]);

  const pick = (i: number) => {
    setTouched(true);
    setMood(i);
    setLine((l) => l + 1);
  };

  return (
    <section className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-32 lg:min-h-[min(100svh,54rem)] lg:pb-10">
      {/* soft mood wash that follows the selected mood */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 transition-colors duration-1000"
        style={{ background: `radial-gradient(60% 55% at 72% 45%, ${m.hex}33, transparent 70%)` }}
      />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.12fr_1fr]">
        {/* copy */}
        <div className="relative z-10">
          <p className="inline-flex items-center gap-2 rounded-full bg-surface/70 px-3.5 py-1.5 text-sm font-semibold text-dim backdrop-blur" style={{ animation: "rise .8s ease both" }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
            </span>
            Live on Monad, free to try
          </p>
          <h1
            className="mt-6 font-display text-[clamp(2.6rem,5.4vw,4.7rem)] font-extrabold leading-[0.95] tracking-[-0.035em] text-balance"
            style={{ animation: "rise .9s .08s ease both" }}
          >
            <span className="block whitespace-nowrap">Every Chog has</span>
            <span className="block whitespace-nowrap">a little daemon.</span>
            <span className="mt-2 block text-jelly">Wake yours.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-dim sm:text-xl" style={{ animation: "rise .9s .16s ease both" }}>
            Your Chog gets its own wallet and a personality to match. It saves, earns, sulks and celebrates, and it goes wherever your Chog
            goes.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3" style={{ animation: "rise .9s .24s ease both" }}>
            <Link
              href="/app"
              className="group inline-flex items-center gap-3 rounded-full bg-jelly py-3.5 pl-7 pr-3.5 text-base font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_18px_40px_-14px_var(--glow)] transition hover:bg-jelly-deep active:scale-[0.98]"
            >
              Wake your Daemon
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 transition group-hover:translate-x-0.5">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
            <a href="#how" className="rounded-full px-6 py-3.5 text-base font-semibold text-fg transition hover:bg-surface/70">
              See how it works
            </a>
          </div>
        </div>

        {/* portal + creature */}
        <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
          <div className="absolute inset-[-6%] -z-10 overflow-hidden rounded-full" aria-hidden>
            <Image
              src="/media/hero-jelly.jpg"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 560px, 92vw"
              className="animate-portal object-cover opacity-90 [mask-image:radial-gradient(circle_at_center,black_52%,transparent_71%)]"
            />
          </div>

          {/* speech bubble */}
          <div className="absolute left-1/2 top-[3%] z-20 w-[min(88%,22rem)] -translate-x-1/2">
            <div key={`${mood}-${line}`} className="glass animate-pop rounded-[1.4rem] px-5 py-3.5 text-center shadow-[0_18px_40px_-22px_var(--clay-lo)]">
              <span className="font-display text-lg font-semibold leading-snug">“{m.lines[line % m.lines.length]}”</span>
            </div>
            <div className="glass mx-auto -mt-2 h-4 w-4 rotate-45 border-t-0 border-l-0" aria-hidden />
          </div>

          <div className="absolute inset-[15%] top-[24%] animate-float">
            <Creature mood={mood} track boosted={mood === 3} className="h-full w-full drop-shadow-[0_30px_40px_rgb(81_52_201/0.35)]" />
          </div>

          {/* mood picker */}
          <div className="absolute inset-x-0 -bottom-2 z-20 flex justify-center">
            <div role="radiogroup" aria-label="Try a mood" className="glass flex gap-1 rounded-full p-1.5 shadow-[0_18px_40px_-22px_var(--clay-lo)]">
              {MOODS.map((x, i) => (
                <button
                  key={x.name}
                  role="radio"
                  aria-checked={mood === i}
                  onClick={() => pick(i)}
                  className={cx(
                    "rounded-full px-2.5 py-1.5 text-sm font-semibold transition sm:px-3.5",
                    mood === i ? "bg-fg text-bg" : "text-dim hover:bg-surface/70 hover:text-fg",
                  )}
                  title={x.blurb}
                >
                  <span aria-hidden>{x.emoji}</span>
                  <span className="ml-1 hidden sm:inline">{x.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* facts strip */}
      <dl className="mx-auto mt-16 grid max-w-6xl grid-cols-2 gap-x-6 gap-y-6 px-5 sm:px-8 md:grid-cols-4 lg:mt-14">
        {[
          ["You keep the keys", "Only the Chog holder can withdraw."],
          ["Up to 1.25×", "boost when friends hype your Daemon"],
          ["5 moods", "that react to how it's really doing"],
          ["One tap out", "take everything back, any time"],
        ].map(([k, v], i) => (
          <div key={k} className="border-t border-line pt-4" data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
            <dt className="font-display text-xl font-bold">{k}</dt>
            <dd className="mt-1 text-sm text-dim">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

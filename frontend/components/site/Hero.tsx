"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MOODS } from "@/lib/mood";
import { Creature } from "../creature/Creature";
import { cx } from "../ui";
import { Draggable } from "./Draggable";

type Puff = { id: number; x: number; y: number; e: string; dx: number };

export function Hero() {
  const [mood, setMood] = useState(1);
  const [touched, setTouched] = useState(false);
  const [line, setLine] = useState(0);
  const [squish, setSquish] = useState(0);
  const [pokes, setPokes] = useState(0);
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const idRef = useRef(0);
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

  const poke = useCallback(
    (e: React.PointerEvent) => {
      setTouched(true);
      setSquish((s) => s + 1);
      setLine((l) => l + 1);
      setPokes((p) => p + 1);
      // every 4th poke it changes its mind about how it feels
      if ((pokes + 1) % 4 === 0) setMood((x) => (x + 1) % MOODS.length);
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const emojis = ["💜", "✨", "🪙", "⭐", "💛", "🫧"];
      const batch: Puff[] = Array.from({ length: 5 }, (_, k) => ({
        id: ++idRef.current,
        x: e.clientX - r.left,
        y: e.clientY - r.top,
        e: emojis[(idRef.current + k) % emojis.length]!,
        dx: (k - 2) * 26 + (Math.random() * 14 - 7),
      }));
      setPuffs((p) => [...p, ...batch]);
      window.setTimeout(() => setPuffs((p) => p.filter((x) => !batch.some((b) => b.id === x.id))), 1100);
    },
    [pokes],
  );

  return (
    <section className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-32 lg:min-h-[min(100svh,54rem)] lg:pb-10">
      {/* colour wash fades out at the bottom so there is no hard edge */}
      <div aria-hidden className="mesh absolute inset-0 -z-20 [mask-image:linear-gradient(to_bottom,black_72%,transparent)]" />
      <div aria-hidden className="dots absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_40%,black,transparent)]" />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        {/* copy */}
        <div className="relative z-10">
          <p className="sticker inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-bold" style={{ animation: "rise .8s ease both", transform: "rotate(-2deg)" }}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mint" />
            </span>
            Live on Monad · free to try
          </p>
          <h1 className="mt-6 font-display text-[clamp(2.7rem,6.2vw,5.4rem)] leading-[0.98]" style={{ animation: "rise .9s .08s ease both" }}>
            <span className="block whitespace-nowrap">Every Chog has</span>
            <span className="block whitespace-nowrap">a little daemon.</span>
            <span className="relative mt-2 inline-block">
              <span className="relative z-10 text-jelly">Wake yours!</span>
              <svg aria-hidden viewBox="0 0 320 24" className="absolute -bottom-3 left-0 z-0 h-5 w-full" preserveAspectRatio="none">
                <path d="M4 14 C 50 2, 90 22, 140 12 S 250 4, 316 14" fill="none" stroke="var(--butter)" strokeWidth="9" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-8 max-w-[34rem] text-lg leading-relaxed text-dim sm:text-xl" style={{ animation: "rise .9s .16s ease both" }}>
            Your Chog gets its own wallet and a personality to match. It saves, earns, sulks and celebrates, and it goes wherever your Chog
            goes.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3" style={{ animation: "rise .9s .24s ease both" }}>
            <Link
              href="/app"
              className="sticker sticker-pop squish group inline-flex items-center gap-3 !bg-jelly px-7 py-3.5 text-base font-bold !text-white"
            >
              Wake your Daemon
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-jelly transition group-hover:translate-x-0.5">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
            <a href="#play" className="sticker sticker-pop squish px-6 py-3.5 text-base font-bold">
              ▶ Play with one now
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
              className="animate-portal object-cover [mask-image:radial-gradient(circle_at_center,black_50%,transparent_70%)]"
            />
          </div>

          {/* stickers you can pick up and move */}
          <Draggable rotate={-8} className="absolute left-[-2%] top-[18%] z-30" label="A sticker that says gm">
            <div className="sticker px-4 py-2 font-display text-xl">gm ☀️</div>
          </Draggable>
          <Draggable rotate={9} className="absolute right-[-1%] top-[34%] z-30" label="A tip sticker">
            <div className="sticker !bg-butter px-4 py-2 font-display text-lg">+5% tip 🪙</div>
          </Draggable>
          <Draggable rotate={-5} className="absolute bottom-[26%] left-[2%] z-30" label="A boost sticker">
            <div className="sticker !bg-pink px-4 py-2 font-display text-lg">1.25× boost ⚡</div>
          </Draggable>
          <Draggable rotate={6} className="absolute right-[6%] top-[8%] z-30 hidden sm:block" label="A star sticker">
            <div className="sticker grid h-14 w-14 place-items-center !rounded-full !bg-sky text-2xl">⭐</div>
          </Draggable>

          {/* speech bubble */}
          <div className="pointer-events-none absolute left-1/2 top-[3%] z-20 w-[min(84%,21rem)] -translate-x-1/2">
            <div key={`${mood}-${line}`} className="sticker animate-pop px-5 py-3 text-center">
              <span className="font-display text-lg leading-snug">“{m.lines[line % m.lines.length]}”</span>
            </div>
          </div>

          {/* the creature: poke it */}
          <div
            className={cx("absolute inset-[15%] top-[26%] cursor-pointer select-none", squish % 2 ? "[animation:squish-a_.5s_ease]" : "[animation:squish-b_.5s_ease]")}
            key={squish}
            onPointerDown={poke}
            role="button"
            tabIndex={0}
            aria-label="Poke the Daemon"
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSquish((s) => s + 1)}
          >
            <div className="h-full w-full animate-float">
              <Creature mood={mood} track boosted={mood === 3} className="h-full w-full drop-shadow-[0_28px_30px_rgb(81_52_201/0.3)]" />
            </div>
            {puffs.map((p) => (
              <span
                key={p.id}
                aria-hidden
                className="pointer-events-none absolute text-2xl"
                style={{ left: p.x, top: p.y, ["--dx" as string]: `${p.dx}px`, animation: "puff 1.05s ease-out forwards" }}
              >
                {p.e}
              </span>
            ))}
          </div>

          {/* mood picker */}
          <div className="absolute inset-x-0 -bottom-3 z-30 flex justify-center">
            <div role="radiogroup" aria-label="Try a mood" className="sticker flex gap-1 !rounded-full p-1.5">
              {MOODS.map((x, i) => (
                <button
                  key={x.name}
                  role="radio"
                  aria-checked={mood === i}
                  onClick={() => pick(i)}
                  className={cx(
                    "rounded-full px-2.5 py-1.5 text-sm font-bold transition sm:px-3.5",
                    mood === i ? "bg-[#1e1238] text-white" : "text-[#1e1238]/70 hover:bg-[#1e1238]/10",
                  )}
                  title={x.blurb}
                >
                  <span aria-hidden>{x.emoji}</span>
                  <span className="ml-1 hidden sm:inline">{x.name}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="absolute -bottom-12 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-xs font-bold text-dim sm:block">
            Poke it · drag the stickers · it reacts
          </p>
        </div>
      </div>

      {/* facts strip */}
      <dl className="mx-auto mt-20 grid max-w-6xl grid-cols-2 gap-4 px-5 sm:px-8 md:grid-cols-4 lg:mt-16">
        {[
          ["You keep the keys", "Only the Chog holder can withdraw.", "#ffe6f1"],
          ["Up to 1.25×", "boost when friends hype your Daemon", "#fff3c4"],
          ["5 moods", "that react to how it's really doing", "#dff4ff"],
          ["One tap out", "take everything back, any time", "#dcf7ec"],
        ].map(([k, v, bg], i) => (
          <div
            key={k}
            className="sticker sticker-pop p-4"
            data-reveal
            style={{ ["--d" as string]: `${i * 80}ms`, background: bg, transform: `rotate(${[-1.5, 1, -1, 1.5][i]}deg)` }}
          >
            <dt className="font-display text-xl">{k}</dt>
            <dd className="mt-1 text-sm font-medium text-[#1e1238]/70">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

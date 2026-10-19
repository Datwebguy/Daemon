"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MOODS } from "@/lib/mood";
import { ChogFace } from "@/components/ChogFace";
import { cx } from "../ui";
import { Draggable } from "./Draggable";

type Puff = { id: number; x: number; y: number; k: number; dx: number };

/** Little confetti shapes thrown when you poke the Chog: stars, hearts and coins, drawn, not emoji. */
function PuffShape({ k }: { k: number }) {
  const colors = ["#ff7eb6", "#ffd84d", "#5cc6ff", "#7a5af0", "#7de3b8"];
  const c = colors[k % colors.length]!;
  if (k % 3 === 0) return <svg viewBox="0 0 24 24" className="h-6 w-6"><path d="M12 2l2.9 6.6 7.1.7-5.3 4.8 1.6 7L12 17.4 5.7 21.1l1.6-7L2 9.3l7.1-.7z" fill={c} stroke="#1e1238" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
  if (k % 3 === 1) return <svg viewBox="0 0 24 24" className="h-6 w-6"><path d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z" fill={c} stroke="#1e1238" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-6 w-6"><circle cx="12" cy="12" r="9" fill={c} stroke="#1e1238" strokeWidth="1.6" /><circle cx="12" cy="12" r="4.5" fill="none" stroke="#1e1238" strokeWidth="1.4" /></svg>;
}

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
      const batch: Puff[] = Array.from({ length: 5 }, (_, k) => ({
        id: ++idRef.current,
        x: e.clientX - r.left,
        y: e.clientY - r.top,
        k: idRef.current + k,
        dx: (k - 2) * 26 + (Math.random() * 14 - 7),
      }));
      setPuffs((p) => [...p, ...batch]);
      window.setTimeout(() => setPuffs((p) => p.filter((x) => !batch.some((b) => b.id === x.id))), 1100);
    },
    [pokes],
  );

  return (
    <section className="relative isolate overflow-hidden pt-24 pb-10 sm:pt-32 sm:pb-16 lg:min-h-[min(100svh,54rem)] lg:pb-10">
      <div aria-hidden className="dots absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_40%,black,transparent)]" />

      <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 sm:gap-10 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        {/* copy */}
        <div className="relative z-10">
          <p className="sticker inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold sm:text-sm" style={{ animation: "rise .8s ease both", transform: "rotate(-2deg)" }}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mint" />
            </span>
            Live on Monad · free to try
          </p>
          <h1 className="mt-5 font-display text-[clamp(2rem,9.4vw,5.4rem)] sm:text-[clamp(2.7rem,6.2vw,5.4rem)] leading-[0.98]" style={{ animation: "rise .9s .08s ease both" }}>
            <span className="block whitespace-nowrap">Every Chog has</span>
            <span className="block whitespace-nowrap">a little daemon.</span>
            <span className="relative mt-2 inline-block">
              <span className="relative z-10 text-jelly">Wake yours!</span>
              <svg aria-hidden viewBox="0 0 320 24" className="absolute -bottom-3 left-0 z-0 h-5 w-full" preserveAspectRatio="none">
                <path d="M4 14 C 50 2, 90 22, 140 12 S 250 4, 316 14" fill="none" stroke="var(--butter)" strokeWidth="9" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-[15px] leading-relaxed text-dim sm:mt-8 sm:text-xl" style={{ animation: "rise .9s .16s ease both" }}>
            Your Chog gets its own wallet and a personality to match. It saves, earns, sulks and celebrates, and it goes wherever your Chog
            goes.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2.5 sm:mt-9 sm:gap-3" style={{ animation: "rise .9s .24s ease both" }}>
            <Link
              href="/app"
              className="sticker sticker-pop squish group inline-flex items-center gap-2.5 !bg-jelly px-5 py-2.5 text-sm font-bold !text-white sm:gap-3 sm:px-7 sm:py-3.5 sm:text-base"
            >
              Wake your Daemon
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white sm:h-8 sm:w-8 text-jelly transition group-hover:translate-x-0.5">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
            <a href="#day" className="sticker sticker-pop squish px-5 py-2.5 text-sm font-bold sm:px-6 sm:py-3.5 sm:text-base">
              See a day in its life
            </a>
          </div>
        </div>

        {/* portal + creature */}
        <div className="relative mx-auto aspect-square w-full max-w-[22rem] sm:max-w-[34rem]">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 overflow-hidden rounded-[2.5rem] border-[3px] border-[var(--st-line)] shadow-[8px_8px_0_var(--st-shadow)]"
          >
            <Image
              src="/media/hero-jelly.jpg"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 560px, 92vw"
              className="animate-drift object-cover"
            />
            {/* the mood colours the wall, so the stage always matches the Chog on it */}
            <div className="absolute inset-0 transition-colors duration-700" style={{ background: `linear-gradient(160deg, ${m.hex}59, transparent 55%, ${m.hex}40)` }} />
            <div className="dots absolute inset-0 opacity-40" />
          </div>

          {/* stickers you can pick up and move */}
          <Draggable rotate={-8} className="absolute left-[4%] top-[17%] z-30" label="A sticker that says gm">
            <div className="sticker px-3 py-1.5 font-display text-base sm:px-4 sm:py-2 sm:text-xl">gm</div>
          </Draggable>
          <Draggable rotate={9} className="absolute right-[4%] top-[30%] z-30" label="A tip sticker">
            <div className="sticker !bg-butter px-3 py-1.5 font-display text-sm sm:px-4 sm:py-2 sm:text-lg">+5% tip</div>
          </Draggable>
          <Draggable rotate={-5} className="absolute bottom-[26%] left-[4%] z-30" label="A boost sticker">
            <div className="sticker !bg-pink px-3 py-1.5 font-display text-sm sm:px-4 sm:py-2 sm:text-lg">1.25× boost</div>
          </Draggable>
          <Draggable rotate={6} className="absolute bottom-[24%] right-[4%] z-30 hidden sm:block" label="A rarity sticker">
            <div className="sticker !bg-sky px-4 py-2 font-display text-lg">Tier: Rare</div>
          </Draggable>

          {/* speech bubble */}
          <div className="pointer-events-none absolute left-1/2 top-[4%] z-20 w-[min(86%,22rem)] -translate-x-1/2">
            <div key={`${mood}-${line}`} className="sticker animate-pop px-4 py-2 text-center sm:px-5 sm:py-3">
              <span className="font-display text-sm leading-snug sm:text-lg">“{m.lines[line % m.lines.length]}”</span>
            </div>
          </div>

          {/* the creature: poke it */}
          <div
            className={cx("absolute inset-x-[26%] top-[29%] aspect-square cursor-pointer select-none", squish % 2 ? "[animation:squish-a_.5s_ease]" : "[animation:squish-b_.5s_ease]")}
            key={squish}
            onPointerDown={poke}
            role="button"
            tabIndex={0}
            aria-label="Poke the Chog"
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSquish((s) => s + 1)}
          >
            <div className="h-full w-full animate-float">
              <ChogFace mood={mood} seed={line} boosted={mood === 3} className="h-full w-full drop-shadow-[0_28px_30px_rgb(81_52_201/0.3)]" />
            </div>
            {puffs.map((p) => (
              <span
                key={p.id}
                aria-hidden
                className="pointer-events-none absolute text-2xl"
                style={{ left: p.x, top: p.y, ["--dx" as string]: `${p.dx}px`, animation: "puff 1.05s ease-out forwards" }}
              >
                <PuffShape k={p.k} />
              </span>
            ))}
          </div>

          {/* mood picker */}
          <div className="absolute inset-x-0 bottom-[4%] z-30 flex justify-center">
            <div role="radiogroup" aria-label="Try a mood" className="sticker flex gap-1 !rounded-full p-1.5">
              {MOODS.map((x, i) => (
                <button
                  key={x.name}
                  role="radio"
                  aria-checked={mood === i}
                  onClick={() => pick(i)}
                  className={cx(
                    "rounded-full px-2 py-1 text-xs font-bold transition max-[400px]:min-h-8 max-[400px]:min-w-8 sm:px-3.5 sm:py-1.5 sm:text-sm",
                    mood === i ? "bg-[var(--st-fg)] text-[var(--st-bg)]" : "text-[var(--st-fg)] opacity-70 hover:opacity-100",
                  )}
                  title={x.blurb}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: x.hex }} aria-hidden />
                  <span className={cx("ml-1.5 align-middle", mood !== i && "max-[400px]:sr-only")}>{x.name}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="absolute -bottom-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-xs font-bold text-dim sm:block">
            Poke it · drag the stickers · it reacts
          </p>
        </div>
      </div>

      {/* facts strip */}
      <dl className="mx-auto mt-10 grid max-w-6xl grid-cols-2 gap-3 px-5 sm:mt-20 sm:gap-4 sm:px-8 md:grid-cols-4 lg:mt-16">
        {[
          ["You keep the keys", "Only the Chog holder can withdraw.", "#ffe6f1"],
          ["Up to 1.25×", "boost when friends hype your Daemon", "#fff3c4"],
          ["5 moods", "that react to how it's really doing", "#dff4ff"],
          ["One tap out", "take everything back, any time", "#dcf7ec"],
        ].map(([k, v, bg], i) => (
          <div
            key={k}
            className="sticker sticker-pop p-3 sm:p-4"
            data-reveal
            style={{ ["--d" as string]: `${i * 80}ms`, background: bg, transform: `rotate(${[-1.5, 1, -1, 1.5][i]}deg)` }}
          >
            <dt className="font-display text-[15px] leading-tight sm:text-xl">{k}</dt>
            <dd className="mt-1 text-xs font-medium sm:text-sm text-[#1e1238]/70">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

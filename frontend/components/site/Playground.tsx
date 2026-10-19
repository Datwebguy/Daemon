"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { BOOSTED_LINES, MOODS } from "@/lib/mood";
import { ChogFace } from "@/components/ChogFace";
import { Button, Stat, cx } from "../ui";
import { burstConfetti } from "./confetti";

/* ------------------------------------------------------------------ */
/* Rules (a simplified, pretend version of the real thing)             */
/* ------------------------------------------------------------------ */
type Vault = "stable" | "degen";
type Pair = { stable: number; degen: number };
type Rand = readonly [number, number, number];

const START_WALLET = 1000;
const MAX_HYPE = 5; // 5 x 0.05 = 1.25x
const HYPE_STEP = 0.05;
const SIM_MIN_PER_SEC = 4; // 1 real second = 4 simulated minutes
const BOOST_SIM_MIN = 180; // a 3 hour boost
const BOOST_MS = (BOOST_SIM_MIN / SIM_MIN_PER_SEC) * 1000;
const HYPE_COOLDOWN_MS = 4000;
const REST_MS = 6000;
const IDLE_MS = 25000;
const TIP_MIN = 0.05;
const TIP_MAX = 0.1;
const TIP_RAMP_H = 24;
const STABLE_RATE = 0.025;

type Sim = {
  now: number;
  lastActionAt: number;
  wallet: number;
  bal: Pair;
  pending: Pair;
  earned: number;
  readyAt: number | null;
  extraHours: number;
  hypes: number;
  boostUntil: number;
  hypeReadyAt: number;
  days: number;
  lastRate: number | null;
  swingy: boolean;
  lastHarvest: number | null;
  prevHarvest: number | null;
  mood: number;
  line: string;
  note: string;
  lineKey: number;
};

const sum = (p: Pair) => p.stable + p.degen;
const boosted = (s: Sim) => s.hypes > 0 && s.boostUntil > s.now;
const mult = (s: Sim) => 1 + (boosted(s) ? s.hypes * HYPE_STEP : 0);
const waitedHours = (s: Sim) =>
  s.readyAt === null ? 0 : Math.max(0, ((s.now - s.readyAt) / 1000) * SIM_MIN_PER_SEC) / 60 + s.extraHours;
const tipShare = (hours: number) => TIP_MIN + ((TIP_MAX - TIP_MIN) * Math.min(hours, TIP_RAMP_H)) / TIP_RAMP_H;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pick = (pool: readonly string[], n: number) => pool[Math.floor(n * pool.length) % pool.length] ?? "";

function moodFor(s: Sim): number {
  if (s.swingy || (boosted(s) && s.hypes >= MAX_HYPE)) return 2; // Chaotic
  const prev = s.prevHarvest ?? 0;
  if (boosted(s) && s.lastHarvest !== null && s.lastHarvest > prev) return 3; // Flexing
  if (s.lastHarvest !== null && s.lastHarvest >= prev) return 1; // Smug
  return 0; // Chill
}

function initial(t: number): Sim {
  return {
    now: t,
    lastActionAt: t,
    wallet: START_WALLET,
    bal: { stable: 0, degen: 0 },
    pending: { stable: 0, degen: 0 },
    earned: 0,
    readyAt: null,
    extraHours: 0,
    hypes: 0,
    boostUntil: 0,
    hypeReadyAt: 0,
    days: 0,
    lastRate: null,
    swingy: false,
    lastHarvest: null,
    prevHarvest: null,
    mood: 0,
    line: MOODS[0]!.lines[0]!,
    note: `You have ${fmt(START_WALLET)} pretend dUSD. Pick a vault and put some to work.`,
    lineKey: 0,
  };
}

/** Recompute the mood, choose a line for it, and set the status message. */
function say(s: Sim, rand: Rand, note: string, fromHype = false): Sim {
  const mood = moodFor(s);
  const useBoost = boosted(s) && (fromHype || rand[2] < 0.35);
  const pool: readonly string[] = useBoost ? BOOSTED_LINES : MOODS[mood]!.lines;
  return { ...s, mood, line: pick(pool, rand[1]), note, lineKey: s.lineKey + 1, lastActionAt: s.now };
}

type Action =
  | { type: "tick"; t: number }
  | { type: "touch"; t: number; rand: Rand }
  | { type: "deposit"; t: number; rand: Rand; vault: Vault; amount: number }
  | { type: "hype"; t: number; rand: Rand }
  | { type: "forward"; t: number; rand: Rand }
  | { type: "harvest"; t: number; rand: Rand }
  | { type: "poke"; t: number; rand: Rand }
  | { type: "reset"; t: number };

function reduce(s: Sim, a: Action): Sim {
  if (a.type === "reset") return initial(a.t);
  if (a.type === "tick") {
    if (s.lastActionAt === 0) return { ...s, now: a.t, lastActionAt: a.t };
    let n: Sim = { ...s, now: a.t };
    if (s.hypes > 0 && s.boostUntil <= a.t) {
      const cooled: Sim = { ...n, hypes: 0 };
      const mood = moodFor(cooled);
      n = {
        ...cooled,
        mood,
        line: pick(MOODS[mood]!.lines, (s.lineKey % 7) / 7),
        note: "The boost wore off. Hype it again to keep it going.",
        lineKey: s.lineKey + 1,
      };
    }
    if (a.t - n.lastActionAt > IDLE_MS && n.mood !== 4) {
      n = {
        ...n,
        mood: 4,
        line: pick(MOODS[4]!.lines, (n.lineKey % 7) / 7),
        note: "Your Daemon dozed off. Poke it, or try anything, to wake it up.",
        lineKey: n.lineKey + 1,
      };
    }
    return n;
  }

  const n: Sim = { ...s, now: a.t };
  switch (a.type) {
    case "touch":
      return n.mood === 4 ? say(n, a.rand, "Your Daemon perked up. Welcome back.") : { ...n, lastActionAt: a.t };

    case "deposit": {
      const all = a.amount >= n.wallet - 0.005;
      const amt = all ? n.wallet : Math.floor(Math.min(a.amount, n.wallet) * 100) / 100;
      if (amt < 0.01) return say(n, a.rand, "Nothing to put to work yet. Pick an amount first.");
      const next: Sim = { ...n, wallet: n.wallet - amt, bal: { ...n.bal, [a.vault]: n.bal[a.vault] + amt } };
      return say(next, a.rand, `Put ${fmt(amt)} dUSD into the ${a.vault === "stable" ? "Stable" : "Degen"} vault. Skip ahead a day to see it earn.`);
    }

    case "hype": {
      if (a.t < n.hypeReadyAt) return n;
      const base = boosted(n) ? n.hypes : 0;
      if (base >= MAX_HYPE) return n;
      const hypes = base + 1;
      const next: Sim = { ...n, hypes, boostUntil: a.t + BOOST_MS, hypeReadyAt: a.t + HYPE_COOLDOWN_MS };
      const m = mult(next).toFixed(2);
      return say(
        next,
        a.rand,
        hypes >= MAX_HYPE ? `Max hype! Boost is ${m}× for about 3 hours.` : `Hype ${hypes} of ${MAX_HYPE}. Boost is now ${m}× for about 3 hours.`,
        true,
      );
    }

    case "forward": {
      if (sum(n.bal) <= 0) return n;
      const rS = STABLE_RATE * (1 + (a.rand[0] - 0.5) * 0.1);
      const rD = 0.005 + 0.085 * a.rand[1];
      const k = mult(n);
      const eS = n.bal.stable * rS * k;
      const eD = n.bal.degen * rD * k;
      const had = sum(n.pending) > 0;
      const hasDegen = n.bal.degen > 0;
      const swingy = hasDegen && n.lastRate !== null && rD > 2 * n.lastRate;
      const next: Sim = {
        ...n,
        pending: { stable: n.pending.stable + eS, degen: n.pending.degen + eD },
        earned: n.earned + eS + eD,
        readyAt: had ? n.readyAt : a.t,
        extraHours: had ? n.extraHours + 24 : 0,
        days: n.days + 1,
        swingy,
        lastRate: hasDegen ? rD : n.lastRate,
      };
      const parts = [`A day goes by. Your Daemon earned ${fmt(eS + eD)} dUSD${k > 1 ? ` with the ${k.toFixed(2)}× boost` : ""}.`];
      if (hasDegen) parts.push(swingy ? `The Degen vault had a wild swing: ${(rD * 100).toFixed(1)}% in a day!` : `Degen made ${(rD * 100).toFixed(1)}% today.`);
      return say(next, a.rand, parts.join(" "));
    }

    case "harvest": {
      const gross = sum(n.pending);
      if (gross <= 0 || n.readyAt === null || a.t - n.readyAt < REST_MS) return n;
      const share = tipShare(waitedHours(n));
      const tip = gross * share;
      const next: Sim = {
        ...n,
        wallet: n.wallet + tip,
        bal: {
          stable: n.bal.stable + n.pending.stable * (1 - share),
          degen: n.bal.degen + n.pending.degen * (1 - share),
        },
        pending: { stable: 0, degen: 0 },
        readyAt: null,
        extraHours: 0,
        prevHarvest: n.lastHarvest,
        lastHarvest: gross,
        swingy: false,
      };
      return say(
        next,
        a.rand,
        `Harvested ${fmt(gross)} dUSD. You kept a ${fmt(tip)} dUSD tip (${(share * 100).toFixed(1)}%) and ${fmt(gross - tip)} went back to work.`,
      );
    }

    case "poke":
      return say(n, a.rand, "You poked your Daemon. It wiggles.");
  }
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
const rnd = (): Rand => [Math.random(), Math.random(), Math.random()];
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function play(el: HTMLElement | null, frames: Keyframe[], duration: number) {
  if (!el || reducedMotion()) return;
  el.animate(frames, { duration, easing: "cubic-bezier(.3,1.4,.5,1)" });
}

/** Eases a displayed number toward its target (count-up / count-down ticker). */
function useEased(target: number): number {
  const t = Math.round(target * 100) / 100;
  const [shown, setShown] = useState(t);
  const cur = useRef(t);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const step = () => {
      const d = t - cur.current;
      cur.current = reduce || Math.abs(d) < 0.005 ? t : cur.current + d * 0.16;
      setShown(cur.current);
      if (cur.current !== t) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [t]);
  return shown;
}

function Num({ value }: { value: number }) {
  return <>{fmt(useEased(value))}</>;
}

/** Circular progress ring with an icon in the middle. */
function Ring({ p, children }: { p: number; children?: ReactNode }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid h-7 w-7 shrink-0 place-items-center" aria-hidden>
      <svg viewBox="0 0 28 28" className="absolute inset-0 h-7 w-7 -rotate-90">
        <circle cx="14" cy="14" r={r} fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="3" />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, p)))}
        />
      </svg>
      <span className="relative grid place-items-center">{children}</span>
    </span>
  );
}

const Svg = ({ children, className }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

function VaultTile({
  selected,
  onSelect,
  title,
  line,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  line: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        "flex min-h-24 flex-1 touch-manipulation flex-col items-start gap-1.5 rounded-2xl border-2 p-3.5 text-left transition",
        selected ? "border-jelly bg-jelly/10" : "clay-sunk border-transparent hover:border-jelly/40",
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="font-display text-base font-bold">{title}</span>
        {icon}
      </span>
      <span className="text-[13px] leading-snug text-dim">{line}</span>
    </button>
  );
}

const StableIcon = (
  <svg viewBox="0 0 40 24" className="h-6 w-10 shrink-0 text-mint" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 17 C10 16 13 13 20 12 S31 9 37 7" />
  </svg>
);
const DegenIcon = (
  <svg viewBox="0 0 40 24" className="h-6 w-10 shrink-0 text-spark" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 18 L10 7 L16 20 L23 4 L29 17 L37 3" />
  </svg>
);

const hm = (simMin: number) => `${Math.floor(simMin / 60)}h ${String(Math.floor(simMin % 60)).padStart(2, "0")}m`;

/* ------------------------------------------------------------------ */
/* The sandbox                                                         */
/* ------------------------------------------------------------------ */
export function Playground({
  id = "practice",
  className,
  showHeading = true,
}: {
  /** section id, handy for an in-page link such as href="#practice" */
  id?: string;
  className?: string;
  /** set false if the page already provides its own heading */
  showHeading?: boolean;
}) {
  const [s, dispatch] = useReducer(reduce, 0, initial);
  const [vault, setVault] = useState<Vault>("stable");
  const [amount, setAmount] = useState(250);
  const [coins, setCoins] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const bounceRef = useRef<HTMLDivElement>(null);
  const pokeRef = useRef<HTMLButtonElement>(null);
  const prevMood = useRef(s.mood);

  // Simulated clock: one tick every 100ms drives countdowns, rings and tiredness.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) dispatch({ type: "tick", t: Date.now() });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  // A little bounce whenever the mood changes.
  useEffect(() => {
    if (prevMood.current === s.mood) return;
    prevMood.current = s.mood;
    play(
      bounceRef.current,
      [
        { transform: "translateY(0) scale(1,1)" },
        { transform: "translateY(-24px) scale(0.95,1.07)", offset: 0.35 },
        { transform: "translateY(0) scale(1.08,0.92)", offset: 0.7 },
        { transform: "translateY(0) scale(1,1)" },
      ],
      560,
    );
  }, [s.mood]);

  const m = MOODS[s.mood]!;
  const now = s.now;
  const isBoosted = boosted(s);
  const k = mult(s);
  const pending = sum(s.pending);
  const saved = sum(s.bal);
  const waited = waitedHours(s);
  const share = tipShare(waited);
  const tip = pending * share;

  const hypeLeft = Math.max(0, s.hypeReadyAt - now);
  const atMax = isBoosted && s.hypes >= MAX_HYPE;
  const canHype = hypeLeft === 0 && !atMax;
  const boostSimMin = isBoosted ? Math.max(0, ((s.boostUntil - now) / 1000) * SIM_MIN_PER_SEC) : 0;

  const restLeft = s.readyAt === null ? REST_MS : Math.max(0, REST_MS - (now - s.readyAt));
  const restP = pending > 0 ? 1 - restLeft / REST_MS : 0;
  const canHarvest = pending > 0 && restLeft === 0;
  const canForward = saved > 0;

  const maxAmt = s.wallet;
  const amt = Math.min(amount, maxAmt);
  const canDeposit = amt >= 0.01;

  const fire = (frac = 0.4) => {
    const r = stageRef.current?.getBoundingClientRect();
    burstConfetti(r ? { x: r.left + r.width / 2, y: r.top + r.height * frac } : undefined);
  };
  const touch = () => dispatch({ type: "touch", t: Date.now(), rand: rnd() });

  const onDeposit = () => dispatch({ type: "deposit", t: Date.now(), rand: rnd(), vault, amount: amt });
  const onHype = () => {
    if (!canHype) return;
    const willMax = (isBoosted ? s.hypes : 0) + 1 >= MAX_HYPE;
    dispatch({ type: "hype", t: Date.now(), rand: rnd() });
    if (willMax) fire(0.35);
  };
  const onForward = () => dispatch({ type: "forward", t: Date.now(), rand: rnd() });
  const onHarvest = () => {
    if (!canHarvest) return;
    dispatch({ type: "harvest", t: Date.now(), rand: rnd() });
    fire(0.45);
    setCoins((c) => c + 1);
  };
  const onPoke = () => {
    play(
      pokeRef.current,
      [
        { transform: "scale(1,1)" },
        { transform: "scale(1.14,0.82)", offset: 0.3 },
        { transform: "scale(0.94,1.08)", offset: 0.65 },
        { transform: "scale(1,1)" },
      ],
      420,
    );
    dispatch({ type: "poke", t: Date.now(), rand: rnd() });
  };
  const onReset = () => {
    dispatch({ type: "reset", t: Date.now() });
    setVault("stable");
    setAmount(250);
  };

  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cx("relative scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28", className)}>
      <style>{`
        .pg-coin{position:absolute;left:-9px;top:0;width:18px;height:18px;border-radius:9999px;opacity:0;
          background:radial-gradient(circle at 35% 30%,#fff6c2,#ffd166 55%,#e8a317);box-shadow:inset 0 0 0 2px rgb(0 0 0/.14);
          animation:pg-coin 1.4s cubic-bezier(.2,.7,.3,1) both}
        @keyframes pg-coin{
          0%{opacity:0;transform:translate(var(--dx),24px) scale(.5)}
          15%{opacity:1}
          100%{opacity:0;transform:translate(calc(var(--dx) * 1.7),-190px) scale(1)}
        }
        @media (prefers-reduced-motion: reduce){.pg-coin{display:none}}
      `}</style>

      <div className="mx-auto max-w-6xl">
        {showHeading && (
          <div className="max-w-2xl">
            <h2 id={`${id}-title`} className="font-display text-[clamp(2rem,4.6vw,3.4rem)] font-extrabold leading-[0.98] tracking-tight text-balance">
              Take one for a spin.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-dim">
              A pretend Daemon with pretend money. No sign-in, nothing saved, nothing real. Put it to work, hype it, skip ahead a day and
              harvest the tip.
            </p>
          </div>
        )}
        {!showHeading && <h2 id={`${id}-title`} className="sr-only">Practice mode</h2>}

        <div className={cx("grid items-start gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-8", showHeading && "mt-10")}>
          {/* ---- the Daemon ---- */}
          <div className="clay relative overflow-hidden rounded-[2rem] p-5 sm:p-7">
            <div
              aria-hidden
              className="absolute inset-0 transition-colors duration-1000"
              style={{ background: `radial-gradient(70% 60% at 50% 55%, ${m.hex}33, transparent 72%)` }}
            />
            <div className="relative flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-spark/15 px-3 py-1.5 text-xs font-bold text-fg">
                <span aria-hidden className="h-2 w-2 rounded-full bg-spark" />
                Practice mode · pretend money
              </span>
              <span className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold tabular-nums text-dim">
                {s.days === 0 ? "Day 0" : `Day ${s.days}`}
              </span>
            </div>

            {/* speech bubble */}
            <div className="relative mx-auto mt-5 flex min-h-[5.5rem] w-full max-w-sm flex-col items-center justify-end">
              <div key={s.lineKey} className="glass animate-pop w-full rounded-[1.4rem] px-5 py-3.5 text-center shadow-[0_18px_40px_-22px_var(--clay-lo)]">
                <span className="font-display text-lg font-semibold leading-snug">“{s.line}”</span>
              </div>
              <div className="glass -mt-2 h-4 w-4 rotate-45 border-t-0 border-l-0" aria-hidden />
            </div>

            {/* creature */}
            <div ref={stageRef} className="relative mx-auto mt-2 w-full max-w-[17rem] sm:max-w-[19rem]">
              <div className="animate-float">
                <div ref={bounceRef}>
                  <button
                    ref={pokeRef}
                    type="button"
                    onClick={onPoke}
                    aria-label={`Poke your pretend Daemon. It is feeling ${m.name}.`}
                    className="block aspect-square w-full origin-bottom touch-manipulation rounded-[2rem]"
                  >
                    <ChogFace mood={s.mood} boosted={isBoosted} track className="h-full w-full drop-shadow-[0_26px_34px_rgb(81_52_201/0.35)]" />
                  </button>
                </div>
              </div>
              {coins > 0 && (
                <div key={coins} aria-hidden className="pointer-events-none absolute left-1/2 top-[48%]">
                  {Array.from({ length: 7 }, (_, i) => (
                    <span key={i} className="pg-coin" style={{ ["--dx" as string]: `${(i - 3) * 20 + ((i * 37) % 11) - 5}px`, animationDelay: `${i * 70}ms` }} />
                  ))}
                </div>
              )}
            </div>

            <div className="relative mt-4 flex flex-col items-center gap-3 text-center">
              <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold", m.bg, m.text)}>
                
                {m.name}
              </span>
              <p className="max-w-xs text-xs leading-snug text-dim">{m.when}</p>
              <p aria-live="polite" aria-atomic="true" className="clay-sunk min-h-[3.25rem] w-full rounded-2xl px-4 py-3 text-sm leading-snug">
                {s.note}
              </p>
              <p className="text-xs text-dim">Tip: tap your Daemon to poke it.</p>
            </div>
          </div>

          {/* ---- the control board ---- */}
          <div className="clay rounded-[2rem] p-5 sm:p-7">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="In your wallet" value={<Num value={s.wallet} />} hint="dUSD, pretend" />
              <Stat label="Saved in Daemon" value={<Num value={saved} />} tone="jelly" hint="working for you" />
              <Stat label="Earned so far" value={<Num value={s.earned} />} tone="mint" hint={pending > 0 ? `${fmt(pending)} waiting to harvest` : "all time, before tips"} />
              <Stat
                label="Tip you'd get"
                value={<Num value={tip} />}
                tone="spark"
                hint={pending > 0 ? `${(share * 100).toFixed(1)}% · waited ${waited.toFixed(1)}h` : "skip a day to build one up"}
              />
            </div>

            {/* 1. put it to work */}
            <div className="mt-7">
              <h3 className="font-display text-lg font-bold">
                <span className="mr-2 text-jelly">1</span>Put it to work
              </h3>
              <div role="radiogroup" aria-label="Choose a vault" className="mt-3 flex flex-col gap-3 min-[420px]:flex-row">
                <VaultTile
                  selected={vault === "stable"}
                  onSelect={() => {
                    setVault("stable");
                    touch();
                  }}
                  title="Stable vault"
                  line="Calm and steady. About 2.5% a day."
                  icon={StableIcon}
                />
                <VaultTile
                  selected={vault === "degen"}
                  onSelect={() => {
                    setVault("degen");
                    touch();
                  }}
                  title="Degen vault"
                  line="Wild rides. Anywhere from 0.5% to 9% a day."
                  icon={DegenIcon}
                />
              </div>

              <div className="mt-4">
                <label htmlFor={`${id}-amount`} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-dim">How much?</span>
                  <span className="font-display text-xl font-bold tabular-nums">{fmt(amt)} dUSD</span>
                </label>
                <input
                  id={`${id}-amount`}
                  type="range"
                  min={0}
                  max={maxAmt}
                  step="any"
                  value={amt}
                  disabled={maxAmt < 0.01}
                  aria-valuetext={`${fmt(amt)} dUSD`}
                  onChange={(e) => {
                    setAmount(Number(e.target.value));
                    touch();
                  }}
                  className="jelly-range mt-3 w-full touch-pan-y disabled:opacity-45"
                  style={{ ["--p" as string]: `${maxAmt > 0 ? (amt / maxAmt) * 100 : 0}%` }}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {[100, 250].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    variant="secondary"
                    disabled={maxAmt < 0.01}
                    aria-label={`Use ${v} dUSD`}
                    className="min-h-11 min-w-16 touch-manipulation"
                    onClick={() => {
                      setAmount(Math.min(v, maxAmt));
                      touch();
                    }}
                  >
                    {v}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={maxAmt < 0.01}
                  aria-label="Use everything in the wallet"
                  className="min-h-11 min-w-16 touch-manipulation"
                  onClick={() => {
                    setAmount(maxAmt);
                    touch();
                  }}
                >
                  All
                </Button>
                <Button type="button" size="lg" disabled={!canDeposit} onClick={onDeposit} className="ml-auto min-h-11 touch-manipulation">
                  Put it to work
                </Button>
              </div>
            </div>

            {/* 2. hype */}
            <div className="mt-7 border-t border-line pt-6">
              <h3 className="font-display text-lg font-bold">
                <span className="mr-2 text-jelly">2</span>Hype it
              </h3>
              <p className="mt-1 text-sm text-dim">Each hype adds 0.05× to a day&apos;s earnings, up to 1.25×, for about 3 hours.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button type="button" variant="spark" size="lg" disabled={!canHype} onClick={onHype} aria-describedby={`${id}-hype-help`} className="min-h-11 touch-manipulation">
                  <Ring p={atMax ? 1 : s.hypeReadyAt === 0 ? 1 : 1 - hypeLeft / HYPE_COOLDOWN_MS}>
                    <Svg className="h-3 w-3">
                      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
                    </Svg>
                  </Ring>
                  Hype it
                  <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs tabular-nums">
                    {isBoosted ? s.hypes : 0} / {MAX_HYPE}
                  </span>
                </Button>
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold tabular-nums">{isBoosted ? `Boost ${k.toFixed(2)}×` : "No boost yet"}</span>
                    <span className="tabular-nums text-dim">{isBoosted ? `${hm(boostSimMin)} left` : ""}</span>
                  </div>
                  <div className="clay-sunk mt-1.5 h-2 overflow-hidden rounded-full" aria-hidden>
                    <div className="h-full rounded-full bg-spark" style={{ width: `${isBoosted ? (boostSimMin / BOOST_SIM_MIN) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
              <p id={`${id}-hype-help`} className="mt-2 text-xs text-dim">
                {atMax ? "Max boost reached. Enjoy it while it lasts." : hypeLeft > 0 ? `Catching its breath: ${Math.ceil(hypeLeft / 1000)}s` : "Ready to hype."}
              </p>
            </div>

            {/* 3. skip ahead & harvest */}
            <div className="mt-7 border-t border-line pt-6">
              <h3 className="font-display text-lg font-bold">
                <span className="mr-2 text-jelly">3</span>Skip ahead, then harvest
              </h3>
              <p className="mt-1 text-sm text-dim">The longer rewards wait, the bigger the tip you earn for harvesting: 5% rising to 10% over a day.</p>
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <Button type="button" variant="secondary" size="lg" disabled={!canForward} onClick={onForward} aria-describedby={`${id}-ff-help`} className="min-h-11 w-full touch-manipulation">
                    <Svg className="h-4 w-4">
                      <path d="m5 5 7 7-7 7M13 5l7 7-7 7" />
                    </Svg>
                    Fast-forward a day
                  </Button>
                  <p id={`${id}-ff-help`} className="mt-1.5 text-xs text-dim">
                    {canForward ? "Skips 24 hours. Do it twice and the tip grows." : "Put some money to work first."}
                  </p>
                </div>
                <div>
                  <Button type="button" variant="primary" size="lg" disabled={!canHarvest} onClick={onHarvest} aria-describedby={`${id}-harvest-help`} className="min-h-11 w-full touch-manipulation">
                    <Ring p={restP}>
                      <Svg className="h-3 w-3">
                        <path d="m5 12 5 5 9-10" />
                      </Svg>
                    </Ring>
                    Harvest &amp; keep the tip
                  </Button>
                  <p id={`${id}-harvest-help`} className="mt-1.5 text-xs text-dim">
                    {canHarvest
                      ? `Ready! The tip is ${fmt(tip)} dUSD and the rest goes back to work.`
                      : pending > 0
                        ? `Resting: ${Math.ceil(restLeft / 1000)}s until it can be harvested.`
                        : "Nothing to harvest yet. Fast-forward a day first."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:justify-between">
          <p className="text-sm text-dim">All pretend. Your real Daemon works the same way, with real savings.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="ghost" size="lg" onClick={onReset} className="min-h-11 touch-manipulation">
              Reset
            </Button>
            <Link
              href="/app"
              className="group inline-flex min-h-11 items-center gap-3 rounded-full bg-jelly py-3 pl-6 pr-3 text-base font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_18px_40px_-14px_var(--glow)] transition hover:bg-jelly-deep active:scale-[0.98]"
            >
              Like it? Make it real
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 transition group-hover:translate-x-0.5">
                <Svg className="h-4 w-4">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </Svg>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

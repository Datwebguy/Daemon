"use client";

import { useEffect, useRef, useState } from "react";
import { MOODS } from "@/lib/mood";
import { ChogFace } from "@/components/ChogFace";
import { cx } from "../ui";

const STEPS: { title: string; body: string; mood?: number; boosted?: boolean; say: string }[] = [
  {
    title: "Get a Chog",
    body: "Mint a free test Chog in one tap. Each one is born with its own colours, eyes and vibe.",
    say: "zzz…",
  },
  {
    title: "Wake its Daemon",
    body: "One tap gives your Chog its own wallet. Nothing moves out of your hands. It's still your Chog.",
    mood: 0,
    say: "gm. I live here now.",
  },
  {
    title: "Put it to work",
    body: "Drop test dollars into the Stable vault for calm, steady rewards, or the Degen vault for wild swings. Split it however you like.",
    mood: 1,
    say: "Compounding while you sleep. You're welcome.",
  },
  {
    title: "Anyone can harvest it",
    body: "Rewards pile up over time. Anybody can tap Harvest to turn them into more savings, and they get a small tip for helping. Your Daemon keeps the rest.",
    mood: 2,
    say: "Yield is swinging. I love it.",
  },
  {
    title: "Friends hype it",
    body: "Anyone can toss a little MON or CHOG into its hype jar. That boosts its next harvests by up to 1.25× for three hours.",
    mood: 3,
    boosted: true,
    say: "Boosted and up only. Flexing hard.",
  },
  {
    title: "It goes where the Chog goes",
    body: "Sell or gift the Chog and the new holder gets the Daemon, savings and all. And you can always take everything out in one tap.",
    mood: 0,
    say: "New owner? Same vibes.",
  },
];

export function Story() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const s = STEPS[active]!;
  const hue = s.mood !== undefined ? MOODS[s.mood]!.hex : "#a8a3b8";

  return (
    <section id="how" className="relative scroll-mt-24 bg-surface-2/60">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="max-w-2xl" data-reveal>
          <h2 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-[0.98] tracking-tight">From asleep to showing off in six steps.</h2>
          <p className="mt-5 text-lg text-dim">No jargon, no setup. Here&apos;s the whole life of a Daemon.</p>
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          {/* sticky stage */}
          <div className="lg:sticky lg:top-28 lg:h-[30rem] lg:self-start">
            <div className="clay relative grid h-80 place-items-center overflow-hidden rounded-[2.25rem] sm:h-96 lg:h-full">
              <div aria-hidden className="absolute inset-0 transition-colors duration-700" style={{ background: `radial-gradient(55% 55% at 50% 55%, ${hue}40, transparent 75%)` }} />
              <div key={active} className="absolute top-6 left-1/2 w-[80%] -translate-x-1/2 text-center animate-pop">
                <span className="glass inline-block rounded-2xl px-4 py-2.5 font-display text-base font-semibold">“{s.say}”</span>
              </div>
              <ChogFace mood={s.mood} boosted={s.boosted} track className="relative mt-10 h-56 w-56 sm:h-64 sm:w-64 animate-float" />
              <ol className="absolute bottom-5 flex gap-1.5" aria-hidden>
                {STEPS.map((_, i) => (
                  <li key={i} className={cx("h-1.5 rounded-full transition-all duration-500", i === active ? "w-8 bg-jelly" : "w-1.5 bg-fg/20")} />
                ))}
              </ol>
            </div>
          </div>

          {/* steps */}
          <ol className="space-y-6 lg:space-y-44 lg:py-20">
            {STEPS.map((st, i) => (
              <li
                key={st.title}
                data-step={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className={cx("rounded-[1.75rem] p-6 transition-all duration-500 sm:p-7", i === active ? "clay" : "opacity-80")}
              >
                <div className="flex items-baseline gap-4">
                  <span className={cx("font-display text-4xl font-extrabold tabular-nums transition-colors", i === active ? "text-jelly" : "text-dim/50")}>
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-bold">{st.title}</h3>
                    <p className="mt-2 leading-relaxed text-dim">{st.body}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

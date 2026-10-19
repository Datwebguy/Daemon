"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { contracts } from "@/lib/config";
import { MOODS } from "@/lib/mood";
import { ChogFace } from "@/components/ChogFace";
import { Button, cx } from "../ui";
import { inkOn, STICKER_BTN } from "./color";
import { PageHero } from "./PageHero";

/** What a den looks like once you're in: three example cards in the same style as the real ones. */
const EXAMPLES: { id: number; mood?: number; saved?: string; boosted?: boolean }[] = [
  { id: 1492, mood: 0, saved: "1,000" },
  { id: 1525, mood: 3, saved: "2,450", boosted: true },
  { id: 1581 },
];

const STEPS = [
  { title: "Sign in", body: "Email, Google, X or any wallet." },
  { title: "Mint a free Chog", body: "Real Chog Genesis art, on the test network." },
  { title: "Wake its Daemon", body: "It gets its own wallet and starts earning." },
];

/**
 * The den before anyone has signed in, or while the app isn't open yet. It says what the den is, what
 * signing in gets you and what happens next, and shows an example of a full den. While the app's
 * contracts aren't live it says so plainly instead of offering steps that can't work yet.
 */
export function SignedOutDen() {
  const auth = useAuth();
  const open = Boolean(contracts.mockChog);

  return (
    <div>
      <PageHero tone="--butter" kicker="Home base" title="Your den" face={{ mood: 0, seed: 3 }}>
        Every Chog you hold, and how its Daemon is feeling.
      </PageHero>

      <section className="px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
        <div className="mx-auto grid max-w-6xl items-start gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
          {/* the door: one clear thing to do */}
          <div className="stk !rounded-[1.5rem] p-5 sm:p-8">
            {open ? (
              <>
                <h2 className="font-display text-2xl leading-tight sm:text-4xl">Sign in to open your den</h2>
                <p className="mt-2 text-sm text-dim sm:mt-3 sm:text-base">
                  Your Chogs show up here, each with its Daemon&apos;s mood and savings. New here? It takes a few seconds, and your first Chog
                  is free.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <Button onClick={auth.login} disabled={!auth.ready} className={cx("h-11", STICKER_BTN)}>
                    Sign in
                  </Button>
                  <Link
                    href="/practice"
                    className="stk squish inline-flex h-11 items-center !rounded-full px-5 text-sm font-bold transition-transform hover:-translate-y-0.5"
                  >
                    Try practice mode
                  </Link>
                </div>
                <p className="mt-3 text-xs text-dim">Test network only. Nothing here costs real money.</p>
              </>
            ) : (
              <>
                <span className="stk inline-block -rotate-2 !rounded-lg bg-sky px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#1e1238]">
                  Opening soon
                </span>
                <h2 className="mt-3 font-display text-2xl leading-tight sm:text-4xl">Your den opens soon</h2>
                <p className="mt-2 text-sm text-dim sm:mt-3 sm:text-base">
                  Daemon is still being set up on the test network. Once it&apos;s live you&apos;ll sign in here and get a free Chog in one tap.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <Link href="/practice" className={cx("inline-flex h-11 items-center rounded-full bg-jelly px-5 text-sm font-bold text-white", STICKER_BTN)}>
                    Try practice mode
                  </Link>
                  <Link
                    href="/#how"
                    className="stk squish inline-flex h-11 items-center !rounded-full px-5 text-sm font-bold transition-transform hover:-translate-y-0.5"
                  >
                    How it works
                  </Link>
                </div>
              </>
            )}

            {/* what happens after the door: the same first steps the den walks you through */}
            <ol className="mt-6 space-y-3 border-t-[3px] border-dashed border-[color:var(--st-line)]/25 pt-5 sm:mt-8 sm:pt-6">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-center gap-3">
                  <span
                    className={cx(
                      "stk grid h-9 w-9 shrink-0 place-items-center !rounded-full font-display text-base leading-none",
                      i === 0 && open ? "bg-butter text-[#1e1238]" : "bg-surface",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-base leading-tight sm:text-lg">{s.title}</span>
                    <span className="block text-xs text-dim sm:text-sm">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* an example den, so people can see what's behind the door */}
          <figure className="relative">
            <figcaption className="mb-3 flex items-center gap-2 text-xs font-bold text-dim sm:mb-4 sm:text-sm">
              <span className="stk -rotate-2 !rounded-md bg-pink px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-[#1e1238]">Example</span>
              A den with three Chogs
            </figcaption>
            <div aria-hidden className="grid grid-cols-3 gap-2.5 sm:gap-4">
              {EXAMPLES.map((x, i) => (
                <ExampleCard key={x.id} {...x} lean={i % 2 === 0 ? "-rotate-[1.4deg]" : "rotate-[1.4deg]"} />
              ))}
            </div>
            <p className="mt-4 text-xs text-dim sm:text-sm">
              The colour tab is the Daemon&apos;s mood. Tap a card to harvest it, hype it or put its savings to work.
            </p>
          </figure>
        </div>
      </section>
    </div>
  );
}

function ExampleCard({ id, mood, saved, boosted, lean }: { id: number; mood?: number; saved?: string; boosted?: boolean; lean: string }) {
  const m = mood !== undefined ? MOODS[mood] : undefined;
  return (
    <div className={cx("stk overflow-hidden !rounded-[1rem] sm:!rounded-[1.25rem]", lean)}>
      <div
        className={cx("flex items-center justify-between gap-1 border-b-[3px] border-[color:var(--st-line)] px-2 py-1 sm:px-3 sm:py-1.5", !m && "tape-bg bg-surface-2")}
        style={m ? { background: m.hex, color: inkOn(m.hex) } : undefined}
      >
        <span className="font-display text-xs leading-none sm:text-lg">#{id}</span>
        <span className="truncate text-[8px] font-bold uppercase tracking-wider sm:text-[11px]">{m ? m.name : "Asleep"}</span>
      </div>
      <div className="p-1.5 sm:p-2">
        <div
          className="relative aspect-square overflow-hidden rounded-lg border-[3px] border-[color:var(--st-line)] sm:rounded-xl"
          style={{ background: `radial-gradient(70% 70% at 50% 40%, ${m?.hex ?? "#b9a6fa"}55, var(--surface-2))` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/chogs/s/${id}.webp`} alt="" loading="lazy" decoding="async" className={cx("h-full w-full object-cover", !m && "opacity-70 grayscale-[35%]")} />
          {m && (
            <div className="absolute bottom-1 left-1 h-7 w-7 overflow-hidden rounded-full border-2 border-[#1e1238] sm:bottom-2 sm:left-2 sm:h-11 sm:w-11 sm:border-[3px]" style={{ background: `${m.hex}88` }}>
              <ChogFace mood={mood} boosted={boosted} className="h-full w-full p-0.5" />
            </div>
          )}
          {boosted && (
            <span className="absolute right-1 top-1 -rotate-6 rounded border-2 border-[#1e1238] bg-pink px-1 text-[8px] font-bold uppercase text-[#1e1238] sm:right-2 sm:top-2 sm:px-2 sm:text-[11px]">
              Boosted
            </span>
          )}
        </div>
        <div className="px-0.5 pb-0.5 pt-1.5 sm:px-1 sm:pb-1 sm:pt-2.5">
          {saved ? (
            <>
              <div className="truncate font-display text-sm leading-none tabular-nums sm:text-xl">{saved}</div>
              <div className="mt-0.5 truncate text-[8px] font-semibold uppercase tracking-wider text-dim sm:mt-1 sm:text-xs">dUSD saved</div>
            </>
          ) : (
            <>
              <div className="truncate font-display text-sm leading-none sm:text-lg">Fast asleep</div>
              <div className="mt-0.5 truncate text-[8px] font-semibold uppercase tracking-wider text-dim sm:mt-1 sm:text-xs">Tap to wake it</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

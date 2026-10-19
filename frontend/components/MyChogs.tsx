"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { useAccount } from "wagmi";
import { useAuth } from "@/lib/auth";
import { contracts, FAUCET_URL } from "@/lib/config";
import { useOwnedChogs } from "@/lib/hooks";
import { DOLLARS_LABEL, MINT_LABEL, useStarter } from "@/lib/starter";
import { ChogCard } from "./ChogCard";
import { ChogFace } from "@/components/ChogFace";
import { PageHero } from "./app/PageHero";
import { STICKER_BTN } from "./app/color";
import { Button, cx, Loading, Notice } from "./ui";

export function MyChogs() {
  const { address } = useAccount();
  const auth = useAuth();
  const owned = useOwnedChogs(address);
  const [shown, setShown] = useState(24);

  if (!address) {
    return (
      <div className="relative overflow-hidden">
        <div aria-hidden className="tape-bg absolute inset-y-0 right-0 hidden w-1/3 opacity-80 lg:block" />
        <section className="relative mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:px-10">
          <div>
            <span className="stk inline-block -rotate-2 !rounded-lg bg-butter px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#1e1238]">Your den</span>
            <h1 className="mt-5 font-display text-[clamp(3rem,9vw,6.4rem)] leading-[0.9] tracking-tight">
              Your Daemons
              <br />
              are <span className="inline-block -rotate-2 bg-pink px-3 text-[#1e1238] [box-shadow:5px_5px_0_var(--st-shadow)]">asleep.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-dim">Sign in to wake them up. Use your email, Google, X or a wallet. It takes a few seconds.</p>
            <Button size="lg" className={cx("mt-8", STICKER_BTN)} onClick={auth.login} disabled={!auth.ready}>
              Sign in to your den
            </Button>
          </div>
          <div className="relative mx-auto h-72 w-full max-w-md sm:h-96" aria-hidden>
            <ChogFace seed={2} className="absolute left-0 top-10 h-32 w-32 -rotate-12 sm:h-40 sm:w-40" />
            <ChogFace seed={5} className="absolute bottom-0 right-2 h-36 w-36 rotate-6 sm:h-44 sm:w-44" />
            <ChogFace className="animate-float absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 sm:h-60 sm:w-60" />
            <span className="absolute right-6 top-2 font-display text-5xl text-jelly sm:text-6xl">Z</span>
            <span className="absolute right-0 top-14 font-display text-3xl text-pink sm:text-4xl">z</span>
          </div>
        </section>
      </div>
    );
  }

  const ids = owned.data?.ids ?? [];
  return (
    <div>
      <PageHero
        tone="--butter"
        kicker="Home base"
        title="Your den"
        face={{ mood: 0, seed: 3 }}
        aside={
          ids.length > 0 && (
            <div className="stk -rotate-3 bg-butter px-4 py-2 text-center text-[#1e1238]">
              <div className="font-display text-4xl leading-none tabular-nums">
                {ids.length}
                {owned.data?.partial ? "+" : ""}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider">{ids.length === 1 ? "Chog" : "Chogs"}</div>
            </div>
          )
        }
      >
        Every Chog you hold, and how its Daemon is feeling.
      </PageHero>

      <QuestTape firstChog={ids[0]} />

      <section aria-label="Your Chogs" className="px-4 py-10 sm:px-6 lg:px-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-3xl">Your Chogs</h2>
          <Link href="/explore" className={cx("stk squish inline-flex items-center gap-2 !rounded-full bg-pink px-5 py-2 text-sm font-bold text-[#1e1238] transition-transform hover:-translate-y-0.5")}>
            Visit someone else&apos;s
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {!contracts.mockChog ? null : owned.isLoading ? (
          <Loading label="Looking for your Chogs…" />
        ) : owned.error ? (
          <Notice tone="error" title="We couldn't load your Chogs">
            The network didn&apos;t answer. It usually comes back in a moment.
          </Notice>
        ) : ids.length === 0 && owned.data?.balance === BigInt(0) ? (
          <EmptyDen />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 2xl:grid-cols-5">
              {ids.slice(0, shown).map((id, i) => (
                <div key={id.toString()} style={{ animation: `rise .6s ${Math.min(i, 8) * 60}ms ease both` }}>
                  <ChogCard tokenId={id} />
                </div>
              ))}
            </div>
            {ids.length > shown && (
              <div className="mt-10 text-center">
                <Button variant="ghost" className={STICKER_BTN} onClick={() => setShown((n) => n + 24)}>
                  Show {Math.min(24, ids.length - shown)} more
                </Button>
              </div>
            )}
            {owned.data?.partial && (
              <p className="mt-8 text-center text-sm text-dim">
                Don&apos;t see one of your Chogs?{" "}
                <Link href="/explore" className="font-semibold text-jelly underline-offset-4 hover:underline">
                  Open it by its number
                </Link>
                .
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function EmptyDen() {
  const s = useStarter();
  return (
    <div className="stk relative grid items-center gap-6 overflow-hidden !rounded-[1.75rem] px-6 py-10 sm:grid-cols-[auto_1fr] sm:px-10">
      <div aria-hidden className="mesh absolute inset-0 opacity-60" />
      <ChogFace className="animate-float relative mx-auto h-40 w-40 -rotate-3 sm:h-48 sm:w-48" />
      <div className="relative text-center sm:text-left">
        <div className="font-display text-4xl leading-none sm:text-5xl">No Chogs here yet</div>
        <p className="mt-3 max-w-sm text-dim">Mint a free test Chog and it&apos;ll show up right here, ready to wake.</p>
        <Button size="lg" className={cx("mt-6", STICKER_BTN)} onClick={() => void s.mint()} loading={s.pending === MINT_LABEL} disabled={!s.canMint}>
          Mint a free Chog
        </Button>
        {!s.hasMon && <p className="mt-3 text-xs text-dim">You&apos;ll need a little free MON for the network fee first.</p>}
      </div>
    </div>
  );
}

/** Getting-started path: four stones joined by a dashed line that fills as each step is done. */
function QuestTape({ firstChog }: { firstChog?: bigint }) {
  const s = useStarter();
  const steps = [
    {
      done: s.hasMon,
      title: "Grab free MON",
      body: "A pinch covers network fees.",
      action: (
        <a href={FAUCET_URL} target="_blank" rel="noreferrer" className={cx("stk squish inline-flex items-center gap-1.5 !rounded-full bg-sky px-4 py-1.5 text-sm font-bold text-[#1e1238] transition-transform hover:-translate-y-0.5")}>
          Open the faucet
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>
      ),
    },
    {
      done: s.hasChog,
      title: "Mint a Chog",
      body: "Free, with its own look and vibe.",
      action: (
        <Button size="sm" className={STICKER_BTN} onClick={() => void s.mint()} loading={s.pending === MINT_LABEL} disabled={!s.canMint}>
          Mint
        </Button>
      ),
    },
    {
      done: s.hasDollars,
      title: "Get test dollars",
      body: `1,000 ${s.asset?.symbol ?? "dollars"} to put to work.`,
      action: (
        <Button size="sm" className={STICKER_BTN} onClick={() => void s.getDollars()} loading={s.pending === DOLLARS_LABEL} disabled={!s.canGetDollars}>
          Get them
        </Button>
      ),
    },
    {
      done: false,
      title: "Wake & feed it",
      body: "Open your Chog to start earning.",
      action:
        firstChog !== undefined ? (
          <Link href={`/daemon/${firstChog.toString()}`} className="stk squish inline-flex items-center gap-1.5 !rounded-full bg-butter px-4 py-1.5 text-sm font-bold text-[#1e1238] transition-transform hover:-translate-y-0.5">
            Open Chog #{firstChog.toString()}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        ) : null,
    },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  if (doneCount >= 3) return null;
  const current = steps.findIndex((x) => !x.done);

  return (
    <section
      aria-label="Getting started"
      className="relative border-b-[3px] border-[color:var(--st-line)] px-4 pb-10 pt-6 sm:px-6 lg:px-10"
      style={{ background: "color-mix(in oklab, var(--mint) 12%, var(--surface))" }}
    >
      <div aria-hidden className="tape-bg pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-3xl">Getting started</h2>
        <span className="stk !rounded-full px-3 py-0.5 text-sm font-bold tabular-nums">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <ol className="relative mx-auto mt-8 grid max-w-6xl md:grid-cols-4">
        {steps.map((st, i) => {
          const isCurrent = i === current;
          return (
            <li key={st.title} className="relative flex gap-4 pb-8 last:pb-0 md:flex-col md:items-center md:gap-4 md:px-2 md:pb-0">
              {i < steps.length - 1 && <span aria-hidden className="seg" style={{ "--fill": st.done ? 1 : 0 } as CSSProperties} />}
              <span
                className={cx(
                  "stk relative z-10 grid h-14 w-14 shrink-0 place-items-center !rounded-full font-display text-2xl leading-none",
                  st.done ? "bg-mint text-[#1e1238]" : isCurrent ? "wiggle bg-butter text-[#1e1238]" : "bg-surface",
                )}
              >
                {st.done ? (
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-label="Done" role="img">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <div
                className={cx(
                  "stk min-w-0 flex-1 p-4 md:w-full md:flex-none md:text-center",
                  i % 2 === 0 ? "md:-rotate-1" : "md:rotate-1",
                  st.done && "opacity-80",
                )}
              >
                <div className={cx("font-display text-xl leading-tight", st.done && "line-through decoration-[3px]")}>{st.title}</div>
                <p className="mt-1 text-sm text-dim">{st.body}</p>
                {!st.done && st.action && <div className="mt-3">{st.action}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

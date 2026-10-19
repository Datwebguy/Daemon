"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useAuth } from "@/lib/auth";
import { contracts, FAUCET_URL } from "@/lib/config";
import { useOwnedChogs } from "@/lib/hooks";
import { DOLLARS_LABEL, MINT_LABEL, useStarter } from "@/lib/starter";
import { ChogCard } from "./ChogCard";
import { ChogFace } from "@/components/ChogFace";
import { Button, cx, Loading, Notice } from "./ui";

export function MyChogs() {
  const { address } = useAccount();
  const auth = useAuth();
  const owned = useOwnedChogs(address);
  const [shown, setShown] = useState(24);

  if (!address) {
    return (
      <section className="clay relative overflow-hidden rounded-[2.5rem] px-6 py-14 text-center sm:px-12 sm:py-20">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_30%,var(--glow),transparent_70%)]" />
        <ChogFace className="relative mx-auto h-44 w-44 animate-float sm:h-56 sm:w-56" />
        <h1 className="relative mt-6 font-display text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold leading-tight tracking-tight">Your Daemons are asleep.</h1>
        <p className="relative mx-auto mt-3 max-w-md text-lg text-dim">Sign in to wake them up. Use your email, Google, X or a wallet. It takes a few seconds.</p>
        <Button size="lg" className="relative mt-8" onClick={auth.login} disabled={!auth.ready}>
          Sign in to your den
        </Button>
      </section>
    );
  }

  const ids = owned.data?.ids ?? [];
  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold leading-none tracking-tight">Your den</h1>
          <p className="mt-2 text-lg text-dim">Every Chog you hold, and how its Daemon is feeling.</p>
        </div>
        <Link href="/explore" className="rounded-full px-5 py-2.5 font-semibold text-jelly transition hover:bg-jelly/10">
          Visit someone else&apos;s →
        </Link>
      </header>

      <Checklist firstChog={ids[0]} />

      <section aria-label="Your Chogs">
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
              {ids.slice(0, shown).map((id, i) => (
                <div key={id.toString()} style={{ animation: `rise .6s ${Math.min(i, 8) * 60}ms ease both` }}>
                  <ChogCard tokenId={id} />
                </div>
              ))}
            </div>
            {ids.length > shown && (
              <div className="mt-6 text-center">
                <Button variant="ghost" onClick={() => setShown((n) => n + 24)}>
                  Show {Math.min(24, ids.length - shown)} more
                </Button>
              </div>
            )}
            {owned.data?.partial && (
              <p className="mt-6 text-center text-sm text-dim">
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
    <div className="clay-sunk flex flex-col items-center gap-4 rounded-[2rem] px-6 py-14 text-center">
      <ChogFace className="h-32 w-32 animate-float" />
      <div className="font-display text-2xl font-bold">No Chogs here yet</div>
      <p className="max-w-sm text-dim">Mint a free test Chog and it&apos;ll show up right here, ready to wake.</p>
      <Button onClick={() => void s.mint()} loading={s.pending === MINT_LABEL} disabled={!s.canMint}>
        Mint a free Chog
      </Button>
      {!s.hasMon && <p className="text-xs text-dim">You&apos;ll need a little free MON for the network fee first.</p>}
    </div>
  );
}

/** Getting-started checklist; each step ticks itself off from on-chain state. */
function Checklist({ firstChog }: { firstChog?: bigint }) {
  const s = useStarter();
  const steps = [
    {
      done: s.hasMon,
      title: "Grab free MON",
      body: "A pinch covers network fees.",
      action: (
        <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="text-sm font-semibold text-jelly underline-offset-4 hover:underline">
          Open the faucet ↗
        </a>
      ),
    },
    {
      done: s.hasChog,
      title: "Mint a Chog",
      body: "Free, with its own look and vibe.",
      action: (
        <Button size="sm" variant="secondary" onClick={() => void s.mint()} loading={s.pending === MINT_LABEL} disabled={!s.canMint}>
          Mint
        </Button>
      ),
    },
    {
      done: s.hasDollars,
      title: "Get test dollars",
      body: `1,000 ${s.asset?.symbol ?? "dollars"} to put to work.`,
      action: (
        <Button size="sm" variant="secondary" onClick={() => void s.getDollars()} loading={s.pending === DOLLARS_LABEL} disabled={!s.canGetDollars}>
          Get them
        </Button>
      ),
    },
    {
      done: false,
      title: "Wake & feed it",
      body: "Open your Chog to start earning.",
      action: firstChog !== undefined ? (
        <Link href={`/daemon/${firstChog.toString()}`} className="text-sm font-semibold text-jelly underline-offset-4 hover:underline">
          Open Chog #{firstChog.toString()} →
        </Link>
      ) : null,
    },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  if (doneCount >= 3) return null;

  return (
    <section className="clay rounded-[2rem] p-5 sm:p-7" aria-label="Getting started">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">Getting started</h2>
        <span className="text-sm text-dim">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-jelly transition-all duration-700" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((st, i) => (
          <li key={st.title} className={cx("rounded-2xl p-4 transition", st.done ? "bg-mint/10" : "clay-sunk")}>
            <div className="flex items-center gap-2.5">
              <span
                className={cx(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold",
                  st.done ? "bg-mint text-white" : "bg-surface text-dim",
                )}
              >
                {st.done ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className={cx("font-semibold", st.done && "text-dim line-through decoration-2")}>{st.title}</span>
            </div>
            <p className="mt-2 text-sm text-dim">{st.body}</p>
            {!st.done && st.action && <div className="mt-3">{st.action}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}

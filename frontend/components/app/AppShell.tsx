"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FAUCET_URL } from "@/lib/config";
import { DOLLARS_LABEL, MINT_LABEL, useStarter } from "@/lib/starter";
import { Logo } from "../brand/Logo";
import { useTheme } from "../ThemeProvider";
import { cx } from "../ui";
import { WakingBanner } from "./WakingBanner";
import { Wallet } from "./Wallet";

const NAV = [
  { href: "/app", label: "Your den", icon: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" },
  { href: "/explore", label: "Find a Daemon", icon: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm9 16-4.3-4.3" },
  { href: "/feed", label: "Live activity", icon: "M3 12h4l3-8 4 16 3-8h4" },
];

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("h-5 w-5", className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function active(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <div className="relative min-h-screen">
      {/* warm white with soft colour blobs, plus a faint dot grid */}
      <div aria-hidden className="mesh pointer-events-none fixed inset-0 -z-10">
        <div className="dots absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      </div>

      {/* desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col p-4 lg:flex">
        <div className="glass flex h-full flex-col rounded-[2rem] p-4">
          <Logo className="px-2 pt-1" />
          <nav className="mt-8 space-y-1" aria-label="App">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(pathname, n.href) ? "page" : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold transition",
                  active(pathname, n.href) ? "bg-fg text-bg" : "text-dim hover:bg-surface/70 hover:text-fg",
                )}
              >
                <Icon d={n.icon} />
                {n.label}
              </Link>
            ))}
          </nav>

          <StarterCard />

          <div className="mt-3 flex items-center justify-between px-2">
            <Link href="/" className="text-sm font-semibold text-dim hover:text-fg">
              About Daemon
            </Link>
            <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-full text-dim hover:bg-surface/70 hover:text-fg" aria-label={theme === "dark" ? "Switch to day" : "Switch to night"}>
              {theme === "dark" ? (
                <Icon d="M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5 19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5 19 5M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
              ) : (
                <Icon d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
              )}
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        {/* top bar */}
        <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6 lg:px-8 lg:pt-4">
          <div className="glass mx-auto flex max-w-6xl items-center gap-3 rounded-full px-3 py-2 lg:bg-transparent lg:backdrop-blur-none lg:[border-color:transparent]">
            <Logo className="lg:hidden" href="/app" />
            <div className="ml-auto flex items-center gap-2">
              <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-full text-dim lg:hidden" aria-label="Toggle day and night">
                {theme === "dark" ? "☀" : "☾"}
              </button>
              <Wallet compact />
            </div>
          </div>
        </header>

        <WakingBanner />

        <main className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-6 lg:px-8 lg:pb-16">{children}</main>
      </div>

      {/* mobile tab bar */}
      <nav aria-label="App" className="glass fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-full p-1.5 lg:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(pathname, n.href) ? "page" : undefined}
            className={cx(
              "flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[11px] font-semibold transition",
              active(pathname, n.href) ? "bg-fg text-bg" : "text-dim",
            )}
          >
            <Icon d={n.icon} className="h-5 w-5" />
            {n.label.replace("Find a ", "")}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Built-in helpers so nobody has to leave the app to get started. */
function StarterCard() {
  const s = useStarter();
  return (
    <div className="mt-auto rounded-3xl bg-surface/70 p-4">
      <div className="font-display font-bold">Free test supplies</div>
      <p className="mt-1 text-xs text-dim">Everything here is pretend money. Grab what you need.</p>
      <div className="mt-3 space-y-1.5 text-sm">
        <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl px-3 py-2 font-semibold hover:bg-surface-2">
          Free MON for fees <span aria-hidden>↗</span>
        </a>
        <button
          disabled={!s.canGetDollars || s.pending !== null}
          onClick={() => void s.getDollars()}
          className="flex w-full items-center justify-between rounded-2xl px-3 py-2 font-semibold hover:bg-surface-2 disabled:opacity-45"
        >
          {s.pending === DOLLARS_LABEL ? "Adding…" : `1,000 test ${s.asset?.symbol ?? "dollars"}`} <span aria-hidden>+</span>
        </button>
        <button
          disabled={!s.canMint || s.pending !== null}
          onClick={() => void s.mint()}
          className="flex w-full items-center justify-between rounded-2xl px-3 py-2 font-semibold hover:bg-surface-2 disabled:opacity-45"
        >
          {s.pending === MINT_LABEL ? "Minting…" : "Mint a free Chog"} <span aria-hidden>+</span>
        </button>
      </div>
      {!s.address && <p className="mt-2 text-xs text-dim">Sign in to use these.</p>}
    </div>
  );
}

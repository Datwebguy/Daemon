"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { FAUCET_URL } from "@/lib/config";
import { cx } from "@/lib/cx";
import { DOLLARS_LABEL, MINT_LABEL, useStarter } from "@/lib/starter";
import { Logo } from "../brand/Logo";
import { ThemeToggle } from "../ThemeToggle";
import { WakingBanner } from "./WakingBanner";
import { Wallet } from "./Wallet";

type Tone = "--butter" | "--pink" | "--sky" | "--jelly";

const NAV: { href: string; label: string; short: string; tone: Tone; icon: string }[] = [
  { href: "/app", label: "Your den", short: "Den", tone: "--butter", icon: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" },
  { href: "/explore", label: "Find a Daemon", short: "Find", tone: "--pink", icon: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm9 16-4.3-4.3" },
  { href: "/feed", label: "Live activity", short: "Live", tone: "--sky", icon: "M3 12h4l3-8 4 16 3-8h4" },
];

const INK = "#1e1238";

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("h-5 w-5", className)} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname.startsWith(href);
}

/** What the top bar says about where you are. */
function where(pathname: string): { kicker: string; title: string; tone: Tone } {
  const hit = NAV.find((n) => isActive(pathname, n.href));
  if (hit) return { kicker: "You are in", title: hit.label, tone: hit.tone };
  const d = /^\/daemon\/(\d+)/.exec(pathname);
  if (d) return { kicker: "Visiting", title: `Chog #${d[1]}`, tone: "--jelly" };
  return { kicker: "You are in", title: "Daemon", tone: "--jelly" };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const here = where(pathname);

  return (
    <div className="relative min-h-dvh">
      {/* colour-wash background, fixed so both themes stay colourful */}
      <div aria-hidden className="mesh pointer-events-none fixed inset-0 -z-10">
        <div className="dots absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      </div>

      {/* desktop rail: glued to the left edge */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-24 flex-col border-r-4 border-[color:var(--st-line)] bg-[var(--surface)] lg:flex">
        <div className="flex justify-center pb-3 pt-5 [@media(max-height:640px)]:hidden">
          <div className="[writing-mode:vertical-rl] rotate-180">
            <Logo href="/app" />
          </div>
        </div>
        <div aria-hidden className="mx-3 border-t-[3px] border-dashed border-[color:var(--st-line)] opacity-25" />

        <nav className="mt-5 flex flex-col gap-3" aria-label="App">
          {NAV.map((n) => {
            const on = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-label={n.label}
                aria-current={on ? "page" : undefined}
                style={{ "--tab": `var(${n.tone})`, background: on ? "var(--tab)" : "color-mix(in oklab, var(--tab) var(--tint), var(--surface))" } as CSSProperties}
                className={cx(
                  "relative z-10 ml-2 flex flex-col items-center [--tint:30%] dark:[--tint:14%] gap-1.5 border-[3px] border-[color:var(--st-line)] py-3 text-[13px] font-bold leading-none transition-[margin,padding,box-shadow,background] duration-200",
                  on
                    ? "-mr-[18px] rounded-l-2xl rounded-r-2xl pr-[18px] shadow-[4px_4px_0_var(--st-shadow)]"
                    : "mr-2 rounded-l-2xl rounded-r-lg hover:-mr-1 hover:pr-2",
                )}
              >
                <span style={{ color: on ? INK : undefined }} className={cx("flex flex-col items-center gap-1.5", !on && "dark:text-[var(--tab)]")}>
                  <Icon d={n.icon} className="h-7 w-7" />
                  {n.short}
                </span>
              </Link>
            );
          })}
        </nav>

        <Supplies />
      </aside>

      <div className="min-w-0 overflow-x-clip lg:pl-24">
        {/* top bar: attached to the top edge */}
        <header className="sticky top-0 z-30 border-b-[3px] border-[color:var(--st-line)] bg-[var(--surface)]">
          <div className="flex h-16 items-stretch">
            <div className="title-slab shrink-0">
              <div className="slash ink-on flex h-full items-center pl-4 pr-10 sm:pr-14 lg:pl-8 lg:pr-16" style={{ background: `var(${here.tone})`, color: here.tone === "--jelly" ? "#fff" : INK }}>
                <Logo href="/app" className="lg:hidden [&>span]:max-sm:text-[1.4rem]" />
                <div className="hidden leading-none lg:block">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">{here.kicker}</div>
                  <div className="mt-1 font-display text-2xl">{here.title}</div>
                </div>
              </div>
            </div>
            <div aria-hidden className="tape-bg hidden flex-1 sm:block" />
            <div className="ml-auto flex items-center gap-2 pl-2 pr-3 sm:gap-3 sm:pr-6 lg:pr-10">
              <ThemeToggle compact className="!h-10" />
              <Wallet compact />
            </div>
          </div>
        </header>

        <WakingBanner />

        {/* pages manage their own padding so they can bleed to the edges */}
        <main className="min-h-[calc(100dvh-4rem)] pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      </div>

      {/* mobile tab bar: attached to the bottom edge */}
      <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-[color:var(--st-line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-3 items-end gap-2 px-2">
          {NAV.map((n) => {
            const on = isActive(pathname, n.href);
            return (
              <li key={n.href} className="min-w-0">
                <Link
                  href={n.href}
                  aria-label={n.label}
                  aria-current={on ? "page" : undefined}
                  style={{ "--tab": `var(${n.tone})`, background: on ? "var(--tab)" : "color-mix(in oklab, var(--tab) var(--tint), var(--surface))", color: on ? INK : undefined } as CSSProperties}
                  className={cx(
                    "flex flex-col items-center justify-center gap-1 border-[3px] [--tint:30%] dark:[--tint:14%] border-[color:var(--st-line)] text-xs font-bold leading-none transition-[height,margin] duration-200",
                    on ? "-mt-3 h-[4.75rem] rounded-t-2xl border-b-0 pb-1 shadow-[0_-3px_0_var(--st-shadow)]" : "my-2 h-12 rounded-xl dark:text-[var(--tab)]",
                  )}
                >
                  <Icon d={n.icon} className="h-6 w-6" />
                  {n.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function ToolIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Tool({
  label,
  title,
  icon,
  tone,
  href,
  onClick,
  disabled,
}: {
  label: string;
  title: string;
  icon: string;
  tone: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const cls =
    "stk squish flex h-[3.4rem] w-full flex-col items-center justify-center gap-1 !rounded-xl !shadow-[2px_2px_0_var(--st-shadow)] text-[10px] font-bold leading-none transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-45";
  const chip = (
    <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-[color:var(--st-line)]" style={{ background: `var(${tone})`, color: INK }}>
      <ToolIcon d={icon} />
    </span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" title={title} aria-label={`${title} (opens in a new tab)`} className={cls}>
      {chip}
      {label}
    </a>
  ) : (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={cls}>
      {chip}
      {label}
    </button>
  );
}

/** Built-in helpers so nobody has to leave the app to get started. */
function Supplies() {
  const s = useStarter();
  return (
    <div className="mt-auto flex flex-col gap-2 px-2 pb-3 pt-3">
      <div className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-dim">Free supplies</div>
      <Tool label="MON" title="Free MON for fees" icon="M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3z" tone="--sky" href={FAUCET_URL} />
      <Tool
        label={s.pending === DOLLARS_LABEL ? "Adding" : "Dollars"}
        title={`1,000 test ${s.asset?.symbol ?? "dollars"}`}
        icon="M12 3v18M16.5 7.5C15.7 6.5 14 6 12 6c-2.4 0-4 1.1-4 2.9 0 4.4 8 2 8 6.2 0 1.8-1.7 3-4 3-2 0-3.5-.6-4.3-1.7"
        tone="--mint"
        onClick={() => void s.getDollars()}
        disabled={!s.canGetDollars || s.pending !== null}
      />
      <Tool
        label={s.pending === MINT_LABEL ? "Minting" : "Chog"}
        title="Mint a free Chog"
        icon="M12 5v14M5 12h14"
        tone="--butter"
        onClick={() => void s.mint()}
        disabled={!s.canMint || s.pending !== null}
      />
      {!s.address && <p className="text-center text-[10px] leading-tight text-dim">Sign in to use these.</p>}
      <ThemeToggle className="!h-10 w-full justify-between [&>span]:flex-1 [&>span]:justify-center [&>span]:!px-0 [&_span_span]:hidden" />
      <Link href="/" className="text-center text-[11px] font-semibold text-dim underline-offset-4 hover:text-fg hover:underline">
        About Daemon
      </Link>
    </div>
  );
}

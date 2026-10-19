"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FAUCET_URL } from "@/lib/config";
import { cx } from "@/lib/cx";
import { DOLLARS_LABEL, MINT_LABEL, useStarter } from "@/lib/starter";
import { Logo } from "../brand/Logo";
import { ThemeToggle } from "../ThemeToggle";
import { WakingBanner } from "./WakingBanner";
import { Wallet } from "./Wallet";

type Tone = "--butter" | "--pink" | "--sky" | "--jelly";

const NAV: { href: string; label: string; short: string; tone: Tone; icon: string }[] = [
  { href: "/app", label: "Your den", short: "Den", tone: "--butter", icon: "M3 5h8v8H3zM13 5h8v5h-8zM13 12h8v7h-8zM3 15h8v4H3z" },
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
      {/* desktop rail: glued to the left edge */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-28 flex-col border-r-4 border-[color:var(--st-line)] bg-[var(--surface)] lg:flex">
        <div className="flex justify-center pb-4 pt-5 [&>a>span]:text-[1.5rem]">
          <Logo href="/" />
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
                  "relative z-10 ml-2 flex flex-col items-center [--tint:30%] dark:[--tint:14%] gap-1.5 border-[3px] border-[color:var(--st-line)] py-3.5 text-sm font-bold leading-none transition-[margin,padding,box-shadow,background] duration-200",
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

      <div className="min-w-0 overflow-x-clip lg:pl-28">
        {/* top bar: attached to the top edge */}
        <header className="sticky top-0 z-30 border-b-[3px] border-[color:var(--st-line)] bg-[var(--surface)]">
          <div className="flex h-16 items-stretch">
            <div className="title-slab shrink-0">
              <div className="slash ink-on flex h-full items-center pl-4 pr-8 sm:pr-14 lg:pl-8 lg:pr-16" style={{ background: `var(${here.tone})`, color: here.tone === "--jelly" ? "#fff" : INK }}>
                <Logo href="/" className="lg:hidden [&>span]:max-sm:text-[1.4rem]" />
                <div className="hidden leading-none lg:block">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">{here.kicker}</div>
                  <div className="mt-1 font-display text-2xl">{here.title}</div>
                </div>
              </div>
            </div>
            <div aria-hidden className="tape-bg hidden flex-1 sm:block" />
            <div className="ml-auto flex min-w-0 items-center gap-2 pl-2 pr-3 sm:gap-3 sm:pr-6 lg:pr-10">
              <ThemeToggle mini className="!h-10" />
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

/** Built-in helpers so nobody has to leave the app to get started: one button, one readable tray. */
function Supplies() {
  const s = useStarter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const rows: { title: string; hint: string; icon: string; tone: string; href?: string; run?: () => void; off?: boolean; busy?: boolean }[] = [
    { title: "Free MON for fees", hint: "Opens the faucet", icon: "M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3z", tone: "--sky", href: FAUCET_URL },
    {
      title: `1,000 test ${s.asset?.symbol ?? "dollars"}`,
      hint: !s.address ? "Sign in first" : "Pretend money to put to work",
      icon: "M12 3v18M16.5 7.5C15.7 6.5 14 6 12 6c-2.4 0-4 1.1-4 2.9 0 4.4 8 2 8 6.2 0 1.8-1.7 3-4 3-2 0-3.5-.6-4.3-1.7",
      tone: "--mint",
      run: () => void s.getDollars(),
      off: !s.canGetDollars || s.pending !== null,
      busy: s.pending === DOLLARS_LABEL,
    },
    {
      title: "Mint a free Chog",
      hint: !s.address ? "Sign in first" : "A real Chog artwork, for testing",
      icon: "M12 5v14M5 12h14",
      tone: "--butter",
      run: () => void s.mint(),
      off: !s.canMint || s.pending !== null,
      busy: s.pending === MINT_LABEL,
    },
  ];

  return (
    <div className="mt-auto flex flex-col gap-3 px-2.5 pb-4 pt-3" ref={ref}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="sticker sticker-pop squish flex w-full flex-col items-center gap-1 !rounded-2xl !bg-butter px-1 py-3 text-sm font-bold leading-tight"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
          </svg>
          Free supplies
        </button>
        {open && (
          <div role="menu" className="sticker animate-pop absolute bottom-0 left-[calc(100%+0.9rem)] z-50 w-72 !rounded-2xl p-2">
            <p className="px-3 pb-1 pt-2 text-xs text-dim">Everything here is pretend money. Take what you need.</p>
            {rows.map((r) => {
              const inner = (
                <>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-[3px] border-[color:var(--st-line)]" style={{ background: `var(${r.tone})`, color: INK }}>
                    <ToolIcon d={r.icon} />
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block text-sm font-bold leading-tight">{r.busy ? "Working on it…" : r.title}</span>
                    <span className="block text-xs text-dim">{r.hint}</span>
                  </span>
                </>
              );
              const cls = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-jelly/15 disabled:cursor-not-allowed disabled:opacity-60";
              return r.href ? (
                <a key={r.title} role="menuitem" href={r.href} target="_blank" rel="noreferrer" className={cls} onClick={() => setOpen(false)}>
                  {inner}
                </a>
              ) : (
                <button
                  key={r.title}
                  role="menuitem"
                  type="button"
                  disabled={r.off}
                  className={cls}
                  onClick={() => {
                    r.run?.();
                    setOpen(false);
                  }}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs font-bold text-dim">Theme</span>
        <ThemeToggle iconOnly className="!h-11" />
      </div>
      <Link href="/" className="text-center text-xs font-semibold text-dim underline-offset-4 hover:text-fg hover:underline">
        About Daemon
      </Link>
    </div>
  );
}

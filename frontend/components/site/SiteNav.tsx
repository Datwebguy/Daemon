"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "../brand/Logo";
import { ThemeToggle } from "../ThemeToggle";
import { cx } from "../ui";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#moods", label: "Moods" },
  { href: "#earn", label: "Earn" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <nav
        className={cx(
          "mx-auto flex max-w-6xl items-center gap-2 rounded-full px-3 py-2 transition-all duration-500 sm:px-4",
          scrolled ? "glass shadow-[0_12px_40px_-20px_var(--clay-lo)]" : "bg-transparent",
        )}
        aria-label="Main"
      >
        <Logo className="mr-auto pl-1" />
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-full px-4 py-2 text-sm font-semibold text-dim transition hover:bg-surface/70 hover:text-fg">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <ThemeToggle compact className="ml-1" />
        <Link
          href="/app"
          className="ml-1 hidden items-center gap-2 rounded-full bg-fg px-5 py-2.5 sm:inline-flex text-sm font-semibold text-bg transition hover:scale-[1.03] active:scale-[0.98]"
        >
          Open the app
        </Link>
        <button
          className="grid h-10 w-10 place-items-center rounded-full md:hidden"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
          </svg>
        </button>
      </nav>
      {open && (
        <div className="glass mx-auto mt-2 max-w-6xl rounded-3xl p-3 md:hidden animate-pop">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 font-semibold hover:bg-surface/70">
              {l.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}

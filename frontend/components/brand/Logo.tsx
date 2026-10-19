import Link from "next/link";
import { cx } from "@/lib/cx";

/** Wordmark: a tiny Daemon face + "daemon" set in the display face. */
export function Logo({ href = "/", className, light }: { href?: string; className?: string; light?: boolean }) {
  return (
    <Link href={href} className={cx("group inline-flex items-center gap-2.5", className)} aria-label="Daemon home">
      <svg viewBox="0 0 40 40" className="h-9 w-9 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" aria-hidden>
        <path d="M9 15 L6 3 Q14 6 17 11 Z M31 15 L34 3 Q26 6 23 11 Z" fill="#6a47ea" />
        <ellipse cx="20" cy="22" rx="16" ry="14.5" fill="#7a5af0" />
        <ellipse cx="14.5" cy="20.5" rx="4" ry="4.4" fill="white" />
        <ellipse cx="25.5" cy="20.5" rx="4" ry="4.4" fill="white" />
        <circle cx="15.2" cy="21" r="2" fill="#1e1238" />
        <circle cx="26.2" cy="21" r="2" fill="#1e1238" />
        <path d="M16.5 28 Q20 30.5 23.5 28" stroke="#1e1238" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
      <span className={cx("font-display text-[1.45rem] font-extrabold tracking-tight", light ? "text-white" : "text-fg")}>daemon</span>
    </Link>
  );
}

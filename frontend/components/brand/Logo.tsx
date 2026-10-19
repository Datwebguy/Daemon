import Link from "next/link";
import { cx } from "@/lib/cx";

/** The Daemon mark: a half-asleep eye with a lightning pupil, orbited by a small spark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} role="img" aria-label="Daemon">
      <defs>
        <linearGradient id="dm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#3b1a8a" />
        </linearGradient>
        <linearGradient id="dm-iris" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <clipPath id="dm-eye">
          <path d="M30 138 Q128 60 226 138 Q128 206 30 138Z" />
        </clipPath>
      </defs>
      <rect width="256" height="256" rx="58" fill="url(#dm-bg)" />
      <circle cx="128" cy="138" r="104" fill="none" stroke="#ddd6fe" strokeOpacity=".34" strokeWidth="3" strokeDasharray="1 10" strokeLinecap="round" />
      <circle cx="208" cy="71" r="8" fill="#fde68a" />
      <circle cx="208" cy="71" r="14" fill="#fde68a" fillOpacity=".22" />
      <path d="M30 138 Q128 60 226 138 Q128 206 30 138Z" fill="#f5f3ff" />
      <g clipPath="url(#dm-eye)">
        <circle cx="128" cy="146" r="46" fill="url(#dm-iris)" />
        <path d="M136 108 L110 150 H127 L119 184 L148 138 H130 Z" fill="#2e1065" />
        <path d="M18 60 H238 V128 Q128 112 18 128Z" fill="#5b2fc9" />
        <path d="M30 128 Q128 112 226 128" fill="none" stroke="#1e0a4d" strokeWidth="7" strokeLinecap="round" />
      </g>
      <path d="M30 138 Q128 60 226 138 Q128 206 30 138Z" fill="none" stroke="#1e0a4d" strokeWidth="7" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className, light }: { href?: string; className?: string; light?: boolean }) {
  return (
    <Link href={href} className={cx("group inline-flex items-center gap-2", className)} aria-label="Daemon home">
      <LogoMark className="h-8 w-8 transition-transform duration-300 group-hover:-rotate-6" />
      <span className={cx("font-display text-[1.7rem] leading-none tracking-tight", light ? "text-white" : "text-fg")}>daemon</span>
    </Link>
  );
}

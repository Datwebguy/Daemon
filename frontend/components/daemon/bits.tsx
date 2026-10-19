"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Spinner } from "../ui";

export type Tone = "jelly" | "pink" | "butter" | "sky" | "mint" | "spark";

/** A chunky sticker button (thick outline, hard shadow, presses down). */
export function StickerButton({
  tone = "jelly",
  size = "lg",
  loading,
  disabled,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "md" | "lg" | "xl"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx("dm-btn font-display", `dm-t-${tone}`, size === "md" && "dm-btn-md", size === "lg" && "dm-btn-lg", size === "xl" && "dm-btn-xl", className)}
    >
      {loading && <Spinner className="h-5 w-5" />}
      {children}
    </button>
  );
}

/** Small boxed note: dashed for tips, solid for warnings and errors. */
export function Note({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "error"; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("dm-note", className)} data-tone={tone} role={tone === "error" ? "alert" : tone === "warn" ? "status" : undefined}>
      {title && <div className="font-display text-base">{title}</div>}
      {children && <div className={cx(Boolean(title) && "mt-1")}>{children}</div>}
    </div>
  );
}

/** A progress ring (starts at the top, fills clockwise). Children sit in the middle. */
export function Ring({
  progress,
  size = 88,
  stroke = 11,
  color,
  track = "var(--surface-2)",
  className,
  children,
  label,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color: string;
  track?: string;
  className?: string;
  children?: ReactNode;
  label?: string;
}) {
  const r = 50 - stroke / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const style: CSSProperties = { width: size, height: size };
  return (
    <div className={cx("relative shrink-0", className)} style={style} role={label ? "img" : undefined} aria-label={label}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className="transition-[stroke-dashoffset] duration-1000"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Tiny line icons for the three pads (no emoji). */
export function PadIcon({ kind, className }: { kind: "harvest" | "hype" | "vaults"; className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cx("h-7 w-7", className)} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {kind === "harvest" && (
        <>
          <path d="M14 25V13" />
          <path d="M14 15C14 9.5 10.5 7 5 7c0 5.5 3.5 8 9 8z" />
          <path d="M14 17.5c0-4.2 2.8-6.5 8-6.5 0 4.2-2.8 6.5-8 6.5z" />
        </>
      )}
      {kind === "hype" && <path d="M16 3 6 16h7l-1.5 9L22 12h-7z" />}
      {kind === "vaults" && (
        <>
          <rect x="3.5" y="5" width="21" height="17" rx="3.5" />
          <circle cx="14" cy="13.5" r="4" />
          <path d="M14 11v5M11.5 13.5h5" />
          <path d="M8 22v2M20 22v2" />
        </>
      )}
    </svg>
  );
}

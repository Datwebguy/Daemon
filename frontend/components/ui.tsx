"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cx } from "@/lib/cx";
import { ChogFace } from "./ChogFace";
export { cx };

export function Card({
  children,
  className,
  title,
  right,
  kicker,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  right?: ReactNode;
  /** one-line explanation under the title */
  kicker?: ReactNode;
}) {
  return (
    <section className={cx("clay rounded-[1.75rem] p-5 sm:p-6", className)}>
      {(title || right) && (
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>}
            {kicker && <p className="mt-0.5 text-sm text-dim">{kicker}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

type Variant = "primary" | "spark" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary:
    "bg-jelly text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_10px_24px_-10px_var(--glow)] hover:bg-jelly-deep",
  spark:
    "bg-spark text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_10px_24px_-10px_rgb(255_122_69/0.6)] hover:brightness-105",
  secondary: "bg-jelly/12 text-jelly-deep hover:bg-jelly/20 dark:text-jelly-soft dark:bg-jelly/20 dark:hover:bg-jelly/30",
  ghost: "border border-line bg-surface/60 hover:bg-surface-2",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  size = "md",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition duration-200",
        "active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        size === "sm" && "px-3.5 py-1.5 text-sm",
        size === "md" && "px-5 py-2.5 text-sm",
        size === "lg" && "px-7 py-3.5 text-base",
        variants[variant],
        className,
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className ?? "h-5 w-5")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = "One moment…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-dim" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "ok"; title?: ReactNode; children?: ReactNode }) {
  const tones = {
    info: "border-jelly/25 bg-jelly/8",
    warn: "border-amber-500/30 bg-amber-400/12",
    error: "border-rose-500/30 bg-rose-500/10",
    ok: "border-mint/30 bg-mint/10",
  } as const;
  return (
    <div className={cx("rounded-2xl border px-4 py-3 text-sm", tones[tone])} role={tone === "error" ? "alert" : undefined}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={cx("text-dim", Boolean(title) && "mt-1")}>{children}</div>}
    </div>
  );
}

export function Empty({ mood, title, children, art }: { mood?: number; title: ReactNode; children?: ReactNode; art?: ReactNode }) {
  return (
    <div className="clay-sunk flex flex-col items-center gap-3 rounded-[1.75rem] px-6 py-12 text-center">
      {art ?? <ChogFace mood={mood} className="h-28 w-28 animate-float" />}
      <div className="font-display text-xl">{title}</div>
      {children && <div className="max-w-md text-sm text-dim">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "mint" | "spark" | "jelly" }) {
  return (
    <div className="clay-sunk rounded-2xl px-4 py-3.5">
      <div className="text-[13px] font-medium text-dim">{label}</div>
      <div
        className={cx(
          "mt-1 truncate font-display text-2xl font-bold tabular-nums",
          tone === "mint" && "text-mint",
          tone === "spark" && "text-spark",
          tone === "jelly" && "text-jelly",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-dim">{hint}</div>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "clay-sunk w-full min-w-0 rounded-2xl border border-transparent px-4 py-3 text-base tabular-nums outline-none transition",
        "placeholder:text-dim/70 focus:border-jelly focus:ring-4 focus:ring-jelly/15",
        props.className,
      )}
    />
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", className)}>{children}</span>;
}

/** Segmented control (two to four options). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="clay-sunk flex gap-1 rounded-full p-1 text-sm font-semibold">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 rounded-full px-4 py-2 transition disabled:opacity-40",
            value === o.value ? "bg-surface text-fg shadow-[0_4px_12px_-6px_var(--clay-lo)]" : "text-dim hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "clay m-auto rounded-[2rem] p-0 text-fg backdrop:bg-[#1e1238]/50 backdrop:backdrop-blur-sm",
        wide ? "w-[min(94vw,40rem)]" : "w-[min(92vw,28rem)]",
      )}
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-display text-2xl font-bold">{title}</h3>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-dim hover:bg-surface-2" aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}

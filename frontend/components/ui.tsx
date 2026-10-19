"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className, title, right }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <section className={cx("rounded-3xl border border-line bg-surface p-5 shadow-sm", className)}>
      {(title || right) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-bold tracking-tight">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-monad text-white hover:bg-monad-600 shadow-sm shadow-monad/30",
  secondary: "bg-monad/10 text-monad-700 dark:text-monad-200 hover:bg-monad/20",
  ghost: "border border-line hover:bg-muted",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-monad",
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
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-6 text-sm text-dim" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "ok"; title?: ReactNode; children?: ReactNode }) {
  const tones = {
    info: "border-monad/30 bg-monad/5",
    warn: "border-amber-400/40 bg-amber-400/10",
    error: "border-rose-500/40 bg-rose-500/10",
    ok: "border-emerald-500/40 bg-emerald-500/10",
  } as const;
  return (
    <div className={cx("rounded-2xl border px-4 py-3 text-sm", tones[tone])} role={tone === "error" ? "alert" : undefined}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={cx("text-dim", Boolean(title) && "mt-1")}>{children}</div>}
    </div>
  );
}

export function Empty({ emoji = "🫥", title, children }: { emoji?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <div className="text-4xl" aria-hidden>
        {emoji}
      </div>
      <div className="font-semibold">{title}</div>
      {children && <div className="max-w-md text-sm text-dim">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-dim">{label}</div>
      <div className="mt-1 truncate text-lg font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-dim">{hint}</div>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full min-w-0 rounded-2xl border border-line bg-bg px-3 py-2 text-sm tabular-nums outline-none focus:border-monad focus:ring-2 focus:ring-monad/30",
        props.className,
      )}
    />
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", className)}>{children}</span>;
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
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
      className="m-auto w-[min(92vw,28rem)] rounded-3xl border border-line bg-surface p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <h3 className="text-lg font-bold">{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </dialog>
  );
}

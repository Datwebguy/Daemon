"use client";

import { cx } from "@/lib/cx";
import { useTheme } from "./ThemeProvider";

/**
 * Always-visible Light / Dark switch. A sliding thumb shows which side you are on;
 * the labels stay readable in both themes. `compact` hides the words on small screens.
 */
export function ThemeToggle({ className, compact, iconOnly }: { className?: string; compact?: boolean; iconOnly?: boolean }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className={cx("sticker squish relative inline-flex h-11 items-center !rounded-full p-1 text-sm font-bold", className)}
    >
      <span
        aria-hidden
        className={cx("absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-butter transition-transform duration-300 ease-[cubic-bezier(.3,1.5,.5,1)]", dark ? "translate-x-full" : "translate-x-0")}
        style={{ left: "0.25rem" }}
      />
      <span className={cx("relative z-10 flex items-center gap-1.5", iconOnly ? "px-3.5" : "px-3", !dark ? "text-[#1e1238]" : "text-dim")}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <span className={cx(iconOnly ? "sr-only" : compact && "hidden sm:inline")}>Light</span>
      </span>
      <span className={cx("relative z-10 flex items-center gap-1.5", iconOnly ? "px-3.5" : "px-3", dark ? "text-[#1e1238]" : "text-dim")}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
        </svg>
        <span className={cx(iconOnly ? "sr-only" : compact && "hidden sm:inline")}>Dark</span>
      </span>
    </button>
  );
}

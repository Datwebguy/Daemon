"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/** A modal in the sticker style: thick outline, hard offset shadow, tape across the top. */
export function StickerDialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
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
        "m-auto overflow-visible border-0 bg-transparent p-0 text-fg backdrop:bg-[#0d0b14]/60 backdrop:backdrop-blur-sm",
        wide ? "w-[min(94vw,42rem)]" : "w-[min(92vw,28rem)]",
      )}
    >
      <div className="sticker max-h-[88dvh] overflow-y-auto !rounded-[1.6rem] !border-4 !shadow-[8px_8px_0_var(--st-shadow)]">
        <div aria-hidden className="tape-bg h-3 border-b-4 border-[var(--st-line)]" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h3>
            <button
              onClick={onClose}
              className="sticker squish grid h-10 w-10 shrink-0 place-items-center !rounded-full !shadow-[3px_3px_0_var(--st-shadow)]"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </dialog>
  );
}

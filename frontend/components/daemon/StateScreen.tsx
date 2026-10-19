import type { ReactNode } from "react";
import { ChogFace } from "../ChogFace";
import { Spinner } from "../ui";

/**
 * Full-bleed screen for loading, error and not-found states. Real Chog face on a tilted sticker,
 * a diagonal colour wall behind it, no cards.
 */
export function StateScreen({
  title,
  children,
  mood,
  loading,
  seed = 0,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  /** 0-4 for a mood face, undefined for the sleepy one */
  mood?: number;
  loading?: boolean;
  seed?: number;
  action?: ReactNode;
}) {
  return (
    <div className="relative grid min-h-[calc(100dvh-var(--shell-top,4.5rem))] place-items-center overflow-hidden px-4 py-12">
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(115deg,var(--butter)_0_38%,transparent_38%)] opacity-70 dark:opacity-15" />
      <div aria-hidden className="dots absolute inset-0 opacity-60" />
      <div aria-hidden className="tape-bg absolute inset-x-0 bottom-0 h-16" />
      <div className="relative z-10 flex max-w-lg flex-col items-center gap-5 text-center" role={loading ? "status" : undefined}>
        <div className="sticker relative h-40 w-40 rotate-[-4deg] !rounded-[1.8rem] !border-4 p-2 !shadow-[7px_7px_0_var(--st-shadow)] sm:h-48 sm:w-48">
          <ChogFace mood={mood} seed={seed} className="h-full w-full animate-float" />
        </div>
        <div className="sticker rotate-[1.5deg] !rounded-[1.4rem] !border-4 px-6 py-5 !shadow-[6px_6px_0_var(--st-shadow)]">
          <h1 className="font-display text-2xl leading-tight sm:text-4xl">{title}</h1>
          {children && <div className="mx-auto mt-2 max-w-sm text-sm text-dim sm:text-base">{children}</div>}
          {loading && (
            <div className="mt-3 flex justify-center text-jelly">
              <Spinner />
            </div>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}

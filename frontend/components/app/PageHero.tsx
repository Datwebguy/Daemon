import type { CSSProperties, ReactNode } from "react";
import { ChogFace } from "@/components/ChogFace";

export type Tone = "--butter" | "--pink" | "--sky" | "--jelly" | "--mint";

/**
 * Full-bleed page banner: a tint of the page colour, diagonal tape, a tilted kicker sticker,
 * big display title and (on wide screens) a real Chog leaning in from the side.
 */
export function PageHero({
  tone,
  kicker,
  title,
  children,
  aside,
  face,
}: {
  tone: Tone;
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  face?: { mood?: number; seed?: number };
}) {
  const solid = tone === "--jelly" ? "#ffffff" : "#1e1238";
  return (
    <section className="hero relative overflow-hidden" style={{ "--tone": `var(${tone})` } as CSSProperties}>
      <div aria-hidden className="tape-bg absolute inset-0 opacity-70 [mask-image:linear-gradient(100deg,black,transparent_65%)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-4 py-5 sm:px-6 sm:py-10 lg:px-10">
        <div className="min-w-0">
          <span
            className="stk inline-block -rotate-2 !rounded-lg px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ background: `var(${tone})`, color: solid }}
          >
            {kicker}
          </span>
          <h1 className="mt-3 font-display text-[clamp(2rem,8.5vw,5.4rem)] leading-[0.95] tracking-tight sm:mt-4">{title}</h1>
          {children && <p className="mt-2 max-w-xl text-sm text-dim sm:mt-4 sm:text-lg">{children}</p>}
        </div>
        <div className="flex items-end gap-5">
          {aside}
          {face && (
            <div className="hidden shrink-0 rotate-6 sm:block" aria-hidden>
              <ChogFace mood={face.mood} seed={face.seed} className="h-32 w-32 lg:h-40 lg:w-40" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

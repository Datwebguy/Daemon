"use client";

import { useState } from "react";
import { MOODS } from "@/lib/mood";
import { ChogFace } from "@/components/ChogFace";
import { cx } from "../ui";

/** Five moods as an expanding accordion: hover, focus or tap to open one. */
export function Moods() {
  const [open, setOpen] = useState(3);
  return (
    <section id="moods" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-14 sm:px-8 sm:py-32">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-6" data-reveal>
        <h2 className="max-w-xl font-display text-[clamp(1.85rem,7vw,3.6rem)] font-extrabold leading-[1] tracking-tight">
          It has feelings about your portfolio.
        </h2>
        <p className="max-w-sm text-[15px] text-dim sm:text-lg">Moods come from what&apos;s really happening: how it&apos;s earning, who&apos;s hyping it, and whether you&apos;ve forgotten about it.</p>
      </div>

      <div className="mt-7 flex flex-col gap-2 sm:mt-14 sm:gap-3 lg:h-[30rem] lg:flex-row" data-reveal style={{ ["--d" as string]: "120ms" }}>
        {MOODS.map((m, i) => {
          const isOpen = open === i;
          return (
            <button
              key={m.name}
              type="button"
              onMouseEnter={() => setOpen(i)}
              onFocus={() => setOpen(i)}
              onClick={() => setOpen(i)}
              aria-expanded={isOpen}
              className={cx(
                "group relative overflow-hidden rounded-[1.25rem] text-left sm:rounded-[2rem] transition-[flex-grow,background-color] duration-700 ease-[cubic-bezier(.2,.7,.2,1)]",
                "min-h-[3.25rem] sm:min-h-[6rem] lg:min-h-0",
                isOpen ? "lg:flex-[4]" : "lg:flex-[1]",
              )}
              style={{ background: `color-mix(in oklab, ${m.hex} ${isOpen ? 32 : 18}%, var(--surface))` }}
            >
              <div className="relative flex h-full flex-col px-4 py-3 sm:p-6">
                <div className={cx("flex items-center gap-3", !isOpen && "lg:flex-col lg:items-start")}>
                  <span className={cx("font-display text-lg font-bold sm:text-2xl", !isOpen && "lg:[writing-mode:vertical-rl] lg:rotate-180 lg:text-xl")}>{m.name}</span>
                </div>
                <div className={cx("grid transition-all duration-700", isOpen ? "mt-2 grid-rows-[1fr] opacity-100 sm:mt-4" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden pr-24 sm:pr-0">
                    <p className="max-w-xs text-sm text-dim sm:text-base">{m.blurb}</p>
                    <p className="mt-2 max-w-xs text-xs font-semibold sm:mt-3 sm:text-sm">When: {m.when}</p>
                    <p className="mt-2 max-w-xs font-display text-sm font-semibold leading-snug sm:mt-4 sm:text-lg">“{m.lines[0]}”</p>
                  </div>
                </div>
                <div className={cx("mt-auto self-end transition-all duration-700", isOpen ? "max-sm:absolute max-sm:bottom-3 max-sm:right-3 h-20 w-20 opacity-100 sm:h-48 sm:w-48" : "h-0 w-0 opacity-0 lg:h-16 lg:w-16 lg:self-center lg:opacity-70")}>
                  <ChogFace mood={i} boosted={i === 3 && isOpen} className="h-full w-full" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

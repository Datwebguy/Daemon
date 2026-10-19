"use client";

import { useState } from "react";
import { MOODS } from "@/lib/mood";
import { ChogFace } from "@/components/ChogFace";
import { cx } from "../ui";

/** Five moods as an expanding accordion: hover, focus or tap to open one. */
export function Moods() {
  const [open, setOpen] = useState(3);
  return (
    <section id="moods" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32">
      <div className="flex flex-wrap items-end justify-between gap-6" data-reveal>
        <h2 className="max-w-xl font-display text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-[0.98] tracking-tight">
          It has feelings about your portfolio.
        </h2>
        <p className="max-w-sm text-lg text-dim">Moods come from what&apos;s really happening: how it&apos;s earning, who&apos;s hyping it, and whether you&apos;ve forgotten about it.</p>
      </div>

      <div className="mt-14 flex flex-col gap-3 lg:h-[30rem] lg:flex-row" data-reveal style={{ ["--d" as string]: "120ms" }}>
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
                "group relative overflow-hidden rounded-[2rem] text-left transition-[flex-grow,background-color] duration-700 ease-[cubic-bezier(.2,.7,.2,1)]",
                "min-h-[6rem] lg:min-h-0",
                isOpen ? "lg:flex-[4]" : "lg:flex-[1]",
              )}
              style={{ background: `color-mix(in oklab, ${m.hex} ${isOpen ? 32 : 18}%, var(--surface))` }}
            >
              <div className="flex h-full flex-col p-5 sm:p-6">
                <div className={cx("flex items-center gap-3", !isOpen && "lg:flex-col lg:items-start")}>
                  <span className={cx("font-display text-2xl font-bold", !isOpen && "lg:[writing-mode:vertical-rl] lg:rotate-180 lg:text-xl")}>{m.name}</span>
                </div>
                <div className={cx("grid transition-all duration-700", isOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden">
                    <p className="max-w-xs text-dim">{m.blurb}</p>
                    <p className="mt-3 max-w-xs text-sm font-semibold">When: {m.when}</p>
                    <p className="mt-4 max-w-xs font-display text-lg font-semibold leading-snug">“{m.lines[0]}”</p>
                  </div>
                </div>
                <div className={cx("mt-auto self-end transition-all duration-700", isOpen ? "h-40 w-40 opacity-100 sm:h-48 sm:w-48" : "h-0 w-0 opacity-0 lg:h-16 lg:w-16 lg:self-center lg:opacity-70")}>
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

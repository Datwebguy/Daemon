import { BOOSTED_LINES, MOODS } from "@/lib/mood";

const BANDS = ["#ffd84d", "#ff7eb6", "#5cc6ff", "#b9a6fa", "#7de3b8"];

/** A bright, slightly crooked ribbon of things Daemons actually say. */
export function Ticker() {
  const items = [
    ...MOODS.flatMap((m) => m.lines.slice(0, 2).map((l) => ({ c: m.hex, l }))),
    ...BOOSTED_LINES.slice(0, 2).map((l) => ({ c: "#ff7a45", l })),
  ];
  const row = [...items, ...items];
  return (
    <section aria-label="What Daemons are saying" className="relative z-10 -my-2 -rotate-1 overflow-hidden border-y-[3px] border-[#1e1238] bg-butter py-2.5 text-[#1e1238] sm:py-4">
      <div className="flex w-max animate-marquee gap-6 sm:gap-8 whitespace-nowrap">
        {row.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-3 font-display text-base sm:text-xl" aria-hidden={i >= items.length}>
            <span className="h-3 w-3 rounded-full border-2 border-[#1e1238]" style={{ background: it.c }} />
            {it.l}
            <span className="ml-5 inline-block h-3 w-3 rotate-45 border-2 border-[#1e1238]" style={{ background: BANDS[i % BANDS.length] }} />
          </span>
        ))}
      </div>
    </section>
  );
}

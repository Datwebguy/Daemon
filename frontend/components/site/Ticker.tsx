import { BOOSTED_LINES, MOODS } from "@/lib/mood";

/** A slow ribbon of things Daemons actually say. */
export function Ticker() {
  const items = [
    ...MOODS.flatMap((m) => m.lines.slice(0, 2).map((l) => ({ e: m.emoji, l, c: m.hex }))),
    ...BOOSTED_LINES.slice(0, 2).map((l) => ({ e: "⚡", l, c: "#ff7a45" })),
  ];
  const row = [...items, ...items];
  return (
    <section aria-label="What Daemons are saying" className="relative -rotate-1 border-y border-line bg-fg py-4 text-bg">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
        {row.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-3 font-display text-lg font-semibold" aria-hidden={i >= items.length}>
            <span className="text-2xl">{it.e}</span>
            {it.l}
            <span className="ml-6 inline-block h-2 w-2 rounded-full" style={{ background: it.c }} />
          </span>
        ))}
      </div>
    </section>
  );
}

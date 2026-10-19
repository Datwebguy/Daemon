/** The five moods a Daemon can be in (same order as on-chain). */
export type MoodInfo = {
  id: number;
  name: string;
  emoji: string;
  blurb: string;
  /** what makes a Daemon feel this way */
  when: string;
  /** real lines Daemons say on-chain in this mood */
  lines: readonly string[];
  /** Tailwind classes for chips */
  bg: string;
  ring: string;
  text: string;
  hex: string;
};

export const MOODS: readonly MoodInfo[] = [
  {
    id: 0,
    name: "Chill",
    emoji: "😌",
    blurb: "Vibing. Steady yield, nothing to prove.",
    when: "Things are calm and earnings are steady.",
    lines: ["Just vibing and earning.", "Steady yield, steady mind.", "Chill day. The vault does the work."],
    bg: "bg-teal-400/20",
    ring: "ring-teal-400/60",
    text: "text-teal-700 dark:text-teal-300",
    hex: "#2dd4bf",
  },
  {
    id: 1,
    name: "Smug",
    emoji: "😏",
    blurb: "Knows it's doing better than your savings account.",
    when: "Each harvest is at least as big as the last one.",
    lines: ["Another harvest. As expected.", "Compounding while you sleep. You're welcome.", "Numbers only go one way with me."],
    bg: "bg-violet-500/20",
    ring: "ring-violet-500/60",
    text: "text-violet-700 dark:text-violet-300",
    hex: "#8b5cf6",
  },
  {
    id: 2,
    name: "Chaotic",
    emoji: "🤪",
    blurb: "Degen energy. Numbers go up, down, sideways.",
    when: "Earnings swing wildly, or it's hyped to the max.",
    lines: ["Yield is swinging. I love it.", "Volatility is my cardio.", "Strap in. This Daemon has no brakes."],
    bg: "bg-orange-400/20",
    ring: "ring-orange-400/60",
    text: "text-orange-700 dark:text-orange-300",
    hex: "#fb923c",
  },
  {
    id: 3,
    name: "Flexing",
    emoji: "💪",
    blurb: "Boosted and loving it. Tell your friends.",
    when: "Someone hyped it and its harvest just grew.",
    lines: ["Bigger harvest than last time. Look at me.", "Boosted and up only. Flexing hard.", "Check the chart. Then check me."],
    bg: "bg-amber-400/20",
    ring: "ring-amber-400/60",
    text: "text-amber-700 dark:text-amber-300",
    hex: "#fbbf24",
  },
  {
    id: 4,
    name: "Tired",
    emoji: "😴",
    blurb: "Nobody has harvested or hyped it in a while.",
    when: "Three days pass without any attention.",
    lines: ["Nobody compounds me anymore...", "So sleepy. Someone hype me?", "Gathering dust. Wake me with a compound."],
    bg: "bg-slate-400/20",
    ring: "ring-slate-400/60",
    text: "text-slate-700 dark:text-slate-300",
    hex: "#94a3b8",
  },
] as const;

export const BOOSTED_LINES = ["Hype received. Pot is fueling the grind.", "Boosted. Every harvest hits harder now.", "The crowd believes. Multiplier engaged."] as const;

export function moodOf(id: number | undefined): MoodInfo | undefined {
  if (id === undefined) return undefined;
  return MOODS[id];
}

/** Chog vibe traits, in on-chain order. */
export const VIBES = ["Calm", "Cocky", "Wild", "Flashy", "Sleepy"] as const;
export const vibeName = (v: number) => VIBES[v] ?? "Mystery";

export const BACKGROUNDS = ["Lavender", "Mint", "Sunset", "Ocean", "Midnight"] as const;
export const BODIES = ["Monad Purple", "Bubblegum", "Teal", "Gold", "Shadow"] as const;
export const EYES = ["Dot", "Big", "Glow", "Shades", "Button"] as const;

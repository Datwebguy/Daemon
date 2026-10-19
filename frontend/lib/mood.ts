/** Mirrors IDaemonAccount.Mood (uint8). */
export type MoodInfo = {
  id: number;
  name: string;
  emoji: string;
  face: string;
  blurb: string;
  /** Tailwind classes for the colored blob / chips. */
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
    face: "(˘ᵕ˘)",
    blurb: "Vibing. Yield is steady, nothing to prove.",
    bg: "bg-teal-400/20",
    ring: "ring-teal-400/60",
    text: "text-teal-600 dark:text-teal-300",
    hex: "#2dd4bf",
  },
  {
    id: 1,
    name: "Smug",
    emoji: "😏",
    face: "(¬‿¬)",
    blurb: "Knows it's doing better than your savings account.",
    bg: "bg-violet-500/20",
    ring: "ring-violet-500/60",
    text: "text-violet-600 dark:text-violet-300",
    hex: "#8b5cf6",
  },
  {
    id: 2,
    name: "Chaotic",
    emoji: "🤪",
    face: "(⊙▽⊙)",
    blurb: "Degen energy. Numbers go up, down, sideways.",
    bg: "bg-orange-400/20",
    ring: "ring-orange-400/60",
    text: "text-orange-600 dark:text-orange-300",
    hex: "#fb923c",
  },
  {
    id: 3,
    name: "Flexing",
    emoji: "💪",
    face: "ᕦ(ò_óˇ)ᕤ",
    blurb: "Boosted and loving it. Tell your friends.",
    bg: "bg-amber-400/20",
    ring: "ring-amber-400/60",
    text: "text-amber-600 dark:text-amber-300",
    hex: "#fbbf24",
  },
  {
    id: 4,
    name: "Tired",
    emoji: "😴",
    face: "(－_－) zzZ",
    blurb: "Nobody compounded or hyped it in a while.",
    bg: "bg-slate-400/20",
    ring: "ring-slate-400/60",
    text: "text-slate-600 dark:text-slate-300",
    hex: "#94a3b8",
  },
] as const;

export function moodOf(id: number | undefined): MoodInfo | undefined {
  if (id === undefined) return undefined;
  return MOODS[id];
}

/** IChogTraits vibe: 0 Calm, 1 Cocky, 2 Wild, 3 Flashy, 4 Sleepy */
export const VIBES = ["Calm", "Cocky", "Wild", "Flashy", "Sleepy"] as const;
export const vibeName = (v: number) => VIBES[v] ?? `#${v}`;

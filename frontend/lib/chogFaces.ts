/**
 * Real Chog Genesis artwork chosen for how each mood looks. Picked by reading the collection's own
 * traits (eyes, mouth, head) and checking the art: laser eyes for Chaotic, a gold tooth for Flexing,
 * a sleepy or sad face for Tired, and so on. The expressions come from the Chogs themselves.
 */
export const MOOD_FACES: readonly (readonly number[])[] = [
  /* 0 Chill   */ [1680, 700],
  /* 1 Smug    */ [1239, 855, 1607, 1842],
  /* 2 Chaotic */ [1237, 1552, 1241, 1400],
  /* 3 Flexing */ [148, 1604],
  /* 4 Tired   */ [1397, 1403, 1963, 1147],
];

/** Shown while a Daemon has not been woken up yet. */
export const ASLEEP_FACES: readonly number[] = [1397, 1403];

const IMAGE_CID = "bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e";
const GATEWAYS = ["https://ipfs.filebase.io/ipfs", "https://gateway.pinata.cloud/ipfs"];

export const artUrls = (artId: number): string[] => GATEWAYS.map((g) => `${g}/${IMAGE_CID}/${artId}.webp`);

/** Resized, cached copy through the site's image optimizer (about 40KB instead of 290KB). */
export const optimizedUrl = (url: string, width = 640): string => `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=72`;

/** Fast-first list: the optimized copy, then the raw gateways as backups. */
export const artSources = (artId: number, width = 640): string[] => {
  const raw = artUrls(artId);
  return [optimizedUrl(raw[0]!, width), ...raw];
};

/** Pick a face for a mood; `seed` makes the choice stable (e.g. a token id) or rotating (a counter). */
export function faceFor(mood: number | undefined, seed = 0): number {
  const list = mood === undefined ? ASLEEP_FACES : (MOOD_FACES[mood] ?? MOOD_FACES[0]!);
  return list[Math.abs(Math.floor(seed)) % list.length]!;
}

/** One face per mood, for warming the cache while a visitor is on the page. */
export const WARM_FACES: readonly number[] = [...MOOD_FACES.map((l) => l[0]!), ASLEEP_FACES[0]!];

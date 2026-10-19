/**
 * Helpers for content-addressed art and trait files.
 * Public gateways are tried in order; ipfs.io and dweb.link no longer serve plain content.
 */
const GATEWAYS = ["https://ipfs.filebase.io/ipfs/", "https://gateway.pinata.cloud/ipfs/"] as const;
const TIMEOUT_MS = 12_000;

export function isIpfsUri(uri: string | undefined): uri is string {
  return Boolean(uri && uri.trim().startsWith("ipfs://"));
}

/** `ipfs://CID/path` -> ordered list of https URLs (one per gateway). Plain https URLs pass through. */
export function ipfsUrls(uri: string | undefined): string[] {
  if (!uri) return [];
  const v = uri.trim();
  if (v.startsWith("ipfs://")) {
    const path = v.slice("ipfs://".length).replace(/^ipfs\//, "");
    return GATEWAYS.map((g) => g + path);
  }
  if (v.startsWith("https://") || v.startsWith("http://") || v.startsWith("data:")) return [v];
  return [];
}

const jsonCache = new Map<string, Promise<unknown>>();

async function fetchWithTimeout(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches JSON, falling back across gateways. Results are cached in memory (the files never change). */
export function fetchIpfsJson<T>(uri: string): Promise<T> {
  const hit = jsonCache.get(uri);
  if (hit) return hit as Promise<T>;
  const p = (async () => {
    let last: unknown;
    for (const url of ipfsUrls(uri)) {
      try {
        return (await fetchWithTimeout(url)) as T;
      } catch (e) {
        last = e;
      }
    }
    throw last ?? new Error("Could not load");
  })();
  jsonCache.set(uri, p);
  // Do not cache failures: allow a retry later.
  p.catch(() => jsonCache.delete(uri));
  return p;
}

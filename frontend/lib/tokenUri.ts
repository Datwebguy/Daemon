export type TokenMetadata = {
  name?: string;
  description?: string;
  image?: string;
  attributes?: { trait_type?: string; value?: string | number }[];
};

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeImage(img: string | undefined): string | undefined {
  if (!img) return undefined;
  const v = img.trim();
  if (v.startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(v)}`;
  if (v.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${v.slice(7)}`;
  return v;
}

/** Parses an on-chain tokenURI (data:application/json;base64,…, utf8 JSON, or a bare SVG). */
export function parseTokenUri(uri: string | undefined): TokenMetadata | undefined {
  if (!uri) return undefined;
  try {
    let json: string | undefined;
    if (uri.startsWith("data:application/json;base64,")) {
      json = decodeBase64Utf8(uri.slice("data:application/json;base64,".length));
    } else if (uri.startsWith("data:application/json")) {
      const comma = uri.indexOf(",");
      json = decodeURIComponent(uri.slice(comma + 1));
    } else if (uri.trim().startsWith("{")) {
      json = uri;
    } else if (uri.startsWith("data:image/") || uri.trim().startsWith("<svg")) {
      return { image: normalizeImage(uri) };
    }
    if (!json) return undefined;
    const meta = JSON.parse(json) as TokenMetadata & { image_data?: string };
    return { ...meta, image: normalizeImage(meta.image ?? meta.image_data) };
  } catch {
    return undefined;
  }
}

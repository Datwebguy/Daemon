import { formatUnits, parseUnits } from "viem";

export function shortAddr(a?: string, n = 4): string {
  if (!a) return "";
  return `${a.slice(0, 2 + n)}…${a.slice(-n)}`;
}

/** Human amount with up to `maxFrac` fractional digits. */
export function fmtUnits(value: bigint | undefined, decimals = 18, maxFrac = 4): string {
  if (value === undefined) return "–";
  const s = formatUnits(value, decimals);
  const [i = "0", f = ""] = s.split(".");
  const intPart = BigInt(i).toLocaleString("en-US");
  const frac = f.slice(0, maxFrac).replace(/0+$/, "");
  if (!frac && value > BigInt(0) && i === "0") return `<0.${"0".repeat(Math.max(0, maxFrac - 1))}1`;
  return frac ? `${intPart}.${frac}` : intPart;
}

/** Number of fractional digits typed (0 if none). */
export function fractionDigits(value: string): number {
  const v = value.trim();
  const dot = v.indexOf(".");
  return dot === -1 ? 0 : v.length - dot - 1;
}

/**
 * Parses a human amount. Returns undefined for invalid input, including input with more
 * fractional digits than the token supports (never silently rounds).
 */
export function safeParseUnits(value: string, decimals: number): bigint | undefined {
  const v = value.trim();
  if (!v || !/^\d*\.?\d*$/.test(v) || v === ".") return undefined;
  if (fractionDigits(v) > decimals) return undefined;
  try {
    return parseUnits(v, decimals);
  } catch {
    return undefined;
  }
}

export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

export function fmtAgo(unixSeconds: number, now: number): string {
  if (!unixSeconds) return "never";
  const d = now - unixSeconds;
  if (d < 60) return "just now";
  return `${fmtDuration(d)} ago`;
}

export function errorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "object") {
    const e = err as { shortMessage?: string; message?: string; details?: string };
    return e.shortMessage ?? e.details ?? e.message ?? String(err);
  }
  return String(err);
}

/** Parses an integer string from untrusted data (indexer rows). Never throws. */
export function toBigIntSafe(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? BigInt(value) : undefined;
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!/^-?\d{1,80}$/.test(v)) return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

const DECODE_ERROR_NAMES = new Set([
  "AbiDecodingZeroDataError",
  "AbiDecodingDataSizeTooSmallError",
  "AbiDecodingDataSizeInvalidError",
  "AbiDecodingOffsetOutOfBoundsError",
  "ContractFunctionZeroDataError",
  "AbiFunctionNotFoundError",
  "AbiFunctionOutputsNotFoundError",
  "InvalidAbiDecodingTypeError",
  "PositionOutOfBoundsError",
  "SliceOffsetOutOfBoundsError",
]);

/**
 * True when a read failed because the returned data couldn't be decoded with our ABI
 * (wrong address / ABI mismatch), as opposed to a transient RPC / network error.
 */
export function isDecodeError(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e && typeof e === "object" && depth < 8; depth++) {
    const o = e as { name?: string; cause?: unknown; shortMessage?: string; message?: string };
    if (o.name && DECODE_ERROR_NAMES.has(o.name)) return true;
    const msg = `${o.shortMessage ?? ""} ${o.message ?? ""}`;
    if (/returned no data \("0x"\)|Cannot decode zero data|decod(e|ing) .*(data|abi)/i.test(msg)) return true;
    e = o.cause;
  }
  return false;
}

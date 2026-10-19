import type { Logger } from "./logger.js";
import { errorInfo } from "./logger.js";

/*
 * This is the ONLY retry layer for reads. The viem HTTP transport is created with retryCount: 0
 * (see index.ts), so attempts are not multiplied (transport retries x withRetry retries).
 */

export interface RetryOptions {
  retries: number; // additional attempts after the first
  baseDelayMs: number;
  maxDelayMs: number;
  label: string;
  logger?: Logger;
  signal?: AbortSignal;
  /** Return false to stop retrying (e.g. deterministic contract revert). */
  shouldRetry?: (err: unknown) => boolean;
  /** Minimum base delay used when the provider rate-limits us (HTTP 429). Default 2000 ms. */
  rateLimitDelayMs?: number;
  /** Injectable for tests. */
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Exponential backoff with full jitter. */
export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, rand = Math.random): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(rand() * exp);
}

/**
 * Delay after a rate-limit response: no jitter below the floor, so we really slow down.
 * floor = rateLimitDelayMs * 2^attempt, capped at 4 x maxDelayMs (rate limits usually last longer than a blip).
 */
export function rateLimitDelay(attempt: number, rateLimitDelayMs: number, maxDelayMs: number, rand = Math.random): number {
  const cap = Math.max(maxDelayMs * 4, rateLimitDelayMs * 16);
  const floor = Math.min(cap, rateLimitDelayMs * 2 ** attempt);
  return Math.min(cap, floor + Math.floor(rand() * floor * 0.25));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const doSleep = opts.sleepFn ?? sleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    if (opts.signal?.aborted) throw new Error(`${opts.label}: aborted`);
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (opts.shouldRetry && !opts.shouldRetry(err)) throw err;
      if (attempt === opts.retries) break;
      const limited = isRateLimited(err);
      const delay = limited
        ? rateLimitDelay(attempt, opts.rateLimitDelayMs ?? 2_000, opts.maxDelayMs)
        : backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      opts.logger?.warn(limited ? "rate limited, backing off" : "retrying", {
        op: opts.label,
        attempt: attempt + 1,
        delayMs: delay,
        ...errorInfo(err),
      });
      await doSleep(delay, opts.signal);
    }
  }
  throw lastErr;
}

/** Sleep that resolves early (without throwing) when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

function* causeChain(err: unknown): Generator<Record<string, unknown>> {
  let e: unknown = err;
  for (let i = 0; i < 8 && e && typeof e === "object"; i++) {
    yield e as Record<string, unknown>;
    e = (e as { cause?: unknown }).cause;
  }
}

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

/** True for errors caused by contract execution (revert): retrying will not help. */
export function isRevert(err: unknown): boolean {
  for (const e of causeChain(err)) {
    const name = lower(e.name);
    if (name === "contractfunctionrevertederror" || name === "executionrevertederror") return true;
    if (lower(e.message).includes("execution reverted")) return true;
  }
  return false;
}

/** True when the call ran out of gas at the top level (deterministic for a given gas limit: do not retry). */
export function isOutOfGas(err: unknown): boolean {
  for (const e of causeChain(err)) {
    const msg = lower(e.message) + " " + lower(e.details);
    if (msg.includes("out of gas") || msg.includes("gas required exceeds") || msg.includes("intrinsic gas too low")) return true;
  }
  return false;
}

/** True for HTTP 429 / provider rate-limit errors (viem HttpRequestError.status, JSON-RPC -32005, message text). */
export function isRateLimited(err: unknown): boolean {
  for (const e of causeChain(err)) {
    if (e.status === 429 || e.code === 429 || e.code === -32005) return true;
    const msg = lower(e.message) + " " + lower(e.details) + " " + lower(e.shortMessage);
    if (msg.includes("429") || msg.includes("too many requests") || msg.includes("rate limit")) return true;
  }
  return false;
}

/**
 * True for nonce errors where resyncing the nonce and re-signing is the right fix: nonce too low / too high.
 * Deliberately NOT included:
 *  - "already known": the exact tx we signed is already in the mempool; resending would at best be a no-op and at
 *    worst (after a nonce resync) a second, competing tx. See isAlreadyKnown.
 *  - "replacement transaction underpriced": a tx with this nonce is pending; re-signing at the same fee cannot help
 *    and re-signing with a fresh nonce would double-send.
 */
export function isNonceError(err: unknown): boolean {
  for (const e of causeChain(err)) {
    const name = (e.name as string | undefined) ?? "";
    if (name === "NonceTooLowError" || name === "NonceTooHighError" || name === "NonceMaxValueError") return true;
    const msg = lower(e.message);
    if (msg.includes("nonce too low") || msg.includes("nonce too high")) return true;
  }
  return false;
}

/** The node already has this exact transaction (same hash) in its pool. */
export function isAlreadyKnown(err: unknown): boolean {
  for (const e of causeChain(err)) {
    const msg = lower(e.message) + " " + lower(e.details);
    if (msg.includes("already known") || msg.includes("known transaction") || msg.includes("already imported")) return true;
  }
  return false;
}

/** True when the error is a receipt wait timeout (viem WaitForTransactionReceiptTimeoutError). */
export function isReceiptTimeout(err: unknown): boolean {
  for (const e of causeChain(err)) {
    const name = (e.name as string | undefined) ?? "";
    if (name === "WaitForTransactionReceiptTimeoutError") return true;
    if (lower(e.message).includes("timed out while waiting for transaction")) return true;
  }
  return false;
}

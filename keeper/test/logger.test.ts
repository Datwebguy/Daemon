import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logger.js";
import { backoffDelay, isAlreadyKnown, isNonceError, isRateLimited, isRevert, withRetry } from "../src/retry.js";

describe("logger", () => {
  it("writes JSON lines, serialises bigint, redacts secret-looking fields", () => {
    const lines: string[] = [];
    const log = createLogger("info", { svc: "t" }, (l) => lines.push(l));
    log.debug("hidden");
    log.info("hello", { amount: 10n ** 20n, privateKey: "0xabc", KEEPER_PRIVATE_KEY: "0xdef" });
    expect(lines).toHaveLength(1);
    const e = JSON.parse(lines[0]);
    expect(e).toMatchObject({ level: "info", msg: "hello", svc: "t", amount: "100000000000000000000" });
    expect(e.privateKey).toBe("[redacted]");
    expect(e.KEEPER_PRIVATE_KEY).toBe("[redacted]");
    expect(lines[0]).not.toContain("0xabc");
  });
});

describe("retry helpers", () => {
  it("backoff is bounded", () => {
    expect(backoffDelay(10, 500, 8000, () => 0.999)).toBeLessThan(8000);
    expect(backoffDelay(0, 500, 8000, () => 0.5)).toBe(250);
  });
  it("classifies reverts and nonce errors through cause chains", () => {
    const inner = Object.assign(new Error("execution reverted: Cooldown"), { name: "ExecutionRevertedError" });
    expect(isRevert(Object.assign(new Error("wrapper"), { cause: inner }))).toBe(true);
    expect(isRevert(new Error("fetch failed"))).toBe(false);
    expect(isNonceError(Object.assign(new Error("x"), { cause: new Error("nonce too low: next nonce 5") }))).toBe(true);
    expect(isNonceError(new Error("insufficient funds"))).toBe(false);
  });

  it("already known / underpriced are not nonce errors that trigger a resend", () => {
    expect(isNonceError(new Error("already known"))).toBe(false);
    expect(isNonceError(new Error("replacement transaction underpriced"))).toBe(false);
    expect(isAlreadyKnown(new Error("already known"))).toBe(true);
    expect(isAlreadyKnown(new Error("nonce too low"))).toBe(false);
  });

  it("backs off hard on HTTP 429", async () => {
    const delays: number[] = [];
    let n = 0;
    const out = await withRetry(
      async () => {
        if (++n < 3) throw Object.assign(new Error("HTTP request failed"), { status: 429 });
        return "ok";
      },
      { retries: 3, baseDelayMs: 10, maxDelayMs: 100, label: "t", sleepFn: async (ms) => void delays.push(ms) },
    );
    expect(out).toBe("ok");
    expect(n).toBe(3);
    expect(isRateLimited(Object.assign(new Error("x"), { cause: { status: 429 } }))).toBe(true);
    expect(isRateLimited(new Error("boom"))).toBe(false);
    expect(delays[0]).toBeGreaterThanOrEqual(2000);
    expect(delays[1]).toBeGreaterThanOrEqual(4000);
  });
});

import { describe, expect, it } from "vitest";
import { evaluateProfit, gasLimitFromEstimate, weiToAsset, worstCaseCostWei } from "../src/profitability.js";

const GWEI = 10n ** 9n;
const E18 = 10n ** 18n;

describe("gasLimitFromEstimate", () => {
  it("adds the margin and rounds up", () => {
    expect(gasLimitFromEstimate(100_000n, 1000, 30_000_000n)).toBe(110_000n);
    expect(gasLimitFromEstimate(100_001n, 1000, 30_000_000n)).toBe(110_002n); // 110001.1 -> ceil
    expect(gasLimitFromEstimate(21_000n, 0, 30_000_000n)).toBe(21_000n);
  });
  it("returns undefined above the cap", () => {
    expect(gasLimitFromEstimate(9_500_000n, 1000, 10_000_000n)).toBeUndefined();
  });
  it("rejects non-positive estimates", () => {
    expect(() => gasLimitFromEstimate(0n, 1000, 1n)).toThrow();
  });
});

describe("cost conversion", () => {
  it("prices worst-case cost as gas LIMIT x maxFeePerGas", () => {
    expect(worstCaseCostWei(200_000n, 100n * GWEI)).toBe(200_000n * 100n * GWEI);
  });
  it("converts wei to asset units, rounding up", () => {
    // 1 MON = 2 asset (18 dp): 0.02 MON -> 0.04 asset
    expect(weiToAsset(2n * 10n ** 16n, 2n * E18)).toBe(4n * 10n ** 16n);
    expect(weiToAsset(1n, 1n)).toBe(1n); // rounds up, never 0 for a non-zero cost
    expect(weiToAsset(0n, E18)).toBe(0n);
  });
});

describe("evaluateProfit", () => {
  // 200k gas at 100 gwei = 0.02 MON; 1 MON = 1 asset -> cost 0.02; 10% margin -> need 0.022
  const base = { gasLimit: 200_000n, maxFeePerGas: 100n * GWEI, monPriceInAsset: E18, minProfitMarginBps: 1000 };
  const cost = 2n * 10n ** 16n;

  it("sends when the bounty exceeds cost + margin", () => {
    const d = evaluateProfit({ ...base, bounty: 3n * 10n ** 16n });
    expect(d.profitable).toBe(true);
    expect(d.costAsset).toBe(cost);
    expect(d.requiredBounty).toBe(22n * 10n ** 15n);
    expect(d.netAsset).toBe(10n ** 16n);
  });
  it("a bounty exactly at the required amount is profitable", () => {
    expect(evaluateProfit({ ...base, bounty: 22n * 10n ** 15n }).profitable).toBe(true);
  });
  it("skips when the bounty covers cost but not the margin", () => {
    const d = evaluateProfit({ ...base, bounty: 21n * 10n ** 15n });
    expect(d.profitable).toBe(false);
    expect(d.netAsset).toBe(10n ** 15n);
  });
  it("requires bounty strictly greater than cost even with zero margin", () => {
    expect(evaluateProfit({ ...base, minProfitMarginBps: 0, bounty: cost }).profitable).toBe(false);
    expect(evaluateProfit({ ...base, minProfitMarginBps: 0, bounty: cost + 1n }).profitable).toBe(true);
  });
  it("skips a zero bounty", () => {
    const d = evaluateProfit({ ...base, bounty: 0n });
    expect(d.profitable).toBe(false);
    expect(d.reason).toBe("zero bounty");
  });
  it("a looser gas limit makes the same bounty unprofitable (Monad charges the limit)", () => {
    const bounty = 3n * 10n ** 16n;
    expect(evaluateProfit({ ...base, bounty }).profitable).toBe(true);
    expect(evaluateProfit({ ...base, bounty, gasLimit: 400_000n }).profitable).toBe(false);
  });
  it("handles 6-decimal assets", () => {
    // 1 MON = 0.5 USDC (6 dp) -> price 500000; 0.02 MON = 0.01 USDC = 10000 units
    const d = evaluateProfit({ ...base, monPriceInAsset: 500_000n, bounty: 11_000n });
    expect(d.costAsset).toBe(10_000n);
    expect(d.profitable).toBe(true);
  });
});

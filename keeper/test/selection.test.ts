import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { chunk, selectBatches, shrinkBatch, sumBounties } from "../src/selection.js";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;

describe("selectBatches", () => {
  const items = [
    { account: a(1), bounty: 5n },
    { account: a(2), bounty: 0n },
    { account: a(3), bounty: 50n },
    { account: a(4), bounty: 9n },
    { account: a(5), bounty: 50n },
    { account: a(6), bounty: 10n },
  ];

  it("drops zero and sub-minimum bounties, sorts descending, ties by address", () => {
    const b = selectBatches(items, { minBounty: 9n, batchSize: 10 });
    expect(b).toHaveLength(1);
    expect(b[0].map((x) => x.account)).toEqual([a(3), a(5), a(6), a(4)]);
  });

  it("minBounty is inclusive", () => {
    const b = selectBatches(items, { minBounty: 10n, batchSize: 10 });
    expect(b[0].map((x) => x.bounty)).toEqual([50n, 50n, 10n]);
  });

  it("splits into batches of batchSize, best first", () => {
    const b = selectBatches(items, { minBounty: 1n, batchSize: 2 });
    expect(b.map((x) => x.length)).toEqual([2, 2, 1]);
    expect(b[0][0].bounty).toBe(50n);
    expect(b[2][0].bounty).toBe(5n);
  });

  it("never selects a zero bounty, even with minBounty 0", () => {
    const b = selectBatches(items, { minBounty: 0n, batchSize: 100 });
    expect(b[0].some((x) => x.bounty === 0n)).toBe(false);
  });

  it("excludes accounts case-insensitively and de-duplicates (first occurrence wins)", () => {
    const upper = ("0x" + a(3).slice(2).toUpperCase()) as Address;
    const dup = [...items, { account: upper, bounty: 999n }];
    const b = selectBatches(dup, { minBounty: 1n, batchSize: 100, exclude: new Set([a(5).toLowerCase()]) });
    const accts = b[0].map((x) => x.account.toLowerCase());
    expect(accts).not.toContain(a(5));
    expect(accts.filter((x) => x === a(3))).toHaveLength(1);
    expect(b[0][0].bounty).toBe(50n);
  });

  it("returns nothing when nothing qualifies", () => {
    expect(selectBatches(items, { minBounty: 1000n, batchSize: 5 })).toEqual([]);
    expect(selectBatches([], { minBounty: 0n, batchSize: 5 })).toEqual([]);
  });

  it("rejects batchSize < 1", () => {
    expect(() => selectBatches(items, { minBounty: 0n, batchSize: 0 })).toThrow();
  });
});

describe("helpers", () => {
  it("shrinkBatch keeps the top half and empties at one", () => {
    const b = [5n, 4n, 3n, 2n, 1n].map((x, i) => ({ account: a(i), bounty: x }));
    expect(shrinkBatch(b).map((x) => x.bounty)).toEqual([5n, 4n, 3n]);
    expect(shrinkBatch(b.slice(0, 2))).toHaveLength(1);
    expect(shrinkBatch(b.slice(0, 1))).toEqual([]);
  });

  it("sumBounties and chunk", () => {
    expect(sumBounties([{ account: a(1), bounty: 2n }, { account: a(2), bounty: 3n }])).toBe(5n);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

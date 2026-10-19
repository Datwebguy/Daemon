import { describe, expect, it } from "vitest";
import {
  ZERO_ADDRESS,
  ZERO_SALT,
  applyAllocation,
  applyChogTransfer,
  applyCompounded,
  applyHype,
  applyKeeperCompound,
  emptyStats,
  keeperIdOf,
  statsAfterCompound,
  statsAfterUpdate,
  applySweep,
  applyUpdate,
  eventId,
  isDaemonAccount,
  moodName,
  newDaemon,
  readFilterConfig,
} from "../src/lib/logic.js";

const IMPL = "0x1111111111111111111111111111111111111111";
const CHOG = "0x2222222222222222222222222222222222222222";

describe("readFilterConfig", () => {
  it("requires the implementation", () => {
    expect(() => readFilterConfig({})).toThrow(/ENVIO_DAEMON_IMPLEMENTATION/);
    expect(() => readFilterConfig({ ENVIO_DAEMON_IMPLEMENTATION: "0x123" })).toThrow();
  });
  it("lowercases and defaults the salt", () => {
    const c = readFilterConfig({ ENVIO_DAEMON_IMPLEMENTATION: IMPL.toUpperCase().replace("0X", "0x"), ENVIO_MOCK_CHOG: CHOG });
    expect(c).toEqual({ implementation: IMPL, tokenContract: CHOG, salt: ZERO_SALT, chainId: 10143 });
  });
});

describe("isDaemonAccount", () => {
  const cfg = readFilterConfig({ ENVIO_DAEMON_IMPLEMENTATION: IMPL, ENVIO_MOCK_CHOG: CHOG });
  const base = { account: "0xabc", implementation: IMPL, salt: ZERO_SALT, chainId: 10143n, tokenContract: CHOG, tokenId: 1n };
  it("accepts our accounts", () => expect(isDaemonAccount(base, cfg)).toBe(true));
  it("rejects other implementations, collections, salts, chains", () => {
    expect(isDaemonAccount({ ...base, implementation: CHOG }, cfg)).toBe(false);
    expect(isDaemonAccount({ ...base, tokenContract: IMPL }, cfg)).toBe(false);
    expect(isDaemonAccount({ ...base, salt: "0x" + "01".padStart(64, "0") }, cfg)).toBe(false);
    expect(isDaemonAccount({ ...base, chainId: 1n }, cfg)).toBe(false);
  });
  it("any collection when ENVIO_MOCK_CHOG unset", () => {
    const any = readFilterConfig({ ENVIO_DAEMON_IMPLEMENTATION: IMPL });
    expect(isDaemonAccount({ ...base, tokenContract: IMPL }, any)).toBe(true);
  });
});

describe("aggregates", () => {
  it("compounds accumulate GROSS harvest and bounties, not lifetimeYield", () => {
    let d = newDaemon({ id: "0xd", tokenId: 7n });
    d = applyCompounded(d, 100n, 5n, 10, 1000);
    d = applyCompounded(d, 50n, 3n, 20, 2000);
    expect(d.grossHarvest).toBe(150n);
    expect(d.totalBounties).toBe(8n);
    expect(d.lifetimeYield).toBe(0n); // net yield only moves with DaemonUpdate.yieldAmount
    expect(d.compoundCount).toBe(2);
    expect(d.lastCompoundAt).toBe(2000);
    expect(d.lastCompoundBlock).toBe(20);
  });
  it("updates set mood and message", () => {
    const d = applyUpdate(newDaemon({ id: "0xd", tokenId: 1n }), 3, "gm", 9n, 77);
    expect(d).toMatchObject({ lastMood: 3, lastMoodName: "Flexing", lastMessage: "gm", lifetimeYield: 9n, updateCount: 1, lastUpdateAt: 77 });
  });
  it("hype splits MON and token totals", () => {
    let d = newDaemon({ id: "0xd", tokenId: 1n });
    d = applyHype(d, "0x0000000000000000000000000000000000000000", 10n);
    d = applyHype(d, CHOG, 4n);
    expect(d).toMatchObject({ hypeCount: 2, totalHypeMon: 10n, totalHypeToken: 4n });
  });
  it("allocation never goes negative; sweep resets it", () => {
    let d = applyAllocation(newDaemon({ id: "0xd", tokenId: 1n }), "ALLOCATE", 100n);
    d = applyAllocation(d, "DEALLOCATE", 150n);
    expect(d.allocatedAssets).toBe(0n);
    d = applySweep(applyAllocation(d, "ALLOCATE", 5n), "0xowner", 99);
    expect(d).toMatchObject({ allocatedAssets: 0n, sweptCount: 1, lastSweptAt: 99, lastSweptTo: "0xowner" });
  });
  it("helpers", () => {
    expect(moodName(4)).toBe("Tired");
    expect(moodName(9)).toBe("Unknown(9)");
    expect(eventId(10143, 5, 2)).toBe("10143_5_2");
  });
});

describe("yield semantics (match DaemonAccount.lifetimeYield)", () => {
  it("lifetimeYield is the sum of DaemonUpdate.yieldAmount = sum of profit + boostTopUp - bounty", () => {
    // compound 1: profit 100, topUp 10, bounty 5 -> net 105 ; compound 2: profit 50, topUp 0, bounty 3 -> net 47
    let d = newDaemon({ id: "0xd", tokenId: 1n });
    d = applyCompounded(d, 100n, 5n, 1, 10);
    d = applyUpdate(d, 0, "gm", 105n, 10);
    d = applyCompounded(d, 50n, 3n, 2, 20);
    d = applyUpdate(d, 1, "gm2", 47n, 20);
    d = applyUpdate(d, 2, "hyped", 0n, 30); // hype: yieldAmount 0
    expect(d.lifetimeYield).toBe(152n);
    expect(d.grossHarvest).toBe(150n);
    expect(d.totalBounties).toBe(8n);
    // net differs from gross - bounties because of the boost top-up (10): the contract value is authoritative
    expect(d.lifetimeYield).not.toBe(d.grossHarvest - d.totalBounties);
    expect(d.updateCount).toBe(3);
  });

  it("platform stats keep net yield, gross harvest and bounties separate", () => {
    let s = emptyStats();
    s = statsAfterCompound(s, 100n, 5n, true);
    s = statsAfterUpdate(s, 105n);
    s = statsAfterCompound(s, 50n, 3n, false);
    s = statsAfterUpdate(s, 47n);
    expect(s).toMatchObject({ totalYield: 152n, totalGrossHarvest: 150n, totalBounties: 8n, compoundCount: 2, keeperCount: 1 });
  });
});

describe("keeper attribution (Compounded.caller = bounty recipient)", () => {
  const KEEPER = "0xAbCdEf0000000000000000000000000000000001";
  it("keys by the lowercased caller field", () => {
    expect(keeperIdOf(KEEPER)).toBe(KEEPER.toLowerCase());
  });
  it("credits the bounty recipient even when the tx came from elsewhere (hub batch)", () => {
    // Two accounts compounded in one hub tx: both events carry caller = keeper, so one Keeper gets both.
    let k = applyKeeperCompound(undefined, KEEPER, 100n, 5n, 1000);
    k = applyKeeperCompound(k, KEEPER, 40n, 2n, 1000);
    expect(k).toEqual({
      id: KEEPER.toLowerCase(),
      totalBounties: 7n,
      compounds: 2,
      totalProfitCompounded: 140n, // gross
      firstCompoundAt: 1000,
      lastCompoundAt: 1000,
    });
  });
  it("keeps firstCompoundAt and advances lastCompoundAt", () => {
    const k1 = applyKeeperCompound(undefined, KEEPER, 1n, 1n, 100);
    const k2 = applyKeeperCompound(k1, KEEPER, 1n, 1n, 200);
    expect(k2.firstCompoundAt).toBe(100);
    expect(k2.lastCompoundAt).toBe(200);
  });
  it("a different recipient is a different keeper", () => {
    const other = "0x00000000000000000000000000000000000000bb";
    expect(applyKeeperCompound(undefined, other, 1n, 1n, 1).id).not.toBe(keeperIdOf(KEEPER));
  });
});

describe("applyChogTransfer", () => {
  const ALICE = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
  const BOB = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
  it("the first transfer is the mint and records who holds it, lowercase", () => {
    const c = applyChogTransfer(undefined, ALICE, 7n, 100, 1_700_000_000);
    expect(c).toEqual({ id: "7", tokenId: 7n, owner: ALICE.toLowerCase(), mintedAtBlock: 100, mintedAtTimestamp: 1_700_000_000, transferCount: 1 });
  });
  it("later transfers change only the owner and the count", () => {
    const minted = applyChogTransfer(undefined, ALICE, 7n, 100, 1_700_000_000);
    const sold = applyChogTransfer(minted, BOB, 7n, 250, 1_700_000_500);
    expect(sold.owner).toBe(BOB.toLowerCase());
    expect(sold.mintedAtBlock).toBe(100);
    expect(sold.mintedAtTimestamp).toBe(1_700_000_000);
    expect(sold.transferCount).toBe(2);
  });
  it("a transfer to the zero address marks the Chog burned", () => {
    const burned = applyChogTransfer(applyChogTransfer(undefined, ALICE, 1n, 1, 1), ZERO_ADDRESS, 1n, 2, 2);
    expect(burned.owner).toBe(ZERO_ADDRESS);
  });
});

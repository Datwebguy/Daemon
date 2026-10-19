import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig, redactedConfig, resolveDiscoveryMode } from "../src/config.js";

const PK = "0x" + "ab".repeat(32);
const base: Record<string, string> = {
  KEEPER_PRIVATE_KEY: PK,
  MOCK_CHOG: "0x2222222222222222222222222222222222222222",
  DAEMON_IMPLEMENTATION: "0x1111111111111111111111111111111111111111",
  MON_PRICE_IN_ASSET: "1.5",
};
const without = (k: string) => Object.fromEntries(Object.entries(base).filter(([key]) => key !== k));

describe("parseConfig", () => {
  it("applies defaults", () => {
    const c = parseConfig(base);
    expect(c.rpcUrl).toBe("https://testnet-rpc.monad.xyz");
    expect(c.chainId).toBe(10143);
    expect(c.registry).toBe("0x000000006551c19487814612e58FE06813775758");
    expect(c.monPriceInAsset).toBe(15n * 10n ** 17n);
    expect(c.minBounty).toBe(0n);
    expect(c.batchSize).toBe(20);
    expect(c.minTokenId).toBe(1n);
    expect(c.dryRun).toBe(false);
    expect(resolveDiscoveryMode(c)).toBe("registry");
  });

  it("parses MIN_BOUNTY in asset units", () => {
    expect(parseConfig({ ...base, MIN_BOUNTY: "0.01", ASSET_DECIMALS: "6" }).minBounty).toBe(10_000n);
  });

  it("requires a key unless dry-run", () => {
    expect(() => parseConfig(without("KEEPER_PRIVATE_KEY"))).toThrow(ConfigError);
    expect(parseConfig(without("KEEPER_PRIVATE_KEY"), ["--dry-run"]).dryRun).toBe(true);
    expect(parseConfig({ ...without("KEEPER_PRIVATE_KEY"), DRY_RUN: "true" }).dryRun).toBe(true);
  });

  it("never echoes a malformed key", () => {
    let msg = "";
    try {
      parseConfig({ ...base, KEEPER_PRIVATE_KEY: "0xdeadbeef" });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/malformed/);
    expect(msg).not.toContain("deadbeef");
  });

  it("requires a price source", () => {
    expect(() => parseConfig(without("MON_PRICE_IN_ASSET"))).toThrow(/MON_PRICE_IN_ASSET/);
    expect(() =>
      parseConfig({
        ...without("MON_PRICE_IN_ASSET"),
        PRICE_ORACLE: "0x3333333333333333333333333333333333333333",
        WMON: "0x4444444444444444444444444444444444444444",
        ASSET: "0x5555555555555555555555555555555555555555",
      }),
    ).not.toThrow();
  });

  it("picks discovery mode", () => {
    expect(resolveDiscoveryMode(parseConfig({ ...base, INDEXER_URL: "http://localhost:8080/v1/graphql" }))).toBe("indexer");
    expect(resolveDiscoveryMode(parseConfig(without("DAEMON_IMPLEMENTATION")))).toBe("chog");
    expect(() => parseConfig({ ...base, DISCOVERY_MODE: "indexer" })).toThrow(/INDEXER_URL/);
  });

  it("clamps BATCH_SIZE to the hub MAX_BATCH (50) with a warning", () => {
    const c = parseConfig({ ...base, BATCH_SIZE: "80" });
    expect(c.batchSize).toBe(50);
    expect(c.warnings.join(" ")).toMatch(/BATCH_SIZE/);
    expect(parseConfig({ ...base, BATCH_SIZE: "50" }).warnings).toEqual([]);
  });

  it("clamps MAX_GAS_LIMIT to the Monad per-tx limit", () => {
    expect(parseConfig({ ...base, MAX_GAS_LIMIT: "50000000" }).maxGasLimit).toBe(30_000_000n);
  });

  it("errors clearly when HUB_RECIPIENT_ARG is set", () => {
    expect(() => parseConfig({ ...base, HUB_RECIPIENT_ARG: "true", DAEMON_HUB: "0x9999999999999999999999999999999999999999" })).toThrow(/HUB_RECIPIENT_ARG/);
    expect(() => parseConfig({ ...base, HUB_RECIPIENT_ARG: "false" })).not.toThrow();
  });

  it("rejects bad addresses", () => {
    expect(() => parseConfig({ ...base, DAEMON_HUB: "0x1234" })).toThrow(/DAEMON_HUB/);
  });

  it("redactedConfig hides the key and URL paths", () => {
    const r = redactedConfig(parseConfig({ ...base, RPC_URL: "https://rpc.example.com/v2/SECRETKEY" }));
    const s = JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(s).not.toContain("ab".repeat(32));
    expect(s).not.toContain("SECRETKEY");
    expect(r.signerConfigured).toBe(true);
  });
});

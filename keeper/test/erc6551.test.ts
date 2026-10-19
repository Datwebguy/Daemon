import { describe, expect, it } from "vitest";
import { zeroHash } from "viem";
import { CANONICAL_ERC6551_REGISTRY, computeErc6551Account } from "../src/erc6551.js";

const p = {
  registry: CANONICAL_ERC6551_REGISTRY,
  implementation: "0x1111111111111111111111111111111111111111",
  salt: zeroHash,
  chainId: 10143n,
  tokenContract: "0x2222222222222222222222222222222222222222",
} as const;

describe("computeErc6551Account", () => {
  it("matches the canonical registry's account() on Monad testnet", () => {
    // Vector from registry.account(impl, 0x0, 10143, tokenContract, 7) via eth_call on chain 10143 (2026-10-18).
    expect(computeErc6551Account({ ...p, tokenId: 7n })).toBe("0xf666d922b7D35D533054b26F083Eda9478C5BCcd");
  });

  it("differs per token id and per salt", () => {
    const one = computeErc6551Account({ ...p, tokenId: 1n });
    expect(one).not.toBe(computeErc6551Account({ ...p, tokenId: 2n }));
    expect(one).not.toBe(computeErc6551Account({ ...p, tokenId: 1n, salt: `0x${"01".padStart(64, "0")}` }));
  });
});

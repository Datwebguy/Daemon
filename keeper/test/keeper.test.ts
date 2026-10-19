import { describe, expect, it, vi } from "vitest";
import {
  type Address,
  type Hex,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  parseUnits,
  zeroHash,
} from "viem";
import { daemonAccountAbi, daemonHubAbi } from "../src/abis.js";
import { type KeeperConfig, parseConfig } from "../src/config.js";
import { CANONICAL_ERC6551_REGISTRY, computeErc6551Account } from "../src/erc6551.js";
import { Keeper, SimulationDecodeError, cycleExitCode, isBatchTooLarge } from "../src/keeper.js";
import { silentLogger } from "../src/logger.js";
import { SendError, type ReadClient, type TxSender } from "../src/types.js";
import { tokenIdPages } from "../src/discovery.js";

const GWEI = 10n ** 9n;
const HUB: Address = "0x9999999999999999999999999999999999999999";
const CHOG: Address = "0x2222222222222222222222222222222222222222";
const IMPL: Address = "0x1111111111111111111111111111111111111111";
const KEEPER: Address = "0x00000000000000000000000000000000000000ee";
const u = (x: string) => parseUnits(x, 18);

const accountOf = (tokenId: bigint) =>
  computeErc6551Account({ registry: CANONICAL_ERC6551_REGISTRY, implementation: IMPL, salt: zeroHash, chainId: 10143, tokenContract: CHOG, tokenId });

function config(over: Record<string, string> = {}, argv: string[] = []): KeeperConfig {
  return parseConfig(
    {
      KEEPER_PRIVATE_KEY: "0x" + "11".repeat(32),
      MOCK_CHOG: CHOG,
      DAEMON_IMPLEMENTATION: IMPL,
      DAEMON_HUB: HUB,
      MAX_TOKEN_ID: "6",
      MON_PRICE_IN_ASSET: "1", // 1 MON = 1 asset
      GAS_LIMIT_MARGIN_BPS: "1000",
      MIN_PROFIT_MARGIN_BPS: "1000",
      BATCH_SIZE: "10",
      ...over,
    },
    argv,
  );
}

const revertError = () => Object.assign(new Error("execution reverted: CooldownActive"), { name: "CallExecutionError" });
const batchTooLargeError = () => Object.assign(new Error("execution reverted: BatchTooLarge(60, 50)"), { name: "CallExecutionError" });

interface MockOpts {
  bounties: Map<string, bigint>; // account (lowercase) -> pendingBounty view; missing = no code
  /** Accounts whose compound() fails (hub: success=false inside a successful batch; direct: revert). */
  failing?: Set<string>;
  baseGas?: bigint;
  perAccountGas?: bigint;
  /** estimateGas returns this much LESS than the real need (non-linear: too-low limits make inner calls fail). */
  estimateShortfall?: bigint;
  maxBatch?: number; // hub MAX_BATCH (real: 50)
  /** Raw return data override for calls (e.g. "0x" = no code). */
  returnData?: Hex;
  /** Runs before the Nth call (1-based) so tests can change state between simulations (lost race). */
  beforeCall?: (n: number) => void;
}

/** Mock that behaves like the real hub: per-account try/catch, BatchTooLarge, gas-limit sensitive inner calls. */
function mockClient(o: MockOpts) {
  const baseGas = o.baseGas ?? 50_000n;
  const perAccountGas = o.perAccountGas ?? 30_000n;
  const maxBatch = o.maxBatch ?? 50;
  let calls = 0;

  const accountsIn = (to: Address, data: Hex): Address[] => {
    if (to.toLowerCase() === HUB.toLowerCase()) {
      const { args } = decodeFunctionData({ abi: daemonHubAbi, data });
      return [...(args![0] as readonly Address[])];
    }
    return [to];
  };
  const need = (n: number) => baseGas + perAccountGas * BigInt(n);

  const client = {
    getBlockNumber: vi.fn(async () => 100n),
    multicall: vi.fn(async ({ contracts }: { contracts: { address: Address; functionName: string }[] }) =>
      contracts.map((c) => {
        const b = o.bounties.get(c.address.toLowerCase());
        return b === undefined
          ? { status: "failure", error: new Error("returned no data (0x)"), result: undefined }
          : { status: "success", result: b };
      }),
    ),
    call: vi.fn(async ({ to, data, gas }: { to: Address; data: Hex; gas?: bigint }) => {
      o.beforeCall?.(++calls);
      const accts = accountsIn(to, data);
      const isHub = to.toLowerCase() === HUB.toLowerCase();
      if (isHub) {
        if (accts.length > maxBatch) throw batchTooLargeError();
        if (o.returnData !== undefined) return { data: o.returnData };
        let remaining = gas === undefined ? 10n ** 12n : gas - baseGas;
        if (remaining < 0n) throw Object.assign(new Error("out of gas"), { name: "CallExecutionError" });
        const results = accts.map((a) => {
          const key = a.toLowerCase();
          const b = o.bounties.get(key);
          const fail = b === undefined || o.failing?.has(key) || remaining < perAccountGas;
          if (fail) return { account: a, success: false, profit: 0n, bounty: 0n };
          remaining -= perAccountGas;
          return { account: a, success: true, profit: b * 10n, bounty: b };
        });
        return { data: encodeFunctionResult({ abi: daemonHubAbi, functionName: "compoundMany", result: results }) };
      }
      const key = accts[0].toLowerCase();
      if (o.failing?.has(key) || !o.bounties.has(key) || (gas !== undefined && gas < need(1))) throw revertError();
      if (o.returnData !== undefined) return { data: o.returnData };
      const b = o.bounties.get(key)!;
      return { data: encodeFunctionResult({ abi: daemonAccountAbi, functionName: "compound", result: [b * 10n, b] }) };
    }),
    estimateGas: vi.fn(async ({ to, data }: { to: Address; data: Hex }) => need(accountsIn(to, data).length) - (o.estimateShortfall ?? 0n)),
    estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: 100n * GWEI, maxPriorityFeePerGas: 2n * GWEI })),
    readContract: vi.fn(async () => 0n),
  };
  return client;
}

function compoundedLog(account: Address, tokenId: bigint, bounty: bigint) {
  return {
    address: account,
    topics: encodeEventTopics({ abi: daemonAccountAbi, eventName: "Compounded", args: { tokenId, caller: KEEPER } }) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [bounty * 10n, bounty]),
  };
}
type Log = ReturnType<typeof compoundedLog>;

const hashOf = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const hubArgs = (data: Hex) => decodeFunctionData({ abi: daemonHubAbi, data }).args![0] as Address[];

function mockSender(logsFor: (tx: Parameters<TxSender["send"]>[0]) => Log[] = () => []) {
  let n = 0;
  const sent: Parameters<TxSender["send"]>[0][] = [];
  const sender = {
    address: KEEPER,
    send: vi.fn(async (tx: Parameters<TxSender["send"]>[0]) => {
      sent.push(tx);
      return hashOf(++n);
    }),
    waitForReceipt: vi.fn(async (_h: Hex, _t: number) => ({
      status: "success",
      blockNumber: 1n,
      gasUsed: 1n,
      logs: logsFor(sent[sent.length - 1]),
    })),
  };
  return { sender, sent };
}

/** Receipt logs for every account in a hub tx. */
const logsForAll =
  (bounty = u("1")) =>
  (tx: Parameters<TxSender["send"]>[0]): Log[] =>
    hubArgs(tx.data).map((a, i) => compoundedLog(a, BigInt(i + 1), bounty));

function makeKeeper(
  cfg: KeeperConfig,
  client: ReturnType<typeof mockClient>,
  sender?: ReturnType<typeof mockSender>["sender"],
  extra: { onNonceError?: () => void; fetchFn?: typeof fetch } = {},
) {
  return new Keeper({
    cfg,
    client: client as unknown as ReadClient,
    sender: sender as unknown as TxSender,
    simulateFrom: KEEPER,
    bountyRecipient: KEEPER,
    logger: silentLogger,
    sleepFn: async () => {},
    ...extra,
  });
}

const bountyMap = (entries: [bigint, string][]) => new Map(entries.map(([id, v]) => [accountOf(id).toLowerCase(), u(v)]));
const setOf = (...ids: bigint[]) => new Set(ids.map((i) => accountOf(i).toLowerCase()));
const callAccounts = (client: ReturnType<typeof mockClient>) =>
  client.call.mock.calls.map(([c]) => hubArgs((c as { data: Hex }).data));
const fees = { maxFeePerGas: 100n * GWEI };

describe("Keeper.runCycle", () => {
  it("dry-run plans a profitable batch but sends nothing", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"], [2n, "0.5"]]) });
    const { sender } = mockSender();
    const r = await makeKeeper(config({}, ["--dry-run"]), client, sender).runCycle();
    expect(r.discovered).toBe(6);
    expect(r.live).toBe(2); // tokens 3..6 have no code
    expect(r.candidates).toBe(2);
    expect(r.batchesPlanned).toBe(1);
    expect(r.sent).toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("sends with a tight explicit gas limit and counts bounty from the batch accounts' logs only", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"], [2n, "0.5"], [3n, "0"]]) });
    const { sender, sent } = mockSender((tx) => {
      const [a1, a2] = hubArgs(tx.data);
      const foreign = compoundedLog("0x00000000000000000000000000000000000000f1", 9n, u("100")); // not a batch account
      return [compoundedLog(a1, 1n, u("1")), foreign, compoundedLog(a2, 2n, u("0.5"))];
    });
    const r = await makeKeeper(config(), client, sender).runCycle();
    expect(r.sent).toBe(1);
    expect(r.confirmed).toBe(1);
    expect(r.bountyEarned).toBe(u("1.5"));
    expect(sent[0].to).toBe(HUB);
    // estimate = 50k + 2*30k = 110k -> +10% = 121k, and the 121k-limited simulation matches
    expect(sent[0].gas).toBe(121_000n);
    expect(sent[0].maxFeePerGas).toBe(100n * GWEI);
    expect(hubArgs(sent[0].data)).toEqual([accountOf(1n), accountOf(2n)]);
  });

  it("skips when the bounty does not cover gas", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "0.005"]]) });
    const { sender } = mockSender();
    const r = await makeKeeper(config(), client, sender).runCycle();
    expect(r.skippedUnprofitable).toBe(1);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("respects MIN_BOUNTY before simulating", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"]]) });
    const r = await makeKeeper(config({ MIN_BOUNTY: "2" }), client, mockSender().sender).runCycle();
    expect(r.candidates).toBe(0);
    expect(client.call).not.toHaveBeenCalled();
  });

  it("shrinks an unprofitable batch down to its profitable top", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "0.012"], [2n, "0.0001"], [3n, "0.0001"], [4n, "0.0001"]]) });
    const { sender, sent } = mockSender(logsForAll());
    const r = await makeKeeper(config(), client, sender).runCycle();
    expect(r.sent).toBe(1);
    expect(hubArgs(sent[0].data)).toEqual([accountOf(1n)]);
    expect(sent[0].gas).toBe(88_000n);
  });

  it("drops success=false accounts from a successful batch, re-simulates, and uses only the reduced bounty", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"], [2n, "5"], [3n, "1"]]), failing: setOf(2n) });
    const { sender, sent } = mockSender(logsForAll());
    const k = makeKeeper(config(), client, sender);
    const r = await k.runCycle();
    expect(r.sent).toBe(1);
    expect(hubArgs(sent[0].data).map((a) => a.toLowerCase())).not.toContain(accountOf(2n).toLowerCase());
    const sets = callAccounts(client);
    expect(sets[0]).toHaveLength(3); // full batch first
    expect(sets[1]).toHaveLength(2); // then the reduced batch, before any gas estimation on it
    // bounty for the decision comes from the reduced batch simulation (2 x 1), not the 3-account view sum (7)
    const plan = await k.planBatch(
      [
        { account: accountOf(1n), bounty: u("1") },
        { account: accountOf(2n), bounty: u("5") },
        { account: accountOf(3n), bounty: u("1") },
      ],
      fees,
      u("1"),
    );
    expect(plan.plan?.simulatedBounty).toBe(u("2"));
    // the failing account is excluded next cycle
    client.call.mockClear();
    await k.runCycle();
    expect(callAccounts(client).flat().map((a) => a.toLowerCase())).not.toContain(accountOf(2n).toLowerCase());
  });

  it("treats empty return data (hub without code) as an error and never sends", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"], [2n, "0.25"]]), returnData: "0x" });
    const { sender } = mockSender();
    const k = makeKeeper(config(), client, sender);
    await expect(k.planBatch([{ account: accountOf(1n), bounty: u("1") }], fees, u("1"))).rejects.toBeInstanceOf(
      SimulationDecodeError,
    );
    const r = await k.runCycle();
    expect(r.failed).toBe(1);
    expect(r.sent).toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("treats undecodable return data (wrong ABI) as an error and never sends", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"]]), returnData: "0x1234" });
    const { sender } = mockSender();
    const r = await makeKeeper(config(), client, sender).runCycle();
    expect(r.failed).toBe(1);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("uses the simulated bounty, not the pendingBounty view", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "0.001"]]) });
    const k = makeKeeper(config(), client, mockSender().sender);
    const plan = await k.planBatch([{ account: accountOf(1n), bounty: u("5") }], fees, u("1"));
    expect(plan.plan).toBeUndefined();
    expect(plan.lastDecision?.profitable).toBe(false);
  });

  it("raises a too-low estimate until the limit-bounded simulation matches the unlimited one", async () => {
    // estimate 70k -> padded 77k: only the first account fits (27k left < 30k) -> mismatch -> raised
    const client = mockClient({ bounties: bountyMap([[1n, "1"], [2n, "1"]]), estimateShortfall: 40_000n });
    const { sender, sent } = mockSender(logsForAll());
    const r = await makeKeeper(config(), client, sender).runCycle();
    expect(r.sent).toBe(1);
    expect(hubArgs(sent[0].data)).toHaveLength(2);
    expect(sent[0].gas).toBeGreaterThanOrEqual(110_000n);
    expect(sent[0].gas).toBeLessThanOrEqual(30_000_000n);
    // the signed limit itself was simulated
    expect(client.call.mock.calls.some(([c]) => (c as { gas?: bigint }).gas === sent[0].gas)).toBe(true);
  });

  it("shrinks the batch when no limit under MAX_GAS_LIMIT reproduces the simulation", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"], [2n, "1"]]), estimateShortfall: 40_000n });
    const { sender, sent } = mockSender(logsForAll());
    // 2 accounts need 110k > cap 100k; 1 account needs 80k
    const r = await makeKeeper(config({ MAX_GAS_LIMIT: "100000" }), client, sender).runCycle();
    expect(r.sent).toBe(1);
    expect(hubArgs(sent[0].data)).toHaveLength(1);
    expect(sent[0].gas).toBeLessThanOrEqual(100_000n);
    expect(sent[0].gas).toBeGreaterThanOrEqual(80_000n);
  });

  it("splits a batch the hub rejects with BatchTooLarge instead of excluding accounts", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "4"], [2n, "3"], [3n, "2"], [4n, "1"]]), maxBatch: 2 });
    const { sender, sent } = mockSender(logsForAll());
    const k = makeKeeper(config({ BATCH_SIZE: "4" }), client, sender);
    const r = await k.runCycle();
    expect(r.sent).toBe(2);
    expect(sent.map((t) => hubArgs(t.data).length)).toEqual([2, 2]);
    expect(k.excluded.active(1).size).toBe(0);
    expect(r.failed).toBe(0);
  });

  it("isBatchTooLarge recognises the custom error", () => {
    expect(isBatchTooLarge(batchTooLargeError())).toBe(true);
    expect(isBatchTooLarge(revertError())).toBe(false);
  });

  it("re-simulates right before sending and drops accounts lost to another keeper", async () => {
    const failing = new Set<string>();
    const client = mockClient({
      bounties: bountyMap([[1n, "1"], [2n, "1"]]),
      failing,
      // calls: 1 simulate, 2 gas-limited verify, 3 pre-send -> another keeper takes account 2 first
      beforeCall: (n) => {
        if (n === 3) failing.add(accountOf(2n).toLowerCase());
      },
    });
    const { sender, sent } = mockSender(logsForAll());
    const r = await makeKeeper(config(), client, sender).runCycle();
    expect(client.call.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(r.sent).toBe(1);
    expect(hubArgs(sent[0].data)).toEqual([accountOf(1n)]);
  });

  it("sends nothing when every account is lost at the pre-send check", async () => {
    const failing = new Set<string>();
    const client = mockClient({
      bounties: bountyMap([[1n, "1"]]),
      failing,
      beforeCall: (n) => {
        if (n === 3) failing.add(accountOf(1n).toLowerCase());
      },
    });
    const { sender } = mockSender();
    const r = await makeKeeper(config(), client, sender).runCycle();
    expect(sender.send).not.toHaveBeenCalled();
    expect(r.skippedPreSend).toBe(1);
  });

  it("without a hub, compounds each account directly with compound(bountyRecipient)", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"], [2n, "1"]]) });
    const { sender, sent } = mockSender((tx) => [compoundedLog(tx.to, 1n, u("1"))]);
    const r = await makeKeeper(config({ DAEMON_HUB: "" }), client, sender).runCycle();
    expect(r.sent).toBe(2);
    expect(sent.map((t) => t.to).sort()).toEqual([accountOf(1n), accountOf(2n)].sort());
    const { functionName, args } = decodeFunctionData({ abi: daemonAccountAbi, data: sent[0].data });
    expect(functionName).toBe("compound");
    expect((args![0] as Address).toLowerCase()).toBe(KEEPER.toLowerCase());
    expect(sent[0].gas).toBe(88_000n); // (50k + 30k) * 1.1
  });

  it("applies MAX_FEE_PER_GAS_GWEI as a cap", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"]]) });
    const { sender, sent } = mockSender(logsForAll());
    await makeKeeper(config({ MAX_FEE_PER_GAS_GWEI: "60" }), client, sender).runCycle();
    expect(sent[0].maxFeePerGas).toBe(60n * GWEI);
  });
});

describe("nonce and send handling", () => {
  const one = () => mockClient({ bounties: bountyMap([[1n, "1"]]) });

  it("resyncs the nonce and retries once on nonce too low", async () => {
    const { sender } = mockSender(logsForAll());
    const real = sender.send.getMockImplementation()!;
    sender.send.mockImplementationOnce(async () => {
      throw Object.assign(new Error("nonce too low"), { name: "NonceTooLowError" });
    });
    sender.send.mockImplementation(real);
    const onNonceError = vi.fn();
    const r = await makeKeeper(config(), one(), sender, { onNonceError }).runCycle();
    expect(onNonceError).toHaveBeenCalledOnce();
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(r.sent).toBe(1);
  });

  it("already known: does not resend, waits for the hash we signed", async () => {
    const { sender } = mockSender(logsForAll());
    sender.send.mockImplementation(async () => {
      throw new SendError("already known", hashOf(0xabc));
    });
    const onNonceError = vi.fn();
    const r = await makeKeeper(config(), one(), sender, { onNonceError }).runCycle();
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(onNonceError).not.toHaveBeenCalled();
    expect(sender.waitForReceipt).toHaveBeenCalledWith(hashOf(0xabc), expect.any(Number));
    expect(r.sent).toBe(1);
  });

  it("already known without a known hash: skips, never resends", async () => {
    const { sender } = mockSender();
    sender.send.mockImplementation(async () => {
      throw new Error("already known");
    });
    const r = await makeKeeper(config(), one(), sender).runCycle();
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.waitForReceipt).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
  });

  it("replacement transaction underpriced is not retried", async () => {
    const { sender } = mockSender();
    sender.send.mockImplementation(async () => {
      throw new Error("replacement transaction underpriced");
    });
    const onNonceError = vi.fn();
    const r = await makeKeeper(config(), one(), sender, { onNonceError }).runCycle();
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(onNonceError).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
  });

  it("does not retry other send errors (no double send)", async () => {
    const { sender } = mockSender();
    sender.send.mockImplementation(async () => {
      throw new Error("insufficient funds for gas");
    });
    const r = await makeKeeper(config(), one(), sender).runCycle();
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(r.failed).toBe(1);
  });

  it("on receipt timeout excludes the accounts for a few cycles", async () => {
    const client = one();
    const { sender } = mockSender();
    sender.waitForReceipt.mockImplementation(async () => {
      throw Object.assign(new Error("Timed out while waiting for transaction"), { name: "WaitForTransactionReceiptTimeoutError" });
    });
    const k = makeKeeper(config({ EXCLUDE_CYCLES: "3" }), client, sender);
    const r1 = await k.runCycle();
    expect(r1.failed).toBe(1);
    client.call.mockClear();
    const r2 = await k.runCycle();
    expect(r2.candidates).toBe(0);
    expect(client.call).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});

describe("discovery", () => {
  it("falls back to registry derivation when the indexer fails", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"]]) });
    const fetchFn = vi.fn(async () => {
      throw new Error("indexer down");
    }) as unknown as typeof fetch;
    const cfg = config({ INDEXER_URL: "http://indexer.invalid/graphql" }, ["--dry-run"]);
    const r = await makeKeeper(cfg, client, undefined, { fetchFn }).runCycle();
    expect(fetchFn).toHaveBeenCalled();
    expect(r.discovered).toBe(6);
    expect(r.candidates).toBe(1);
  });

  it("pages through token ids lazily instead of materializing the range", () => {
    const gen = tokenIdPages(1n, 10n ** 15n, 3);
    expect(gen.next().value).toEqual([1n, 2n, 3n]);
    expect(gen.next().value).toEqual([4n, 5n, 6n]);
    expect([...tokenIdPages(1n, 5n, 2)]).toEqual([[1n, 2n], [3n, 4n], [5n]]);
    expect([...tokenIdPages(2n, 1n, 2)]).toEqual([]);
  });

  it("scans in several pages", async () => {
    const client = mockClient({ bounties: bountyMap([[1n, "1"], [6n, "1"]]) });
    const r = await makeKeeper(config({ SCAN_PAGE_SIZE: "2" }, ["--dry-run"]), client).runCycle();
    expect(r.discovered).toBe(6);
    expect(r.live).toBe(2);
  });
});

describe("Keeper.bountyFromLogs", () => {
  it("sums Compounded bounties only for logs emitted by batch accounts", () => {
    const foreign = { address: accountOf(1n), topics: [("0x" + "ab".repeat(32)) as Hex], data: "0x" as Hex };
    const outsider = compoundedLog("0x00000000000000000000000000000000000000f1", 3n, 1000n);
    const batch = [accountOf(1n), accountOf(2n)];
    expect(
      Keeper.bountyFromLogs([compoundedLog(accountOf(1n), 1n, 5n), foreign, outsider, compoundedLog(accountOf(2n), 2n, 7n)], batch),
    ).toBe(12n);
  });
});

describe("cycleExitCode", () => {
  it("is non-zero when the cycle threw or a batch failed", () => {
    expect(cycleExitCode({ failed: 0 } as never)).toBe(0);
    expect(cycleExitCode({ failed: 1 } as never)).toBe(1);
    expect(cycleExitCode(undefined, new Error("boom"))).toBe(1);
  });
});

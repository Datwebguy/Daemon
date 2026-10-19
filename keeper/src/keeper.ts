import {
  type Address,
  type Hash,
  type Hex,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  toFunctionSelector,
} from "viem";
import { HUB_MAX_BATCH, MONAD_TX_GAS_LIMIT, daemonAccountAbi, daemonHubAbi, priceOracleAbi } from "./abis.js";
import type { KeeperConfig } from "./config.js";
import { discoverDaemonPages, readBounties } from "./discovery.js";
import { type Logger, errorInfo } from "./logger.js";
import { evaluateProfit, gasLimitFromEstimate, type ProfitDecision } from "./profitability.js";
import { isAlreadyKnown, isNonceError, isOutOfGas, isReceiptTimeout, isRevert, withRetry } from "./retry.js";
import { type AccountBounty, halveBatch, selectBatches, shrinkBatch } from "./selection.js";
import type { ReadClient, TxSender } from "./types.js";

export interface KeeperDeps {
  cfg: KeeperConfig;
  client: ReadClient;
  /** Undefined in dry-run without a key. */
  sender?: TxSender;
  /** Address used as `from` for simulation (keeper address, or BOUNTY_RECIPIENT in keyless dry-run). */
  simulateFrom: Address;
  bountyRecipient: Address;
  logger: Logger;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Called after an on-chain nonce error, so the sender can resync. */
  onNonceError?: () => void;
}

/** One account's outcome inside a simulated batch (DaemonHub.Result). */
export interface SimResult {
  account: Address;
  success: boolean;
  profit: bigint;
  bounty: bigint;
}

export interface Simulation {
  to: Address;
  data: Hex;
  results: SimResult[];
  /** Sum of bounties of successful accounts, decoded from this exact call. */
  bounty: bigint;
}

export interface BatchPlan {
  accounts: Address[];
  to: Address;
  data: Hex;
  gasEstimate: bigint;
  gasLimit: bigint;
  /** Bounty decoded from the simulation of exactly `data` at `gasLimit`. The only bounty used for send decisions. */
  simulatedBounty: bigint;
  decision: ProfitDecision;
}

export interface PlanOutcome {
  plan?: BatchPlan;
  lastDecision?: ProfitDecision;
  /** Parts split off because the hub rejected the batch as too large; plan them separately. */
  split: AccountBounty[][];
}

export interface CycleResult {
  discovered: number;
  live: number;
  candidates: number;
  batchesPlanned: number;
  sent: number;
  confirmed: number;
  failed: number;
  skippedUnprofitable: number;
  /** Batches dropped at the pre-send re-simulation (state changed, usually another keeper was faster). */
  skippedPreSend: number;
  bountyEarned: bigint; // from Compounded logs of the batch accounts (confirmed txs), asset units
}

/** Simulation returned no data or data that is not a DaemonHub.Result[] / compound() result. Never send. */
export class SimulationDecodeError extends Error {
  override name = "SimulationDecodeError";
}

const READ_RETRY = { retries: 3, baseDelayMs: 500, maxDelayMs: 8_000 };
/** How many times the padded gas limit is raised (x1.5 each) when the gas-limited simulation does not match. */
const MAX_GAS_BUMPS = 6;
const GAS_BUMP_NUM = 3n;
const GAS_BUMP_DEN = 2n;
/** Bisection steps used to tighten the limit after a bump found one that works. */
const BISECT_STEPS = 8;

const BATCH_TOO_LARGE_SELECTOR = toFunctionSelector("BatchTooLarge(uint256,uint256)").toLowerCase();

/** True when the hub rejected the batch with BatchTooLarge (selector in revert data, or decoded error name). */
export function isBatchTooLarge(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 8 && e && typeof e === "object"; i++) {
    const o = e as { data?: unknown; message?: unknown; errorName?: unknown; cause?: unknown };
    if (typeof o.data === "string" && o.data.toLowerCase().startsWith(BATCH_TOO_LARGE_SELECTOR)) return true;
    if (o.data && typeof o.data === "object") {
      const d = o.data as { errorName?: unknown; data?: unknown };
      if (d.errorName === "BatchTooLarge") return true;
      if (typeof d.data === "string" && d.data.toLowerCase().startsWith(BATCH_TOO_LARGE_SELECTOR)) return true;
    }
    if (o.errorName === "BatchTooLarge") return true;
    if (typeof o.message === "string" && (o.message.includes("BatchTooLarge") || o.message.toLowerCase().includes(BATCH_TOO_LARGE_SELECTOR))) {
      return true;
    }
    e = o.cause;
  }
  return false;
}

function signedHashOf(err: unknown): Hash | undefined {
  let e: unknown = err;
  for (let i = 0; i < 8 && e && typeof e === "object"; i++) {
    const h = (e as { txHash?: unknown }).txHash;
    if (typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h)) return h as Hash;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Same accounts in the same order, same success flags and the same bounty per account. */
export function sameOutcome(a: readonly SimResult[], b: readonly SimResult[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].account.toLowerCase() !== b[i].account.toLowerCase()) return false;
    if (a[i].success !== b[i].success || a[i].bounty !== b[i].bounty) return false;
  }
  return true;
}

/** Exit code for `--once`: non-zero when the cycle threw or any batch failed. */
export function cycleExitCode(r: CycleResult | undefined, err?: unknown): number {
  if (err !== undefined || !r) return 1;
  return r.failed > 0 ? 1 : 0;
}

/** Accounts that failed simulation are excluded for a few cycles (they will usually be in cooldown). */
export class Cooldowns {
  private until = new Map<string, number>();
  constructor(private readonly cycles: number) {}
  add(account: Address, now: number) {
    this.until.set(account.toLowerCase(), now + this.cycles);
  }
  active(now: number): Set<string> {
    const s = new Set<string>();
    for (const [k, v] of this.until) {
      if (v > now) s.add(k);
      else this.until.delete(k);
    }
    return s;
  }
}

export class Keeper {
  private cycle = 0;
  readonly excluded: Cooldowns;

  constructor(private readonly d: KeeperDeps) {
    this.excluded = new Cooldowns(d.cfg.excludeCycles ?? 5);
  }

  /** Highest gas limit we will ever sign: MAX_GAS_LIMIT, never above the Monad per-tx limit. */
  get gasCap(): bigint {
    const m = this.d.cfg.maxGasLimit;
    return m < MONAD_TX_GAS_LIMIT ? m : MONAD_TX_GAS_LIMIT;
  }

  /** Build calldata for a batch: DaemonHub.compoundMany when a hub is configured, else account.compound. */
  buildCall(accounts: readonly Address[]): { to: Address; data: Hex } {
    const { cfg, bountyRecipient } = this.d;
    if (cfg.daemonHub) {
      return { to: cfg.daemonHub, data: encodeFunctionData({ abi: daemonHubAbi, functionName: "compoundMany", args: [[...accounts]] }) };
    }
    if (accounts.length !== 1) throw new Error("without DAEMON_HUB each tx compounds exactly one account");
    return {
      to: accounts[0],
      data: encodeFunctionData({ abi: daemonAccountAbi, functionName: "compound", args: [bountyRecipient] }),
    };
  }

  /**
   * Decodes per-account results from simulation return data. Throws SimulationDecodeError on empty or undecodable
   * data (e.g. DAEMON_HUB has no code, or is not a DaemonHub): such a simulation proves nothing.
   */
  decodeResults(returnData: Hex | undefined, accounts: readonly Address[]): SimResult[] {
    const { cfg } = this.d;
    const target = cfg.daemonHub ?? accounts[0];
    if (!returnData || returnData === "0x") {
      throw new SimulationDecodeError(
        cfg.daemonHub
          ? `DAEMON_HUB ${cfg.daemonHub} returned no data for compoundMany: no code at that address or not a DaemonHub`
          : `account ${target} returned no data for compound(): not a Daemon account`,
      );
    }
    try {
      if (cfg.daemonHub) {
        const results = decodeFunctionResult({ abi: daemonHubAbi, functionName: "compoundMany", data: returnData });
        if (results.length !== accounts.length) throw new Error(`expected ${accounts.length} results, got ${results.length}`);
        return results.map((r, i) => {
          if (r.account.toLowerCase() !== accounts[i].toLowerCase()) throw new Error(`result ${i} is for ${r.account}, expected ${accounts[i]}`);
          return { account: accounts[i], success: r.success, profit: r.profit, bounty: r.success ? r.bounty : 0n };
        });
      }
      const [profit, bounty] = decodeFunctionResult({ abi: daemonAccountAbi, functionName: "compound", data: returnData });
      return [{ account: accounts[0], success: true, profit, bounty }];
    } catch (err) {
      throw new SimulationDecodeError(
        `could not decode simulation result from ${target} (wrong DAEMON_HUB address or ABI?): ${(err as Error).message}`,
      );
    }
  }

  /**
   * eth_call the batch and decode per-account results.
   * - hub path: a top-level revert is thrown (e.g. BatchTooLarge); per-account failures are success=false results.
   * - direct path: a revert means this account fails (success=false).
   * `gas` simulates with that exact limit (to catch inner calls failing out of gas under a tight limit).
   */
  async simulate(accounts: readonly Address[], opts: { gas?: bigint; blockNumber?: bigint } = {}): Promise<Simulation> {
    const { to, data } = this.buildCall(accounts);
    let res: { data?: Hex };
    try {
      res = await withRetry(
        () =>
          this.d.client.call({
            account: this.d.simulateFrom,
            to,
            data,
            ...(opts.gas !== undefined ? { gas: opts.gas } : {}),
            ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
          }),
        {
          ...READ_RETRY,
          label: "simulate",
          logger: this.d.logger,
          signal: this.d.signal,
          shouldRetry: (e) => !isRevert(e) && !isOutOfGas(e),
        },
      );
    } catch (err) {
      if (!this.d.cfg.daemonHub && (isRevert(err) || isOutOfGas(err))) {
        this.d.logger.debug("compound simulation reverted", { account: accounts[0], gas: opts.gas, ...errorInfo(err) });
        return { to, data, results: [{ account: accounts[0], success: false, profit: 0n, bounty: 0n }], bounty: 0n };
      }
      throw err;
    }
    const results = this.decodeResults(res.data, accounts);
    const bounty = results.reduce((s, r) => (r.success ? s + r.bounty : s), 0n);
    return { to, data, results, bounty };
  }

  /**
   * Re-run the simulation with gas = the padded limit and require the same outcome as the unlimited simulation
   * (same accounts succeed, same bounty each). Inner calls run under try/catch, so a too-low limit does not revert
   * the hub: it silently turns later accounts into success=false, and eth_estimateGas can return exactly such a
   * limit. If the padded limit does not reproduce the outcome, raise it geometrically (bounded by the gas cap),
   * then bisect back down to the smallest matching limit and pad that. Returns undefined if nothing under the cap
   * matches (the caller shrinks the batch).
   */
  async verifyAtLimit(
    accounts: readonly Address[],
    reference: Simulation,
    padded: bigint,
    blockNumber: bigint | undefined,
  ): Promise<{ gasLimit: bigint; sim: Simulation } | undefined> {
    const cap = this.gasCap;
    const min = (a: bigint, b: bigint) => (a < b ? a : b);
    const matches = async (gas: bigint): Promise<Simulation | undefined> => {
      try {
        const sim = await this.simulate(accounts, { gas, blockNumber });
        return sameOutcome(reference.results, sim.results) ? sim : undefined;
      } catch (err) {
        if (err instanceof SimulationDecodeError) throw err;
        if (isRevert(err) || isOutOfGas(err)) return undefined; // whole call failed at this limit
        throw err;
      }
    };

    const first = await matches(min(padded, cap));
    if (first) return { gasLimit: min(padded, cap), sim: first };

    let lo: bigint = min(padded, cap); // known not to match
    let found: { gas: bigint; sim: Simulation } | undefined;
    for (let i = 0; i < MAX_GAS_BUMPS && lo < cap; i++) {
      const next: bigint = min(cap, (lo * GAS_BUMP_NUM + GAS_BUMP_DEN - 1n) / GAS_BUMP_DEN);
      this.d.logger.debug("gas-limited simulation differs, raising limit", { size: accounts.length, from: lo, to: next });
      const s = await matches(next);
      if (s) {
        found = { gas: next, sim: s };
        break;
      }
      lo = next;
    }
    if (!found) return undefined;
    let hi: bigint = found.gas;
    let hiSim: Simulation = found.sim;

    for (let i = 0; i < BISECT_STEPS && hi - lo > hi / 100n; i++) {
      const mid: bigint = (lo + hi) / 2n;
      const s = await matches(mid);
      if (s) {
        hi = mid;
        hiSim = s;
      } else lo = mid;
    }
    // Pad the smallest matching limit like a normal estimate, so small state changes before inclusion still fit.
    const target = min(cap, (hi * (10_000n + BigInt(this.d.cfg.gasLimitMarginBps)) + 9_999n) / 10_000n);
    if (target > hi) {
      const s = await matches(target);
      if (s) return { gasLimit: target, sim: s };
    }
    return { gasLimit: hi, sim: hiSim };
  }

  /**
   * Plan one batch:
   * 1. simulate (pinned block), decode per-account results; drop success=false accounts and re-simulate the rest;
   * 2. estimate gas, pad it, verify the padded limit reproduces the same outcome (raising it if needed);
   * 3. check profit with the bounty decoded from that exact simulation.
   * If unprofitable or over the gas cap, retry with the top half (by simulated bounty) until one account is left.
   * BatchTooLarge splits the batch; the other half is returned in `split`.
   */
  async planBatch(
    initial: readonly AccountBounty[],
    fees: { maxFeePerGas: bigint },
    monPriceInAsset: bigint,
  ): Promise<PlanOutcome> {
    const { cfg, logger } = this.d;
    let batch: AccountBounty[] = [...initial];
    const split: AccountBounty[][] = [];
    let lastDecision: ProfitDecision | undefined;
    // Pin one block so the unlimited and gas-limited simulations (and the estimate) see identical state.
    const blockNumber = await withRetry(() => this.d.client.getBlockNumber(), {
      ...READ_RETRY,
      label: "blockNumber",
      logger,
      signal: this.d.signal,
    });

    while (batch.length > 0 && !this.d.signal?.aborted) {
      if (cfg.daemonHub && batch.length > HUB_MAX_BATCH) {
        const [a, b] = halveBatch(batch);
        batch = a;
        split.push(b);
        continue;
      }
      const accounts = batch.map((b) => b.account);

      let sim: Simulation;
      try {
        sim = await this.simulate(accounts, { blockNumber });
      } catch (err) {
        if (cfg.daemonHub && isBatchTooLarge(err) && batch.length > 1) {
          const [a, b] = halveBatch(batch);
          logger.warn("hub rejected batch as too large, splitting", { size: batch.length, into: [a.length, b.length] });
          batch = a;
          split.push(b);
          continue;
        }
        if (err instanceof SimulationDecodeError) logger.error("simulation result undecodable, not sending", errorInfo(err));
        throw err;
      }

      const failed = sim.results.filter((r) => !r.success);
      if (failed.length > 0) {
        failed.forEach((r) => this.excluded.add(r.account, this.cycle));
        logger.info("accounts would not compound, dropping them and re-simulating", {
          dropped: failed.map((r) => r.account),
          remaining: sim.results.length - failed.length,
        });
        batch = sim.results.filter((r) => r.success).map((r) => ({ account: r.account, bounty: r.bounty }));
        continue;
      }
      // Use simulated bounties from here on (shrinking keeps the best accounts by real bounty).
      batch = sim.results.map((r) => ({ account: r.account, bounty: r.bounty }));

      const gasEstimate = await withRetry(
        () => this.d.client.estimateGas({ account: this.d.simulateFrom, to: sim.to, data: sim.data, blockNumber }),
        { ...READ_RETRY, label: "estimateGas", logger, signal: this.d.signal, shouldRetry: (e) => !isRevert(e) },
      );
      const padded = gasLimitFromEstimate(gasEstimate, cfg.gasLimitMarginBps, this.gasCap);
      if (padded === undefined) {
        logger.warn("gas limit above cap, shrinking batch", { gasEstimate, cap: this.gasCap, size: batch.length });
        batch = shrinkBatch(batch);
        continue;
      }

      const verified = await this.verifyAtLimit(accounts, sim, padded, blockNumber);
      if (!verified) {
        logger.warn("no gas limit under the cap reproduces the simulation, shrinking batch", {
          gasEstimate,
          padded,
          cap: this.gasCap,
          size: batch.length,
        });
        batch = shrinkBatch(batch);
        continue;
      }

      const decision = evaluateProfit({
        bounty: verified.sim.bounty,
        gasLimit: verified.gasLimit,
        maxFeePerGas: fees.maxFeePerGas,
        monPriceInAsset,
        minProfitMarginBps: cfg.minProfitMarginBps,
      });
      lastDecision = decision;
      logger.debug("batch evaluated", {
        size: batch.length,
        bounty: verified.sim.bounty,
        gasEstimate,
        gasLimit: verified.gasLimit,
        ...decision,
      });

      if (decision.profitable) {
        return {
          plan: {
            accounts,
            to: verified.sim.to,
            data: verified.sim.data,
            gasEstimate,
            gasLimit: verified.gasLimit,
            simulatedBounty: verified.sim.bounty,
            decision,
          },
          lastDecision,
          split,
        };
      }
      batch = shrinkBatch(batch);
    }
    return { lastDecision, split };
  }

  /**
   * Re-simulate the exact tx (same calldata, same gas limit) at the latest block right before sending.
   * Another keeper may have compounded some accounts since planning; sending anyway would pay gas for nothing.
   */
  async preSendCheck(
    plan: BatchPlan,
    fees: { maxFeePerGas: bigint },
    monPriceInAsset: bigint,
  ): Promise<{ ok: true; plan: BatchPlan } | { ok: false; reason: string; stillGood: AccountBounty[] }> {
    let sim: Simulation;
    try {
      sim = await this.simulate(plan.accounts, { gas: plan.gasLimit });
    } catch (err) {
      if (err instanceof SimulationDecodeError || !(isRevert(err) || isOutOfGas(err))) throw err;
      return { ok: false, reason: "reverted at the planned gas limit", stillGood: [] };
    }
    const failed = sim.results.filter((r) => !r.success);
    const stillGood = sim.results.filter((r) => r.success).map((r) => ({ account: r.account, bounty: r.bounty }));
    if (failed.length > 0) {
      failed.forEach((r) => this.excluded.add(r.account, this.cycle));
      return { ok: false, reason: `${failed.length} account(s) no longer compound (likely taken by another keeper)`, stillGood };
    }
    const decision = evaluateProfit({
      bounty: sim.bounty,
      gasLimit: plan.gasLimit,
      maxFeePerGas: fees.maxFeePerGas,
      monPriceInAsset,
      minProfitMarginBps: this.d.cfg.minProfitMarginBps,
    });
    if (!decision.profitable) return { ok: false, reason: "no longer profitable", stillGood: [] };
    return { ok: true, plan: { ...plan, simulatedBounty: sim.bounty, decision } };
  }

  async getFees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    const fees = await withRetry(() => this.d.client.estimateFeesPerGas(), {
      ...READ_RETRY,
      label: "fees",
      logger: this.d.logger,
      signal: this.d.signal,
    });
    let { maxFeePerGas, maxPriorityFeePerGas } = fees;
    const cap = this.d.cfg.maxFeePerGasCap;
    if (cap !== undefined && maxFeePerGas > cap) {
      maxFeePerGas = cap;
      if (maxPriorityFeePerGas > cap) maxPriorityFeePerGas = cap;
    }
    return { maxFeePerGas, maxPriorityFeePerGas };
  }

  /** Asset base units per 1 MON: on-chain oracle if configured, else MON_PRICE_IN_ASSET. */
  async getMonPriceInAsset(): Promise<bigint> {
    const { cfg } = this.d;
    if (cfg.priceOracle && cfg.wmon && cfg.asset) {
      try {
        return await withRetry(
          () =>
            this.d.client.readContract({
              address: cfg.priceOracle!,
              abi: priceOracleAbi,
              functionName: "quote",
              args: [cfg.wmon!, cfg.asset!, 10n ** 18n],
            }),
          { ...READ_RETRY, label: "oracle", logger: this.d.logger, signal: this.d.signal },
        );
      } catch (err) {
        if (cfg.monPriceInAsset === undefined) throw err;
        this.d.logger.warn("oracle quote failed, using MON_PRICE_IN_ASSET", errorInfo(err));
      }
    }
    return cfg.monPriceInAsset!;
  }

  /**
   * Compounded.bounty per batch account found in the receipt logs. Only logs emitted BY one of `accounts` count:
   * any other contract can emit an event with the same signature.
   */
  static compoundedFromLogs(
    logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[],
    accounts: readonly Address[],
  ): Map<string, bigint> {
    const ours = new Set(accounts.map((a) => a.toLowerCase()));
    const out = new Map<string, bigint>();
    for (const log of logs) {
      const addr = log.address.toLowerCase();
      if (!ours.has(addr)) continue;
      try {
        const ev = decodeEventLog({ abi: daemonAccountAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
        if (ev.eventName === "Compounded") out.set(addr, (out.get(addr) ?? 0n) + ev.args.bounty);
      } catch {
        /* not a DaemonAccount event */
      }
    }
    return out;
  }

  /** Sum of Compounded.bounty in the receipt logs emitted by the batch accounts. */
  static bountyFromLogs(logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[], accounts: readonly Address[]): bigint {
    let total = 0n;
    for (const v of Keeper.compoundedFromLogs(logs, accounts).values()) total += v;
    return total;
  }

  async runCycle(): Promise<CycleResult> {
    this.cycle++;
    const { cfg, logger } = this.d;
    const log = logger.child({ cycle: this.cycle });
    const result: CycleResult = {
      discovered: 0,
      live: 0,
      candidates: 0,
      batchesPlanned: 0,
      sent: 0,
      confirmed: 0,
      failed: 0,
      skippedUnprofitable: 0,
      skippedPreSend: 0,
      bountyEarned: 0n,
    };
    const deps = { client: this.d.client, logger: log, signal: this.d.signal, fetchFn: this.d.fetchFn, sleepFn: this.d.sleepFn };

    // Stream discovery page by page; keep only accounts with a positive pendingBounty (a cheap pre-filter).
    const positive: AccountBounty[] = [];
    for await (const page of discoverDaemonPages(cfg, deps)) {
      result.discovered += page.length;
      if (page.length === 0) continue;
      const { bounties, live } = await readBounties(page, cfg.scanPageSize, deps);
      result.live += live;
      for (const b of bounties) if (b.bounty > 0n) positive.push(b);
    }

    const batchSize = cfg.daemonHub ? Math.min(cfg.batchSize, HUB_MAX_BATCH) : 1;
    const queue = selectBatches(positive, { minBounty: cfg.minBounty, batchSize, exclude: this.excluded.active(this.cycle) });
    result.candidates = queue.reduce((s, b) => s + b.length, 0);
    log.info("scan complete", { discovered: result.discovered, live: result.live, candidates: result.candidates, batches: queue.length });
    if (queue.length === 0) return result;

    const [fees, monPrice] = await Promise.all([this.getFees(), this.getMonPriceInAsset()]);

    while (queue.length > 0) {
      if (this.d.signal?.aborted) break;
      const batch = queue.shift()!;
      let plan: BatchPlan | undefined;
      try {
        const planned = await this.planBatch(batch, fees, monPrice);
        queue.unshift(...planned.split);
        plan = planned.plan;
        if (!plan) {
          result.skippedUnprofitable++;
          log.info("not profitable, skipping batch", { size: batch.length, ...(planned.lastDecision ?? {}) });
          continue;
        }
        if (!cfg.dryRun && this.d.sender) {
          plan = await this.checkBeforeSend(plan, fees, monPrice, log);
          if (!plan) {
            result.skippedPreSend++;
            continue;
          }
        }
      } catch (err) {
        result.failed++;
        log.error("planning failed, not sending", { size: batch.length, ...errorInfo(err) });
        continue;
      }
      result.batchesPlanned++;
      const summary = {
        accounts: plan.accounts.length,
        simulatedBounty: plan.simulatedBounty,
        gasEstimate: plan.gasEstimate,
        gasLimit: plan.gasLimit,
        maxFeePerGas: fees.maxFeePerGas,
        costAsset: plan.decision.costAsset,
        netAsset: plan.decision.netAsset,
      };

      if (cfg.dryRun || !this.d.sender) {
        log.info("dry-run: would send", { ...summary, to: plan.to, accountList: plan.accounts });
        continue;
      }

      const outcome = await this.sendAndConfirm(plan, fees, summary, result, log);
      if (outcome === "stop") break;
    }
    return result;
  }

  /** Pre-send re-simulation; on a partial loss, re-plan the accounts that still compound (once). */
  private async checkBeforeSend(
    plan: BatchPlan,
    fees: { maxFeePerGas: bigint },
    monPrice: bigint,
    log: Logger,
  ): Promise<BatchPlan | undefined> {
    let check = await this.preSendCheck(plan, fees, monPrice);
    if (check.ok) return check.plan;
    log.info("pre-send simulation changed", { reason: check.reason, accounts: plan.accounts.length });
    if (check.stillGood.length === 0) return undefined;
    const replanned = await this.planBatch(check.stillGood, fees, monPrice);
    if (!replanned.plan) return undefined;
    check = await this.preSendCheck(replanned.plan, fees, monPrice);
    if (check.ok) return check.plan;
    log.info("pre-send simulation changed again, skipping batch", { reason: check.reason });
    return undefined;
  }

  /** Returns "stop" when no further tx should be sent this cycle (a tx of ours may still be pending). */
  private async sendAndConfirm(
    plan: BatchPlan,
    fees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
    summary: Record<string, unknown>,
    result: CycleResult,
    log: Logger,
  ): Promise<"ok" | "stop"> {
    const sender = this.d.sender!;
    let hash: Hash;
    try {
      hash = await this.sendWithNonceRecovery({
        to: plan.to,
        data: plan.data,
        gas: plan.gasLimit,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
    } catch (err) {
      if (!isAlreadyKnown(err)) {
        result.failed++;
        log.error("send failed", { ...summary, ...errorInfo(err) });
        return "ok";
      }
      const known = signedHashOf(err);
      if (!known) {
        // Our tx is in the pool but we cannot identify it: never resend; let the next cycle see the new state.
        result.failed++;
        log.warn("node already knows this tx and its hash is unknown; not resending, skipping rest of cycle", errorInfo(err));
        return "stop";
      }
      log.warn("node already knows this tx; treating it as sent", { hash: known });
      hash = known;
    }
    result.sent++;
    log.info("tx sent", { ...summary, hash });

    let receipt: Awaited<ReturnType<TxSender["waitForReceipt"]>>;
    try {
      receipt = await sender.waitForReceipt(hash, this.d.cfg.txTimeoutMs);
    } catch (err) {
      result.failed++;
      plan.accounts.forEach((a) => this.excluded.add(a, this.cycle));
      log.warn(isReceiptTimeout(err) ? "receipt timeout; excluding accounts for a few cycles" : "receipt wait failed; excluding accounts", {
        hash,
        accounts: plan.accounts.length,
        excludeCycles: this.d.cfg.excludeCycles,
        ...errorInfo(err),
      });
      // The tx may still land; do not stack more txs behind it this cycle.
      return "stop";
    }

    if (receipt.status !== "success") {
      result.failed++;
      plan.accounts.forEach((a) => this.excluded.add(a, this.cycle));
      log.warn("tx reverted on-chain", { hash, block: receipt.blockNumber, gasUsed: receipt.gasUsed });
      return "ok";
    }
    const perAccount = Keeper.compoundedFromLogs(receipt.logs, plan.accounts);
    let earned = 0n;
    for (const v of perAccount.values()) earned += v;
    result.confirmed++;
    result.bountyEarned += earned;
    const missed = plan.accounts.filter((a) => !perAccount.has(a.toLowerCase()));
    if (missed.length > 0) {
      missed.forEach((a) => this.excluded.add(a, this.cycle));
      log.warn("some accounts did not compound in the mined tx (lost race); their share of gas was paid for nothing", {
        hash,
        missed,
      });
    }
    log.info("tx confirmed", {
      hash,
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      gasLimit: plan.gasLimit,
      compounded: perAccount.size,
      bountyEarned: earned,
    });
    return "ok";
  }

  /**
   * One retry after "nonce too low/high" (resync nonce first). "already known" and "replacement transaction
   * underpriced" are NOT retried: the first means our tx is already pending, the second that some tx with this
   * nonce is pending; resending could double-send. Other send errors are not retried either.
   */
  private async sendWithNonceRecovery(tx: Parameters<TxSender["send"]>[0]) {
    try {
      return await this.d.sender!.send(tx);
    } catch (err) {
      if (!isNonceError(err)) throw err;
      this.d.logger.warn("nonce error, resyncing and retrying once", errorInfo(err));
      this.d.onNonceError?.();
      return await this.d.sender!.send(tx);
    }
  }
}

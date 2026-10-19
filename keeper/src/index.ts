#!/usr/bin/env node
// Daemon reference keeper. Anyone can run this (or their own) to compound Daemons and earn bounties.
import { existsSync } from "node:fs";
import {
  type Address,
  type Chain,
  type Hash,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  nonceManager,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { ConfigError, type KeeperConfig, parseConfig, redactedConfig } from "./config.js";
import { type CycleResult, Keeper, cycleExitCode } from "./keeper.js";
import { createLogger, errorInfo } from "./logger.js";
import { sleep } from "./retry.js";
import { SendError, type TxSender } from "./types.js";

function buildChain(cfg: KeeperConfig): Chain {
  if (cfg.chainId === monadTestnet.id) {
    return { ...monadTestnet, rpcUrls: { default: { http: [cfg.rpcUrl] } } };
  }
  return defineChain({
    id: cfg.chainId,
    name: `chain-${cfg.chainId}`,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
    contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  });
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const argv = process.argv.slice(2);

  let cfg: KeeperConfig;
  try {
    cfg = parseConfig(process.env, argv);
  } catch (err) {
    if (err instanceof ConfigError) {
      createLogger("error").error("invalid configuration", { error: err.message });
      process.exit(2);
    }
    throw err;
  }
  const logger = createLogger(cfg.logLevel, { svc: "daemon-keeper" });

  const chain = buildChain(cfg);
  for (const w of cfg.warnings) logger.warn("config adjusted", { warning: w });

  // retryCount: 0 -> withRetry (src/retry.ts) is the single retry layer, with 429-aware backoff. Transport retries
  // on top of it would multiply attempts against an already rate-limited RPC.
  const transport = http(cfg.rpcUrl, { retryCount: 0, timeout: 20_000, batch: false });
  const client = createPublicClient({ chain, transport });

  const remoteChainId = await client.getChainId();
  if (remoteChainId !== cfg.chainId) {
    logger.error("RPC chain id mismatch", { expected: cfg.chainId, got: remoteChainId });
    process.exit(2);
  }

  // Key never leaves this scope; only the derived address is logged.
  const account = cfg.privateKey ? privateKeyToAccount(cfg.privateKey, { nonceManager }) : undefined;
  delete process.env.KEEPER_PRIVATE_KEY;
  cfg = { ...cfg, privateKey: undefined };

  let sender: TxSender | undefined;
  if (account) {
    const wallet = createWalletClient({ account, chain, transport });
    sender = {
      address: account.address,
      // Sign locally first so the hash is known before broadcast: if the node answers "already known", the keeper
      // waits for THIS hash instead of resending.
      send: async (tx) => {
        const request = await wallet.prepareTransactionRequest({
          to: tx.to,
          data: tx.data,
          gas: tx.gas, // explicit and tight: Monad charges the full gas limit
          maxFeePerGas: tx.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
          type: "eip1559",
        });
        const serializedTransaction = await wallet.signTransaction(request);
        const hash = keccak256(serializedTransaction);
        try {
          return await wallet.sendRawTransaction({ serializedTransaction });
        } catch (err) {
          throw new SendError((err as Error).message, hash, { cause: err });
        }
      },
      waitForReceipt: (hash: Hash, timeoutMs: number) =>
        client.waitForTransactionReceipt({ hash, timeout: timeoutMs, pollingInterval: 500 }),
    };
  }

  const keeperAddress: Address | undefined = account?.address;
  const bountyRecipient = cfg.bountyRecipient ?? keeperAddress ?? zeroAddress;
  const simulateFrom = keeperAddress ?? cfg.bountyRecipient ?? zeroAddress;

  if (cfg.daemonHub && cfg.bountyRecipient && keeperAddress && cfg.bountyRecipient !== keeperAddress) {
    logger.warn("DaemonHub.compoundMany(address[]) pays msg.sender; BOUNTY_RECIPIENT is ignored for hub batches", {
      bountyRecipient: cfg.bountyRecipient,
      keeper: keeperAddress,
    });
  }
  if (keeperAddress) {
    const bal = await client.getBalance({ address: keeperAddress });
    logger.info("keeper wallet", { address: keeperAddress, balanceWei: bal });
    if (bal === 0n && !cfg.dryRun) logger.warn("keeper wallet has no MON for gas (faucet: https://faucet.monad.xyz)");
  }

  const controller = new AbortController();
  let stopping = false;
  const stop = (sig: string) => {
    if (stopping) {
      logger.warn("second signal, exiting now", { sig });
      process.exit(130);
    }
    stopping = true;
    logger.info("shutdown requested, finishing current step", { sig });
    controller.abort();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  const keeper = new Keeper({
    cfg,
    client,
    sender: cfg.dryRun ? undefined : sender,
    simulateFrom,
    bountyRecipient,
    logger,
    signal: controller.signal,
    onNonceError: () => {
      if (account) nonceManager.reset({ address: account.address, chainId: cfg.chainId });
    },
  });

  logger.info("keeper starting", { ...redactedConfig(cfg), signerConfigured: Boolean(account), keeper: keeperAddress, bountyRecipient, simulateFrom, mode: cfg.dryRun ? "dry-run" : "live" });

  let consecutiveErrors = 0;
  while (!controller.signal.aborted) {
    const started = Date.now();
    let r: CycleResult | undefined;
    let cycleErr: unknown;
    try {
      r = await keeper.runCycle();
      consecutiveErrors = 0;
      logger.info("cycle done", { ...r, ms: Date.now() - started });
    } catch (err) {
      cycleErr = err ?? new Error("cycle failed");
      consecutiveErrors++;
      logger.error("cycle failed", { consecutiveErrors, ...errorInfo(err) });
    }
    if (cfg.once) {
      // Non-zero so cron / CI notice a failed cycle (thrown, or any batch failed).
      process.exitCode = cycleExitCode(r, cycleErr);
      break;
    }
    // Back off (up to 10x the interval) when the RPC keeps failing.
    const factor = Math.min(10, 2 ** Math.max(0, consecutiveErrors - 1));
    const waitMs = Math.max(0, cfg.intervalSeconds * 1000 * factor - (Date.now() - started));
    await sleep(waitMs, controller.signal);
  }
  logger.info("keeper stopped");
}

main().catch((err) => {
  createLogger("error").error("fatal", errorInfo(err));
  process.exit(1);
});

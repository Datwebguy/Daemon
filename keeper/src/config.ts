import { type Address, type Hex, getAddress, isAddress, isHex, parseUnits, zeroHash } from "viem";
import { HUB_MAX_BATCH, MONAD_TX_GAS_LIMIT } from "./abis.js";
import { CANONICAL_ERC6551_REGISTRY } from "./erc6551.js";
import type { LogLevel } from "./logger.js";

export type DiscoveryMode = "auto" | "indexer" | "registry" | "chog";

export interface KeeperConfig {
  rpcUrl: string;
  chainId: number;
  /** Present only when sending is possible. Never log this object without redaction. */
  privateKey?: Hex;
  dryRun: boolean;
  once: boolean;

  daemonHub?: Address;
  mockChog?: Address;
  registry: Address;
  implementation?: Address;
  salt: Hex;
  bountyRecipient?: Address; // resolved to keeper address when unset

  discoveryMode: DiscoveryMode;
  indexerUrl?: string;
  minTokenId: bigint;
  maxTokenId?: bigint;
  scanPageSize: number;

  assetDecimals: number;
  minBounty: bigint; // asset base units
  batchSize: number;
  intervalSeconds: number;

  /** Asset base units per 1 MON (1e18 wei). Used when no oracle is configured. */
  monPriceInAsset?: bigint;
  priceOracle?: Address;
  wmon?: Address;
  asset?: Address;

  gasLimitMarginBps: number;
  minProfitMarginBps: number;
  maxGasLimit: bigint;
  maxFeePerGasCap?: bigint; // wei
  txTimeoutMs: number;
  /** Cycles an account is skipped after a failed simulation or a receipt timeout. */
  excludeCycles: number;
  logLevel: LogLevel;
  /** Non-fatal config problems that were corrected (logged at startup). */
  warnings: string[];
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

type Env = Record<string, string | undefined>;

function str(env: Env, key: string): string | undefined {
  const v = env[key]?.trim();
  return v ? v : undefined;
}

function addr(env: Env, key: string): Address | undefined {
  const v = str(env, key);
  if (!v) return undefined;
  if (!isAddress(v, { strict: false })) throw new ConfigError(`${key} is not a valid address`);
  return getAddress(v);
}

function int(env: Env, key: string, def: number, min = 0): number {
  const v = str(env, key);
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new ConfigError(`${key} must be an integer >= ${min}`);
  return n;
}

function bool(env: Env, key: string, def = false): boolean {
  const v = str(env, key);
  if (v === undefined) return def;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function units(env: Env, key: string, decimals: number): bigint | undefined {
  const v = str(env, key);
  if (v === undefined) return undefined;
  try {
    const r = parseUnits(v, decimals);
    if (r < 0n) throw new Error("negative");
    return r;
  } catch {
    throw new ConfigError(`${key} must be a non-negative decimal number (got "${v}")`);
  }
}

export function parseConfig(env: Env, argv: string[] = []): KeeperConfig {
  const dryRun = argv.includes("--dry-run") || bool(env, "DRY_RUN");
  const once = argv.includes("--once") || bool(env, "RUN_ONCE");

  const pk = str(env, "KEEPER_PRIVATE_KEY");
  let privateKey: Hex | undefined;
  if (pk) {
    const withPrefix = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
    // Deliberately no value in the message.
    if (!isHex(withPrefix) || withPrefix.length !== 66) throw new ConfigError("KEEPER_PRIVATE_KEY is malformed (expected 32-byte hex)");
    privateKey = withPrefix;
  } else if (!dryRun) {
    throw new ConfigError("KEEPER_PRIVATE_KEY is required unless running with --dry-run");
  }

  const salt = (str(env, "DAEMON_SALT") ?? zeroHash) as Hex;
  if (!isHex(salt) || salt.length !== 66) throw new ConfigError("DAEMON_SALT must be a 32-byte hex value");

  const discoveryMode = (str(env, "DISCOVERY_MODE") ?? "auto") as DiscoveryMode;
  if (!["auto", "indexer", "registry", "chog"].includes(discoveryMode)) {
    throw new ConfigError("DISCOVERY_MODE must be one of auto|indexer|registry|chog");
  }

  const assetDecimals = int(env, "ASSET_DECIMALS", 18);
  const maxTokenIdRaw = str(env, "MAX_TOKEN_ID");
  if (maxTokenIdRaw !== undefined && !/^\d+$/.test(maxTokenIdRaw)) throw new ConfigError("MAX_TOKEN_ID must be an integer");

  const maxFeeGwei = str(env, "MAX_FEE_PER_GAS_GWEI");
  const warnings: string[] = [];

  // The deployed DaemonHub has no compoundMany(address[], address) form. Fail loudly instead of sending calldata
  // the hub cannot decode. HUB_RECIPIENT_ARG=false (or unset) is still accepted for backwards compatibility.
  if (bool(env, "HUB_RECIPIENT_ARG")) {
    throw new ConfigError(
      "HUB_RECIPIENT_ARG is no longer supported: DaemonHub only has compoundMany(address[]), which pays msg.sender " +
        "(the keeper). Remove HUB_RECIPIENT_ARG from your environment.",
    );
  }

  let batchSize = int(env, "BATCH_SIZE", 20, 1);
  if (batchSize > HUB_MAX_BATCH) {
    warnings.push(`BATCH_SIZE=${batchSize} is above DaemonHub.MAX_BATCH; clamped to ${HUB_MAX_BATCH}`);
    batchSize = HUB_MAX_BATCH;
  }
  let maxGasLimit = BigInt(int(env, "MAX_GAS_LIMIT", 10_000_000, 21_000));
  if (maxGasLimit > MONAD_TX_GAS_LIMIT) {
    warnings.push(`MAX_GAS_LIMIT=${maxGasLimit} is above the Monad per-tx limit; clamped to ${MONAD_TX_GAS_LIMIT}`);
    maxGasLimit = MONAD_TX_GAS_LIMIT;
  }

  const cfg: KeeperConfig = {
    rpcUrl: str(env, "RPC_URL") ?? "https://testnet-rpc.monad.xyz",
    chainId: int(env, "CHAIN_ID", 10143, 1),
    privateKey,
    dryRun,
    once,
    daemonHub: addr(env, "DAEMON_HUB"),
    mockChog: addr(env, "MOCK_CHOG"),
    registry: addr(env, "ERC6551_REGISTRY") ?? CANONICAL_ERC6551_REGISTRY,
    implementation: addr(env, "DAEMON_IMPLEMENTATION"),
    salt,
    bountyRecipient: addr(env, "BOUNTY_RECIPIENT"),
    discoveryMode,
    indexerUrl: str(env, "INDEXER_URL"),
    minTokenId: BigInt(int(env, "MIN_TOKEN_ID", 1)),
    maxTokenId: maxTokenIdRaw !== undefined ? BigInt(maxTokenIdRaw) : undefined,
    scanPageSize: int(env, "SCAN_PAGE_SIZE", 200, 1),
    assetDecimals,
    minBounty: units(env, "MIN_BOUNTY", assetDecimals) ?? 0n,
    batchSize,
    intervalSeconds: int(env, "INTERVAL_SECONDS", 60, 1),
    monPriceInAsset: units(env, "MON_PRICE_IN_ASSET", assetDecimals),
    priceOracle: addr(env, "PRICE_ORACLE"),
    wmon: addr(env, "WMON"),
    asset: addr(env, "ASSET"),
    gasLimitMarginBps: int(env, "GAS_LIMIT_MARGIN_BPS", 1000),
    minProfitMarginBps: int(env, "MIN_PROFIT_MARGIN_BPS", 1000),
    maxGasLimit,
    maxFeePerGasCap: maxFeeGwei ? parseUnits(maxFeeGwei, 9) : undefined,
    txTimeoutMs: int(env, "TX_TIMEOUT_SECONDS", 60, 1) * 1000,
    excludeCycles: int(env, "EXCLUDE_CYCLES", 5, 1),
    logLevel: (str(env, "LOG_LEVEL") ?? "info") as LogLevel,
    warnings,
  };

  // --- cross-field validation ---
  const mode = resolveDiscoveryMode(cfg);
  if (mode === "indexer" && !cfg.indexerUrl) throw new ConfigError("DISCOVERY_MODE=indexer requires INDEXER_URL");
  if (mode === "registry" && (!cfg.implementation || !cfg.mockChog)) {
    throw new ConfigError("registry discovery requires DAEMON_IMPLEMENTATION and MOCK_CHOG");
  }
  if (mode === "chog" && !cfg.mockChog) throw new ConfigError("chog discovery requires MOCK_CHOG");

  const hasOracle = cfg.priceOracle && cfg.wmon && cfg.asset;
  if (!hasOracle && cfg.monPriceInAsset === undefined) {
    throw new ConfigError(
      "Set MON_PRICE_IN_ASSET (asset tokens per 1 MON) or PRICE_ORACLE + WMON + ASSET so gas cost can be compared to the bounty",
    );
  }
  return cfg;
}

/**
 * Discovery used when the primary source (the indexer) fails: local ERC-6551 derivation when possible, else
 * MockChog.daemonOf, else none.
 */
export function fallbackDiscoveryMode(cfg: Pick<KeeperConfig, "implementation" | "mockChog">): "registry" | "chog" | undefined {
  if (cfg.implementation && cfg.mockChog) return "registry";
  if (cfg.mockChog) return "chog";
  return undefined;
}

/** auto: indexer if INDEXER_URL, else local ERC-6551 derivation if implementation known, else MockChog.daemonOf. */
export function resolveDiscoveryMode(cfg: Pick<KeeperConfig, "discoveryMode" | "indexerUrl" | "implementation">): Exclude<DiscoveryMode, "auto"> {
  if (cfg.discoveryMode !== "auto") return cfg.discoveryMode;
  if (cfg.indexerUrl) return "indexer";
  if (cfg.implementation) return "registry";
  return "chog";
}

/** Config safe to log (no private key). */
export function redactedConfig(cfg: KeeperConfig): Record<string, unknown> {
  const { privateKey: _pk, rpcUrl, indexerUrl, ...rest } = cfg;
  // RPC / indexer URLs often embed API keys: log only the origin.
  const origin = (u?: string) => {
    if (!u) return undefined;
    try {
      return new URL(u).origin;
    } catch {
      return "[invalid url]";
    }
  };
  return { ...rest, rpcUrl: origin(rpcUrl), indexerUrl: origin(indexerUrl), signerConfigured: Boolean(_pk) };
}

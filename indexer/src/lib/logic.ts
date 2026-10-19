// Pure helpers used by the event handlers. No `envio` import, so they can be unit-tested
// without codegen. The object shapes mirror schema.graphql; the handlers pass them to
// context.<Entity>.set, so the codegen types check them for drift.

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ZERO_SALT = "0x0000000000000000000000000000000000000000000000000000000000000000";
export const STATS_ID = "global";

/** IDaemonAccount.Mood */
export const MOOD_NAMES = ["Chill", "Smug", "Chaotic", "Flexing", "Tired"] as const;

export function moodName(mood: number): string {
  return MOOD_NAMES[mood] ?? `Unknown(${mood})`;
}

/** Stable, sortable-per-chain event id. Order by blockNumber + logIndex, not timestamp. */
export function eventId(chainId: number, blockNumber: number, logIndex: number): string {
  return `${chainId}_${blockNumber}_${logIndex}`;
}

export interface DaemonFilterConfig {
  implementation: string; // lowercase
  tokenContract?: string; // lowercase; undefined = any token contract
  salt: string; // lowercase 32-byte hex
  chainId: number;
}

/** Reads ENVIO_* env vars. Throws when the implementation is missing: indexing every ERC-6551 account on Monad is never wanted. */
export function readFilterConfig(env: Record<string, string | undefined>): DaemonFilterConfig {
  const implementation = env.ENVIO_DAEMON_IMPLEMENTATION?.trim().toLowerCase();
  if (!implementation || !/^0x[0-9a-f]{40}$/.test(implementation)) {
    throw new Error("ENVIO_DAEMON_IMPLEMENTATION must be set to the DaemonAccount implementation address");
  }
  const chog = env.ENVIO_MOCK_CHOG?.trim().toLowerCase();
  if (chog && !/^0x[0-9a-f]{40}$/.test(chog)) throw new Error("ENVIO_MOCK_CHOG is not an address");
  const salt = (env.ENVIO_DAEMON_SALT?.trim() || ZERO_SALT).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(salt)) throw new Error("ENVIO_DAEMON_SALT must be 32-byte hex");
  return { implementation, tokenContract: chog || undefined, salt, chainId: MONAD_TESTNET_CHAIN_ID };
}

export interface AccountCreatedParams {
  account: string;
  implementation: string;
  salt: string;
  chainId: bigint;
  tokenContract: string;
  tokenId: bigint;
}

/**
 * Second-line check after the topic filter: non-indexed fields (salt, chainId) cannot be
 * filtered at the source. Rejects accounts bound to other chains, other salts or other
 * NFT collections, so the leaderboard only contains real Daemons.
 */
export function isDaemonAccount(p: AccountCreatedParams, cfg: DaemonFilterConfig): boolean {
  if (p.implementation.toLowerCase() !== cfg.implementation) return false;
  if (cfg.tokenContract && p.tokenContract.toLowerCase() !== cfg.tokenContract) return false;
  if (p.salt.toLowerCase() !== cfg.salt) return false;
  if (p.chainId !== BigInt(cfg.chainId)) return false;
  return true;
}

export interface DaemonShape {
  readonly id: string;
  readonly tokenId: bigint;
  readonly tokenContract: string;
  readonly implementation: string;
  readonly createdAtBlock: number;
  readonly createdAtTimestamp: number;
  readonly createdTxHash: string;
  /** NET yield = contract lifetimeYield() = sum of DaemonUpdate.yieldAmount. */
  readonly lifetimeYield: bigint;
  /** GROSS harvest = sum of Compounded.profit. */
  readonly grossHarvest: bigint;
  readonly totalBounties: bigint;
  readonly compoundCount: number;
  readonly hypeCount: number;
  readonly totalHypeMon: bigint;
  readonly totalHypeToken: bigint;
  readonly updateCount: number;
  readonly lastMood: number;
  readonly lastMoodName: string;
  readonly lastMessage: string;
  readonly lastUpdateAt: number | undefined;
  readonly lastCompoundAt: number | undefined;
  readonly lastCompoundBlock: number | undefined;
  readonly boostMultiplierBps: bigint;
  readonly boostExpiresAt: bigint;
  readonly allocatedAssets: bigint;
  readonly sweptCount: number;
  readonly lastSweptAt: number | undefined;
  readonly lastSweptTo: string | undefined;
}

export function newDaemon(init: {
  id: string;
  tokenId: bigint;
  tokenContract?: string;
  implementation?: string;
  block?: number;
  timestamp?: number;
  txHash?: string;
}): DaemonShape {
  return {
    id: init.id,
    tokenId: init.tokenId,
    tokenContract: init.tokenContract ?? "",
    implementation: init.implementation ?? "",
    createdAtBlock: init.block ?? 0,
    createdAtTimestamp: init.timestamp ?? 0,
    createdTxHash: init.txHash ?? "",
    lifetimeYield: 0n,
    grossHarvest: 0n,
    totalBounties: 0n,
    compoundCount: 0,
    hypeCount: 0,
    totalHypeMon: 0n,
    totalHypeToken: 0n,
    updateCount: 0,
    lastMood: 0,
    lastMoodName: moodName(0),
    lastMessage: "",
    lastUpdateAt: undefined,
    lastCompoundAt: undefined,
    lastCompoundBlock: undefined,
    boostMultiplierBps: 10_000n,
    boostExpiresAt: 0n,
    allocatedAssets: 0n,
    sweptCount: 0,
    lastSweptAt: undefined,
    lastSweptTo: undefined,
  };
}

/**
 * Compounded event: GROSS harvest and bounties. Does NOT touch lifetimeYield: the contract's lifetimeYield() is the
 * sum of net yield (profit + boostTopUp - bounty), which is only visible through DaemonUpdate.yieldAmount.
 */
export function applyCompounded<D extends DaemonShape>(d: D, profit: bigint, bounty: bigint, block: number, timestamp: number): D {
  return {
    ...d,
    grossHarvest: d.grossHarvest + profit,
    totalBounties: d.totalBounties + bounty,
    compoundCount: d.compoundCount + 1,
    lastCompoundAt: timestamp,
    lastCompoundBlock: block,
  };
}

/** DaemonUpdate event: mood/message, and the NET yield of the compound that emitted it (0 for hype updates). */
export function applyUpdate<D extends DaemonShape>(d: D, mood: number, message: string, yieldAmount: bigint, timestamp: number): D {
  return {
    ...d,
    lastMood: mood,
    lastMoodName: moodName(mood),
    lastMessage: message,
    lifetimeYield: d.lifetimeYield + yieldAmount,
    updateCount: d.updateCount + 1,
    lastUpdateAt: timestamp,
  };
}

export function applyHype<D extends DaemonShape>(d: D, token: string, amount: bigint): D {
  const isMon = token.toLowerCase() === ZERO_ADDRESS;
  return {
    ...d,
    hypeCount: d.hypeCount + 1,
    totalHypeMon: isMon ? d.totalHypeMon + amount : d.totalHypeMon,
    totalHypeToken: isMon ? d.totalHypeToken : d.totalHypeToken + amount,
  };
}

export function applyAllocation<D extends DaemonShape>(d: D, kind: "ALLOCATE" | "DEALLOCATE", assets: bigint): D {
  const next = kind === "ALLOCATE" ? d.allocatedAssets + assets : d.allocatedAssets - assets;
  return { ...d, allocatedAssets: next < 0n ? 0n : next };
}

export function applySweep<D extends DaemonShape>(d: D, to: string, timestamp: number): D {
  return { ...d, allocatedAssets: 0n, sweptCount: d.sweptCount + 1, lastSweptAt: timestamp, lastSweptTo: to };
}

// ---------- Keeper / Stats aggregates ----------

export interface KeeperShape {
  readonly id: string;
  readonly totalBounties: bigint;
  readonly compounds: number;
  readonly totalProfitCompounded: bigint;
  readonly firstCompoundAt: number;
  readonly lastCompoundAt: number;
}

/**
 * Keeper attribution. The Keeper entity is keyed by the Compounded event's `caller` field, which the contracts set to
 * the BOUNTY RECIPIENT (the keeper address when called through DaemonHub), not to the account call's msg.sender
 * (which is the hub). Never key by `transaction.from` or by msg.sender.
 */
export function keeperIdOf(caller: string): string {
  return caller.toLowerCase();
}

/** Applies one Compounded event to the (possibly absent) Keeper. `profit` is GROSS. */
export function applyKeeperCompound(existing: KeeperShape | undefined, caller: string, profit: bigint, bounty: bigint, timestamp: number): KeeperShape {
  return {
    id: keeperIdOf(caller),
    totalBounties: (existing?.totalBounties ?? 0n) + bounty,
    compounds: (existing?.compounds ?? 0) + 1,
    totalProfitCompounded: (existing?.totalProfitCompounded ?? 0n) + profit,
    firstCompoundAt: existing?.firstCompoundAt ?? timestamp,
    lastCompoundAt: timestamp,
  };
}

export interface StatsShape {
  readonly id: string;
  readonly daemonCount: number;
  readonly totalYield: bigint;
  readonly totalGrossHarvest: bigint;
  readonly totalBounties: bigint;
  readonly compoundCount: number;
  readonly hypeCount: number;
  readonly keeperCount: number;
}

export function emptyStats(): StatsShape {
  return { id: STATS_ID, daemonCount: 0, totalYield: 0n, totalGrossHarvest: 0n, totalBounties: 0n, compoundCount: 0, hypeCount: 0, keeperCount: 0 };
}

/** Compounded: gross harvest + bounties + counts. totalYield (net) is driven by DaemonUpdate. */
export function statsAfterCompound(s: StatsShape, profit: bigint, bounty: bigint, isNewKeeper: boolean): StatsShape {
  return {
    ...s,
    totalGrossHarvest: s.totalGrossHarvest + profit,
    totalBounties: s.totalBounties + bounty,
    compoundCount: s.compoundCount + 1,
    keeperCount: s.keeperCount + (isNewKeeper ? 1 : 0),
  };
}

/** DaemonUpdate: platform NET yield. */
export function statsAfterUpdate(s: StatsShape, yieldAmount: bigint): StatsShape {
  return { ...s, totalYield: s.totalYield + yieldAmount };
}

/** One Chog and its current holder (mirrors the Chog entity in schema.graphql). */
export interface ChogShape {
  readonly id: string;
  readonly tokenId: bigint;
  readonly owner: string;
  readonly mintedAtBlock: number;
  readonly mintedAtTimestamp: number;
  readonly transferCount: number;
}

/** Applies one Transfer: the first one is the mint; later ones only change the owner. Owner is stored lowercase. */
export function applyChogTransfer(
  existing: ChogShape | undefined,
  to: string,
  tokenId: bigint,
  blockNumber: number,
  timestamp: number,
): ChogShape {
  return {
    id: tokenId.toString(),
    tokenId,
    owner: to.toLowerCase(),
    mintedAtBlock: existing?.mintedAtBlock ?? blockNumber,
    mintedAtTimestamp: existing?.mintedAtTimestamp ?? timestamp,
    transferCount: (existing?.transferCount ?? 0) + 1,
  };
}

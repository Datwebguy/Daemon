import { isAddress, isHex, type Address, type Hex } from "viem";
import { monadTestnet } from "viem/chains";

/**
 * All addresses come from NEXT_PUBLIC_* env vars (see .env.example).
 * Each var must be read with a literal `process.env.NEXT_PUBLIC_X` so Next.js can inline it.
 * Invalid or empty values become `undefined`; the UI then shows a
 * "contracts not deployed yet" notice for the affected feature.
 */

function addr(value: string | undefined): Address | undefined {
  const v = value?.trim();
  if (!v || !isAddress(v)) return undefined;
  if (/^0x0{40}$/i.test(v)) return undefined;
  return v as Address;
}

function str(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function salt(value: string | undefined): Hex {
  const v = value?.trim();
  if (v && isHex(v) && v.length === 66) return v as Hex;
  return "0x0000000000000000000000000000000000000000000000000000000000000000";
}

export const CANONICAL_ERC6551_REGISTRY = "0x000000006551c19487814612e58FE06813775758" as const;

export const chain = monadTestnet;
export const CHAIN_ID = monadTestnet.id; // 10143

export const env = {
  /** Raw NEXT_PUBLIC_CHAIN_ID; empty / whitespace counts as unset (undefined). */
  configuredChainId: str(process.env.NEXT_PUBLIC_CHAIN_ID),
  rpcUrl: str(process.env.NEXT_PUBLIC_RPC_URL) ?? monadTestnet.rpcUrls.default.http[0],
  privyAppId: str(process.env.NEXT_PUBLIC_PRIVY_APP_ID),
  indexerUrl: str(process.env.NEXT_PUBLIC_INDEXER_URL),
  salt: salt(process.env.NEXT_PUBLIC_DAEMON_SALT),
} as const;

export const contracts = {
  registry: addr(process.env.NEXT_PUBLIC_REGISTRY) ?? (CANONICAL_ERC6551_REGISTRY as Address),
  accountImpl: addr(process.env.NEXT_PUBLIC_DAEMON_ACCOUNT_IMPL),
  strategyRegistry: addr(process.env.NEXT_PUBLIC_STRATEGY_REGISTRY),
  hub: addr(process.env.NEXT_PUBLIC_DAEMON_HUB),
  mockChog: addr(process.env.NEXT_PUBLIC_MOCK_CHOG),
  dusd: addr(process.env.NEXT_PUBLIC_DUSD),
  chogToken: addr(process.env.NEXT_PUBLIC_CHOG_TOKEN),
  stableVault: addr(process.env.NEXT_PUBLIC_STABLE_VAULT),
  degenVault: addr(process.env.NEXT_PUBLIC_DEGEN_VAULT),
  welcomeDrip: addr(process.env.NEXT_PUBLIC_WELCOME_DRIP),
} as const;

/** Minimum set needed to show a Daemon at all. */
export const coreReady = Boolean(contracts.mockChog);

export const missingCore: string[] = [
  !contracts.mockChog && "NEXT_PUBLIC_MOCK_CHOG",
  !contracts.accountImpl && "NEXT_PUBLIC_DAEMON_ACCOUNT_IMPL",
  !contracts.strategyRegistry && "NEXT_PUBLIC_STRATEGY_REGISTRY",
].filter((x): x is string => Boolean(x));

export const EXPLORER = "https://testnet.monadscan.com";
export const FAUCET_URL = "https://faucet.monad.xyz";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;

/** Public eth_getLogs on Monad is capped at 100-1,000 blocks; stay well inside. */
export const LOG_BLOCK_RANGE = BigInt(900);

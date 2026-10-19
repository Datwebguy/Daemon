"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getAddress, parseAbiItem, zeroAddress, type Address } from "viem";
import { useBalance, useBytecode, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { daemonAccountAbi, erc20Abi, erc6551RegistryAbi, mockChogAbi, strategyRegistryAbi, yieldSourceAbi } from "./abis";
import { CHAIN_ID, contracts, env, LOG_BLOCK_RANGE } from "./config";
import { isDecodeError, toBigIntSafe } from "./format";
import { gql, indexerConfigured, OWNED_QUERY } from "./indexer";
import { fetchIpfsJson, isIpfsUri } from "./ipfs";
import { cleanAttributes, imageSources, parseTokenUri, type TokenMetadata } from "./tokenUri";

export { useNow, useSlowNow } from "./clock";

const Z = zeroAddress;
/** Polling for the Daemon page the user is looking at. */
const REFRESH = 10_000;
/** Polling for background widgets (cards in a grid). */
const BACKGROUND = 60_000;
/** tokenURI is refetched at most this often. */
const TOKEN_URI_REFRESH = 60_000;

/** `live`: the caller is the active Daemon page (fast polling). List cards pass live=false. */
export type LiveOpt = { live?: boolean };

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const nonZero = (a: Address | undefined) => (a && a !== Z ? a : undefined);

/* ------------------------------------------------------------------ */
/* Protocol-wide config: registry Config, sources, token metadata     */
/* ------------------------------------------------------------------ */
export type TokenMeta = { address: Address; symbol: string; decimals: number };

export function useProtocol() {
  const reg = contracts.strategyRegistry;
  const regReads = useReadContracts({
    contracts: [
      { address: reg ?? Z, abi: strategyRegistryAbi, functionName: "config", chainId: CHAIN_ID },
      { address: reg ?? Z, abi: strategyRegistryAbi, functionName: "sources", chainId: CHAIN_ID },
    ],
    query: { enabled: Boolean(reg), staleTime: 60_000 },
  });
  const cfg = regReads.data?.[0]?.result;
  const registrySources = regReads.data?.[1]?.result;
  const sourcesLoaded = !reg || registrySources !== undefined;

  /** Only sources listed by StrategyRegistry.sources() are approved / depositable. */
  const sources = useMemo(() => {
    const seen = new Set<string>();
    return [...(registrySources ?? [])].filter((a) => {
      const k = a.toLowerCase();
      if (seen.has(k) || a === Z) return false;
      seen.add(k);
      return true;
    });
  }, [registrySources]);

  /** Env-configured vaults the registry doesn't list: shown as unapproved, deposits disabled. */
  const unlistedSources = useMemo(() => {
    if (!sourcesLoaded) return [];
    const out: Address[] = [];
    for (const v of [contracts.stableVault, contracts.degenVault]) {
      if (v && !sources.some((s) => same(s, v)) && !out.some((o) => same(o, v))) out.push(v);
    }
    return out;
  }, [sources, sourcesLoaded]);

  // On-chain truth: asset / $CHOG come from StrategyRegistry.config(). Env values are only a
  // cross-check, or a fallback when no registry is configured at all (flagged as unverified).
  const onchainAsset = nonZero(cfg?.asset);
  const onchainChog = nonZero(cfg?.chog);
  const assetAddr = reg ? onchainAsset : contracts.dusd;
  const chogAddr = reg ? onchainChog : contracts.chogToken;

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!reg && (contracts.dusd || contracts.chogToken)) {
      w.push("NEXT_PUBLIC_STRATEGY_REGISTRY is not set, so token addresses come from env and are unverified.");
    }
    if (cfg) {
      if (contracts.dusd && !same(contracts.dusd, onchainAsset)) {
        w.push(
          `NEXT_PUBLIC_DUSD (${contracts.dusd}) differs from StrategyRegistry.config().asset (${onchainAsset ?? "unset"}); using the on-chain value.`,
        );
      }
      if (contracts.chogToken && !same(contracts.chogToken, onchainChog)) {
        w.push(
          `NEXT_PUBLIC_CHOG_TOKEN (${contracts.chogToken}) differs from StrategyRegistry.config().chog (${onchainChog ?? "unset"}); using the on-chain value.`,
        );
      }
    }
    for (const v of unlistedSources) {
      w.push(`Vault ${v} (from env) is not listed in StrategyRegistry.sources(); deposits to it are disabled.`);
    }
    return w;
  }, [reg, cfg, onchainAsset, onchainChog, unlistedSources]);

  const meta = useReadContracts({
    contracts: [
      { address: assetAddr ?? Z, abi: erc20Abi, functionName: "symbol", chainId: CHAIN_ID },
      { address: assetAddr ?? Z, abi: erc20Abi, functionName: "decimals", chainId: CHAIN_ID },
      { address: chogAddr ?? Z, abi: erc20Abi, functionName: "symbol", chainId: CHAIN_ID },
      { address: chogAddr ?? Z, abi: erc20Abi, functionName: "decimals", chainId: CHAIN_ID },
    ],
    query: { enabled: Boolean(assetAddr || chogAddr), staleTime: 300_000 },
  });

  const asset: TokenMeta | undefined = assetAddr
    ? {
        address: assetAddr,
        symbol: meta.data?.[0]?.result ?? "dUSD",
        decimals: meta.data?.[1]?.result ?? 18,
      }
    : undefined;
  const chog: TokenMeta | undefined = chogAddr
    ? {
        address: chogAddr,
        symbol: meta.data?.[2]?.result ?? "CHOG",
        decimals: meta.data?.[3]?.result ?? 18,
      }
    : undefined;

  return {
    config: cfg,
    /** approved sources (StrategyRegistry.sources()) */
    sources,
    /** env vaults not in the registry (unapproved; withdraw-only) */
    unlistedSources,
    asset,
    chog,
    warnings,
    isLoading: regReads.isLoading,
    error: regReads.error ?? (regReads.data?.[0]?.status === "failure" ? regReads.data[0].error : null),
  };
}

/* ------------------------------------------------------------------ */
/* Daemon (ERC-6551) address                                           */
/* ------------------------------------------------------------------ */
export function useDaemonAddress(tokenId: bigint | undefined, { live = true }: LiveOpt = {}) {
  const chog = contracts.mockChog;
  const impl = contracts.accountImpl;
  const viaRegistry = useReadContract({
    address: contracts.registry,
    abi: erc6551RegistryAbi,
    functionName: "account",
    args: [impl ?? Z, env.salt, BigInt(CHAIN_ID), chog ?? Z, tokenId ?? BigInt(0)],
    chainId: CHAIN_ID,
    query: { enabled: Boolean(chog && impl && tokenId !== undefined), staleTime: Infinity },
  });
  const viaChog = useReadContract({
    address: chog ?? Z,
    abi: mockChogAbi,
    functionName: "daemonOf",
    args: [tokenId ?? BigInt(0)],
    chainId: CHAIN_ID,
    query: { enabled: Boolean(chog && !impl && tokenId !== undefined), staleTime: Infinity },
  });
  const address = (impl ? viaRegistry.data : viaChog.data) as Address | undefined;
  const code = useBytecode({
    address: address ?? Z,
    chainId: CHAIN_ID,
    query: {
      enabled: Boolean(address && address !== Z),
      // Code never disappears once deployed. Until then keep polling (slower) so an activation
      // by someone else shows up without a reload.
      refetchInterval: (q) => (q.state.data && q.state.data !== "0x" ? false : live ? 15_000 : BACKGROUND),
    },
  });
  return {
    address: address && address !== Z ? address : undefined,
    deployed: Boolean(code.data && code.data !== "0x"),
    isLoading: viaRegistry.isLoading || viaChog.isLoading || code.isLoading,
    error: (impl ? viaRegistry.error : viaChog.error) ?? null,
    canCreate: Boolean(impl && chog),
    refetchCode: code.refetch,
  };
}

/* ------------------------------------------------------------------ */
/* Chog NFT reads                                                      */
/* ------------------------------------------------------------------ */
export function useChog(tokenId: bigint | undefined, { live = true }: LiveOpt = {}) {
  const chog = contracts.mockChog;
  const id = tokenId ?? BigInt(0);
  const enabled = Boolean(chog && tokenId !== undefined);
  // ownerOf in a multicall so an unminted id is a per-call "failure" (exists=false), not a hook error.
  const ownerRead = useReadContracts({
    contracts: [{ address: chog ?? Z, abi: mockChogAbi, functionName: "ownerOf", args: [id], chainId: CHAIN_ID }],
    query: { enabled, refetchInterval: live ? REFRESH : BACKGROUND },
  });
  const ownerRes = ownerRead.data?.[0];
  // tokenURI: fetched rarely and never on the fast poll.
  const art = useReadContracts({
    contracts: [
      { address: chog ?? Z, abi: mockChogAbi, functionName: "tokenURI", args: [id], chainId: CHAIN_ID },
      { address: chog ?? Z, abi: mockChogAbi, functionName: "traitsOf", args: [id], chainId: CHAIN_ID },
    ],
    query: {
      enabled: enabled && ownerRes?.status === "success",
      staleTime: TOKEN_URI_REFRESH,
      refetchInterval: TOKEN_URI_REFRESH,
    },
  });
  const uri = art.data?.[0]?.result;
  const remote = isIpfsUri(uri);
  // On-chain (data:) metadata is parsed locally; hosted metadata is fetched without ever blocking the page.
  const inline = useMemo(() => (remote ? undefined : parseTokenUri(uri)), [uri, remote]);
  const hosted = useQuery({
    queryKey: ["chog-metadata", uri],
    queryFn: () => fetchIpfsJson<TokenMetadata>(uri as string),
    enabled: remote,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const raw = remote ? hosted.data : inline;
  const images = useMemo(() => imageSources(raw?.image), [raw?.image]);
  const attributes = useMemo(() => cleanAttributes(raw?.attributes), [raw?.attributes]);
  const metadata = useMemo(() => (raw ? { ...raw, image: images[0] } : undefined), [raw, images]);
  return {
    owner: ownerRes?.result,
    exists: ownerRes ? ownerRes.status === "success" : undefined,
    metadata,
    /** First image URL (https or data:). */
    image: images[0],
    /** Every URL to try for the image, in order; step through with onError. */
    images,
    /** Real Chog Genesis traits ({ trait_type, value }), empty until loaded. */
    attributes,
    /** e.g. "CHOG #1462" */
    realName: raw?.name,
    /** True while the art/trait file is still loading (never blocks the page). */
    metaLoading: remote ? hosted.isLoading : false,
    traits: art.data?.[1]?.result,
    isLoading: ownerRead.isLoading,
    error: ownerRead.error,
  };
}

/* ------------------------------------------------------------------ */
/* Daemon account state                                                */
/* ------------------------------------------------------------------ */
type ReadResult = { status: "success" | "failure"; error?: unknown };

/** Separates ABI/decode failures (config problem) from transient RPC failures. */
function classifyFailures(d: readonly ReadResult[] | undefined) {
  const failed = d?.filter((x) => x.status === "failure") ?? [];
  const decode = failed.filter((x) => isDecodeError(x.error)).length;
  return { failures: failed.length, decodeFailures: decode, transientFailures: failed.length - decode };
}

/** Full state for the active Daemon page (10s polling). */
export function useDaemonState(account: Address | undefined, enabled: boolean) {
  const a = account ?? Z;
  const base = { address: a, abi: daemonAccountAbi, chainId: CHAIN_ID } as const;
  const r = useReadContracts({
    contracts: [
      { ...base, functionName: "owner" },
      { ...base, functionName: "getMood" },
      { ...base, functionName: "lastMessage" },
      { ...base, functionName: "getBoost" },
      { ...base, functionName: "pendingProfit" },
      { ...base, functionName: "pendingBounty" },
      { ...base, functionName: "lastCompoundAt" },
      { ...base, functionName: "lastActivityAt" },
      { ...base, functionName: "totalAssets" },
      { ...base, functionName: "lifetimeYield" },
      { ...base, functionName: "nextCompoundAt" },
      { ...base, functionName: "heldSources" },
      { ...base, functionName: "lastHypeAt" },
    ],
    query: { enabled: enabled && Boolean(account), refetchInterval: REFRESH },
  });
  const d = r.data;
  const boost = d?.[3]?.result;
  return {
    owner: d?.[0]?.result,
    mood: d?.[1]?.result,
    lastMessage: d?.[2]?.result,
    boost: boost
      ? { multiplierBps: boost[0], expiresAt: boost[1], potMon: boost[2], potChog: boost[3] }
      : undefined,
    pendingProfit: d?.[4]?.result,
    /** Estimate only: the view prices gas at basefee for eth_call; the paid bounty may differ. */
    pendingBounty: d?.[5]?.result,
    lastCompoundAt: d?.[6]?.result,
    lastActivityAt: d?.[7]?.result,
    totalAssets: d?.[8]?.result,
    lifetimeYield: d?.[9]?.result,
    /** anchor + cooldown; the anchor is the first allocation time before any compound. */
    nextCompoundAt: d?.[10]?.result,
    heldSources: d?.[11]?.result,
    lastHypeAt: d?.[12]?.result,
    ...classifyFailures(d),
    isLoading: r.isLoading,
    error: r.error,
  };
}

/** Light read for list cards: mood, boost expiry, total assets (slow polling). */
export function useDaemonSummary(account: Address | undefined, enabled: boolean) {
  const a = account ?? Z;
  const base = { address: a, abi: daemonAccountAbi, chainId: CHAIN_ID } as const;
  const r = useReadContracts({
    contracts: [
      { ...base, functionName: "getMood" },
      { ...base, functionName: "getBoost" },
      { ...base, functionName: "totalAssets" },
    ],
    query: { enabled: enabled && Boolean(account), refetchInterval: BACKGROUND, staleTime: 30_000 },
  });
  const boost = r.data?.[1]?.result;
  return {
    mood: r.data?.[0]?.result,
    boostExpiresAt: boost ? boost[1] : undefined,
    totalAssets: r.data?.[2]?.result,
    isLoading: r.isLoading,
  };
}

/** Balances (MON, base asset, $CHOG) of any address. */
export function useBalances(holder: Address | undefined, asset?: Address, chog?: Address, { live = true }: LiveOpt = {}) {
  const interval = live ? REFRESH : BACKGROUND;
  const mon = useBalance({ address: holder, chainId: CHAIN_ID, query: { enabled: Boolean(holder), refetchInterval: interval } });
  const r = useReadContracts({
    contracts: [
      { address: asset ?? Z, abi: erc20Abi, functionName: "balanceOf", args: [holder ?? Z], chainId: CHAIN_ID },
      { address: chog ?? Z, abi: erc20Abi, functionName: "balanceOf", args: [holder ?? Z], chainId: CHAIN_ID },
    ],
    query: { enabled: Boolean(holder && (asset || chog)), refetchInterval: interval },
  });
  return {
    mon: mon.data?.value,
    asset: asset ? r.data?.[0]?.result : undefined,
    chog: chog ? r.data?.[1]?.result : undefined,
    isLoading: mon.isLoading || r.isLoading,
  };
}

/* ------------------------------------------------------------------ */
/* Per-source positions                                                */
/* ------------------------------------------------------------------ */
export type Position = {
  source: Address;
  label: string;
  /** listed by StrategyRegistry.sources() (deposits allowed) */
  approved: boolean;
  shares: bigint;
  assets: bigint;
  pendingRewards: bigint;
  /** rewardToken() of the source, with its on-chain symbol/decimals once loaded */
  reward?: { address: Address; symbol?: string; decimals?: number };
  cap?: bigint;
};

export function usePositions(account: Address | undefined, approved: Address[], unlisted: Address[], enabled: boolean) {
  const sources = useMemo(() => [...approved, ...unlisted], [approved, unlisted]);
  const holder = account ?? Z;
  const on = enabled && Boolean(account) && sources.length > 0;
  const labels = useReadContracts({
    contracts: sources.map((s) => ({ address: s, abi: yieldSourceAbi, functionName: "riskLabel", chainId: CHAIN_ID }) as const),
    query: { enabled: sources.length > 0, staleTime: 300_000 },
  });
  const rewardTokenReads = useReadContracts({
    contracts: sources.map((s) => ({ address: s, abi: yieldSourceAbi, functionName: "rewardToken", chainId: CHAIN_ID }) as const),
    query: { enabled: sources.length > 0, staleTime: 300_000 },
  });
  const rewardKey = sources.map((_, i) => rewardTokenReads.data?.[i]?.result ?? "").join(",");
  const uniqueRewards = useMemo(() => {
    const out: Address[] = [];
    for (const t of rewardKey.split(",")) {
      const a = nonZero(t ? (t as Address) : undefined);
      if (a && !out.some((o) => same(o, a))) out.push(a);
    }
    return out;
  }, [rewardKey]);
  const rewardSymbols = useReadContracts({
    contracts: uniqueRewards.map((t) => ({ address: t, abi: erc20Abi, functionName: "symbol", chainId: CHAIN_ID }) as const),
    query: { enabled: uniqueRewards.length > 0, staleTime: 300_000 },
  });
  const rewardDecimals = useReadContracts({
    contracts: uniqueRewards.map((t) => ({ address: t, abi: erc20Abi, functionName: "decimals", chainId: CHAIN_ID }) as const),
    query: { enabled: uniqueRewards.length > 0, staleTime: 300_000 },
  });
  const shares = useReadContracts({
    contracts: sources.map(
      (s) => ({ address: s, abi: yieldSourceAbi, functionName: "balanceOf", args: [holder], chainId: CHAIN_ID }) as const,
    ),
    query: { enabled: on, refetchInterval: REFRESH },
  });
  const rewards = useReadContracts({
    contracts: sources.map(
      (s) => ({ address: s, abi: yieldSourceAbi, functionName: "pendingRewards", args: [holder], chainId: CHAIN_ID }) as const,
    ),
    query: { enabled: on, refetchInterval: REFRESH },
  });
  const caps = useReadContracts({
    contracts: sources.map(
      (s) =>
        ({
          address: contracts.strategyRegistry ?? Z,
          abi: strategyRegistryAbi,
          functionName: "capPerAccount",
          args: [s],
          chainId: CHAIN_ID,
        }) as const,
    ),
    query: { enabled: Boolean(contracts.strategyRegistry) && sources.length > 0, staleTime: 300_000 },
  });
  const shareVals = sources.map((_, i) => shares.data?.[i]?.result ?? BigInt(0));
  const assets = useReadContracts({
    contracts: sources.map(
      (s, i) =>
        ({ address: s, abi: yieldSourceAbi, functionName: "convertToAssets", args: [shareVals[i] ?? BigInt(0)], chainId: CHAIN_ID }) as const,
    ),
    query: { enabled: on && Boolean(shares.data), refetchInterval: REFRESH },
  });

  const positions: Position[] = sources.map((s, i) => {
    const raw = labels.data?.[i]?.result;
    const fallback = same(s, contracts.stableVault) ? "Stable" : same(s, contracts.degenVault) ? "Degen" : "Vault";
    const rt = nonZero(rewardTokenReads.data?.[i]?.result);
    const ri = rt ? uniqueRewards.findIndex((u) => same(u, rt)) : -1;
    return {
      source: s,
      label: raw && raw.length > 0 ? raw : fallback,
      approved: i < approved.length,
      shares: shareVals[i] ?? BigInt(0),
      assets: assets.data?.[i]?.result ?? BigInt(0),
      pendingRewards: rewards.data?.[i]?.result ?? BigInt(0),
      reward: rt
        ? {
            address: rt,
            symbol: ri >= 0 ? rewardSymbols.data?.[ri]?.result : undefined,
            decimals: ri >= 0 ? rewardDecimals.data?.[ri]?.result : undefined,
          }
        : undefined,
      cap: caps.data?.[i]?.result,
    };
  });

  return {
    positions,
    isLoading: labels.isLoading || shares.isLoading,
    error: shares.error ?? labels.error,
  };
}

/* ------------------------------------------------------------------ */
/* Owned Chogs                                                         */
/* ------------------------------------------------------------------ */
const rememberKey = (owner: string) => `daemon-chogs-${CHAIN_ID}-${owner.toLowerCase()}`;

export function rememberChog(owner: string, tokenId: bigint) {
  try {
    const k = rememberKey(owner);
    const prev = JSON.parse(localStorage.getItem(k) ?? "[]") as unknown;
    const list = Array.isArray(prev) ? prev.filter((x): x is string => typeof x === "string") : [];
    if (!list.includes(tokenId.toString())) localStorage.setItem(k, JSON.stringify([...list, tokenId.toString()]));
  } catch {
    /* storage unavailable */
  }
}

function remembered(owner: string): bigint[] {
  try {
    const raw = JSON.parse(localStorage.getItem(rememberKey(owner)) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => toBigIntSafe(x)).filter((x): x is bigint => x !== undefined && x >= BigInt(0));
  } catch {
    return [];
  }
}

export type OwnedResult = {
  ids: bigint[];
  balance: bigint;
  method: "indexer" | "logs";
  /** true when we could not find every token the balance says the owner holds */
  partial: boolean;
};

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

/**
 * MockChog is NOT ERC721Enumerable (no tokenOfOwnerByIndex), so candidates come from the
 * indexer, else a small recent Transfer-log window, plus ids minted from this browser.
 * Every candidate is then verified with ownerOf.
 */
export function useOwnedChogs(owner: Address | undefined) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const chog = contracts.mockChog;
  return useQuery({
    queryKey: ["owned-chogs", chog, owner],
    enabled: Boolean(owner && chog && client),
    refetchInterval: 30_000,
    queryFn: async (): Promise<OwnedResult> => {
      const method0: OwnedResult["method"] = indexerConfigured ? "indexer" : "logs";
      if (!owner || !chog || !client) return { ids: [], balance: BigInt(0), method: method0, partial: false };
      const balance = await client.readContract({ address: chog, abi: mockChogAbi, functionName: "balanceOf", args: [owner] });
      if (balance === BigInt(0)) return { ids: [], balance, method: method0, partial: false };

      let method: OwnedResult["method"] = "logs";
      const candidates = new Set<bigint>(remembered(owner));
      if (indexerConfigured) {
        try {
          const data = await gql<{ Daemon: { tokenId: unknown }[] }>(OWNED_QUERY, { owner });
          for (const d of Array.isArray(data.Daemon) ? data.Daemon : []) {
            const id = toBigIntSafe(d?.tokenId);
            if (id !== undefined && id >= BigInt(0)) candidates.add(id);
          }
          method = "indexer";
        } catch {
          /* fall through to logs */
        }
      }
      if (method === "logs") {
        try {
          const latest = await client.getBlockNumber();
          const fromBlock = latest > LOG_BLOCK_RANGE ? latest - LOG_BLOCK_RANGE : BigInt(0);
          const logs = await client.getLogs({ address: chog, event: transferEvent, args: { to: owner }, fromBlock, toBlock: latest });
          logs.forEach((l) => l.args.tokenId !== undefined && candidates.add(l.args.tokenId));
        } catch {
          /* RPC may reject the range; remembered ids still work */
        }
      }

      const list = [...candidates].slice(0, 500);
      if (list.length === 0) return { ids: [], balance, method, partial: true };
      const owners = await client.multicall({
        contracts: list.map((id) => ({ address: chog, abi: mockChogAbi, functionName: "ownerOf" as const, args: [id] as const })),
      });
      const ids = list
        .filter((_, i) => {
          const o = owners[i];
          return o?.status === "success" && getAddress(o.result as Address) === getAddress(owner);
        })
        .sort((x, y) => (x < y ? -1 : 1));
      return { ids, balance, method, partial: BigInt(ids.length) < balance };
    },
  });
}

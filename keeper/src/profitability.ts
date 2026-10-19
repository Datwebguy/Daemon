const BPS = 10_000n;
const WEI_PER_MON = 10n ** 18n;

/**
 * Monad charges gas_limit * gas_price (not gas used), so the limit must be tight:
 * estimate + a small margin, rounded up, never above `maxGasLimit`.
 * Returns undefined if the padded limit would exceed the cap.
 */
export function gasLimitFromEstimate(estimate: bigint, marginBps: number, maxGasLimit: bigint): bigint | undefined {
  if (estimate <= 0n) throw new Error("gas estimate must be positive");
  const padded = ceilDiv(estimate * (BPS + BigInt(marginBps)), BPS);
  return padded > maxGasLimit ? undefined : padded;
}

/** Worst-case native cost in wei of a tx with this gas limit. */
export function worstCaseCostWei(gasLimit: bigint, maxFeePerGas: bigint): bigint {
  return gasLimit * maxFeePerGas;
}

/** Converts wei to asset base units, rounding UP (conservative). monPriceInAsset = asset units per 1 MON. */
export function weiToAsset(wei: bigint, monPriceInAsset: bigint): bigint {
  return ceilDiv(wei * monPriceInAsset, WEI_PER_MON);
}

export interface ProfitInput {
  bounty: bigint; // asset base units the caller will receive (from simulation)
  gasLimit: bigint;
  maxFeePerGas: bigint; // wei
  monPriceInAsset: bigint; // asset base units per 1 MON
  minProfitMarginBps: number; // bounty must exceed cost by this margin
}

export interface ProfitDecision {
  profitable: boolean;
  costWei: bigint;
  costAsset: bigint;
  requiredBounty: bigint; // cost * (1 + margin)
  netAsset: bigint; // bounty - cost (may be negative)
  reason: string;
}

/**
 * Send only if the simulated bounty strictly exceeds the worst-case gas cost
 * (gasLimit * maxFeePerGas, priced in asset) plus a safety margin.
 */
export function evaluateProfit(i: ProfitInput): ProfitDecision {
  const costWei = worstCaseCostWei(i.gasLimit, i.maxFeePerGas);
  const costAsset = weiToAsset(costWei, i.monPriceInAsset);
  const requiredBounty = ceilDiv(costAsset * (BPS + BigInt(i.minProfitMarginBps)), BPS);
  const netAsset = i.bounty - costAsset;
  let profitable = i.bounty > costAsset && i.bounty >= requiredBounty;
  let reason = profitable ? "bounty exceeds gas cost + margin" : "bounty below gas cost + margin";
  if (i.bounty <= 0n) {
    profitable = false;
    reason = "zero bounty";
  }
  return { profitable, costWei, costAsset, requiredBounty, netAsset, reason };
}

function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error("division by non-positive");
  if (a <= 0n) return a / b;
  return (a + b - 1n) / b;
}

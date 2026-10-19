import { errorMessage } from "./format";

/**
 * Plain-language explanations for everything the contracts can refuse.
 * Keys are Solidity custom-error names; viem surfaces them in error messages / causes.
 */
const FRIENDLY: Record<string, string> = {
  CooldownActive: "Your Daemon is still resting from its last harvest. Try again when the timer runs out.",
  InsufficientProfit: "Not enough has grown yet to make a harvest worth it. Give it a little more time.",
  HypeUserCooldown: "You hyped this Daemon recently. You can cheer it on again soon.",
  HypeDaemonCooldown: "This Daemon was just hyped. It needs a short breather first.",
  HypeTooSmall: "That hype is below the minimum. Add a little more.",
  ChogDisabled: "Hyping with CHOG isn't available right now. Try MON instead.",
  CapExceeded: "That vault is full for this Daemon. Try a smaller amount or another vault.",
  SourceNotApproved: "That vault isn't open for deposits.",
  TooManySources: "Your Daemon is already using the maximum number of vaults. Empty one first.",
  AssetMismatch: "That vault doesn't accept this token.",
  NotOwner: "Only the person holding this Chog can do that.",
  ZeroAmount: "Enter an amount greater than zero.",
  MintLimitReached: "You've minted the maximum number of test Chogs for one wallet.",
  MaxSupplyReached: "All test Chogs have been minted.",
  ChogCannotOwnChog: "A Chog can't be sent into a Daemon's wallet. That would lock it away forever.",
  OwnershipCycle: "A Chog can't be sent into its own Daemon's wallet.",
  ForbiddenSelector: "For your safety, Daemons can't grant spending permissions to anyone.",
  SlippageExceeded: "Prices moved too much during the swap. Please try again in a moment.",
  InsufficientOutput: "Prices moved too much during the swap. Please try again in a moment.",
  NoLiquidity: "There isn't enough liquidity to swap right now. Try again later.",
  PriceNotSet: "Prices are temporarily unavailable. Try again later.",
  BatchTooLarge: "That's too many Daemons for one harvest round. Use 50 or fewer.",
  InvalidOperation: "That action isn't supported.",
};

/** Turns any wallet/contract error into one short sentence a person can act on. */
export function friendlyError(err: unknown): string {
  const raw = collect(err);
  for (const name of Object.keys(FRIENDLY)) {
    if (raw.includes(name)) return FRIENDLY[name]!;
  }
  if (/insufficient funds|exceeds the balance|gas required exceeds/i.test(raw))
    return "Your wallet doesn't have enough MON to cover this. Top up from the faucet and try again.";
  if (/reject|denied|cancel/i.test(raw)) return "You cancelled this in your wallet.";
  if (/network|fetch|timeout|429|rate limit/i.test(raw)) return "The network is busy. Please try again in a moment.";
  if (/chain|network mismatch/i.test(raw)) return "Switch your wallet to Monad and try again.";
  return "Something went wrong. Please try again.";
}

export const isUserRejection = (err: unknown) => /reject|denied|cancel/i.test(collect(err));

function collect(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let i = 0; e && i < 8; i++) {
    if (typeof e === "object") {
      const o = e as { name?: string; shortMessage?: string; message?: string; details?: string; data?: { errorName?: string }; cause?: unknown };
      parts.push(o.name ?? "", o.shortMessage ?? "", o.message ?? "", o.details ?? "", o.data?.errorName ?? "");
      e = o.cause;
    } else {
      parts.push(String(e));
      break;
    }
  }
  if (parts.length === 0) parts.push(errorMessage(err));
  return parts.join(" ");
}

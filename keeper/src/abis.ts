// ABIs generated from the Foundry build (contracts/out).
// Regenerate after contract changes: `cd contracts && forge build && node script/export-abis.mjs`.
//
// The deployed DaemonHub has exactly one batching entry point, `compoundMany(address[])`, which calls
// `compound(msg.sender)` on each account. There is no recipient-forwarding variant; the former
// HUB_RECIPIENT_ARG / daemonHubWithRecipientAbi path was removed (config now rejects HUB_RECIPIENT_ARG=true).
export {
  erc6551RegistryAbi,
  daemonAccountAbi,
  daemonHubAbi,
  mockChogAbi,
  priceOracleAbi,
} from "./abis.generated.js";

/** DaemonHub.MAX_BATCH: compoundMany / pendingBounties revert with BatchTooLarge above this. */
export const HUB_MAX_BATCH = 50;

/** Monad per-transaction gas limit. A tx with a higher limit is rejected. */
export const MONAD_TX_GAS_LIMIT = 30_000_000n;

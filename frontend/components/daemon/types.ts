import type { Address } from "viem";
import type { useDaemonState, useProtocol } from "@/lib/hooks";

export type Protocol = ReturnType<typeof useProtocol>;
export type DaemonState = ReturnType<typeof useDaemonState>;

export type DaemonCtx = {
  tokenId: bigint;
  account: Address;
  deployed: boolean;
  user?: Address;
  isOwner: boolean;
  protocol: Protocol;
  state: DaemonState;
};

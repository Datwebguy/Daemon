import type { Address, Chain, Hash, Hex, PublicClient, TransactionReceipt, Transport } from "viem";

/** The subset of a viem PublicClient the keeper uses (easy to mock in tests). */
export type ReadClient = Pick<
  PublicClient<Transport, Chain>,
  "readContract" | "multicall" | "call" | "estimateGas" | "estimateFeesPerGas" | "getBlockNumber"
>;

export interface TxRequest {
  to: Address;
  data: Hex;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/**
 * Signs + broadcasts transactions; owns nonce handling.
 * `send` signs locally first, so the hash is known before broadcast. If the broadcast fails, the thrown error
 * carries that hash as `txHash` (see SendError), which lets the keeper wait for an "already known" tx instead of
 * resending it.
 */
export interface TxSender {
  readonly address: Address;
  send(tx: TxRequest): Promise<Hash>;
  waitForReceipt(hash: Hash, timeoutMs: number): Promise<TransactionReceipt>;
}

/** Broadcast error that remembers the hash of the transaction we signed. */
export class SendError extends Error {
  override name = "SendError";
  constructor(
    message: string,
    readonly txHash: Hash | undefined,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface DaemonTarget {
  account: Address;
  tokenId?: bigint;
}

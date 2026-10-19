"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Hash, TransactionReceipt } from "viem";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Config } from "wagmi";
import { CHAIN_ID, txUrl } from "./config";
import { errorMessage } from "./format";

function ExplorerLink({ hash }: { hash: Hash }) {
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="underline font-medium">
      View on Monadscan ↗
    </a>
  );
}

/** Broadcast, but we couldn't confirm the receipt (RPC hiccup / timeout). The tx may still land. */
export type UnknownTx = { status: "unknown"; transactionHash: Hash };
export type TxResult = TransactionReceipt | UnknownTx | undefined;

/**
 * Runs a write with toasts: "confirm in wallet" -> "pending" (explorer link) -> success/fail.
 * `send` receives the wagmi config and must return the tx hash. Callers simulate first
 * (wagmi `simulateContract`) so reverts surface before signing; gas is left to the
 * wallet's estimate (Monad charges the gas *limit*, so no inflated manual limits).
 *
 * If the tx was broadcast but waiting for its receipt throws, the result is `{ status: "unknown" }`
 * and the toast says "submitted, confirmation unknown" (with the explorer link), never "failed".
 */
export function useTx() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const { chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async (
      label: string,
      send: (config: Config) => Promise<Hash>,
      opts?: { onSuccess?: (r: TransactionReceipt) => void },
    ): Promise<TxResult> => {
      if (!isConnected) {
        toast.error("Sign in first");
        return undefined;
      }
      const id = toast.loading(`${label}: confirm in your wallet…`);
      setPending(label);
      let hash: Hash | undefined;
      try {
        if (chainId !== CHAIN_ID) {
          toast.loading(`${label}: switching to Monad Testnet…`, { id });
          await switchChainAsync({ chainId: CHAIN_ID });
        }
        hash = await send(config);
      } catch (err) {
        const msg = errorMessage(err);
        const rejected = /reject|denied|cancel/i.test(msg);
        toast.error(rejected ? `${label}: cancelled` : `${label} failed`, {
          id,
          description: rejected ? undefined : msg.slice(0, 280),
        });
        setPending(null);
        return undefined;
      }

      const sent = hash;
      try {
        toast.loading(`${label}: pending…`, { id, description: <ExplorerLink hash={sent} /> });
        let receipt: TransactionReceipt;
        try {
          receipt = await waitForTransactionReceipt(config, { hash: sent, chainId: CHAIN_ID });
        } catch {
          // Broadcast succeeded; only the confirmation lookup failed. Don't claim failure.
          toast.warning(`${label}: submitted, confirmation unknown`, {
            id,
            description: (
              <span>
                Check the explorer before retrying. <ExplorerLink hash={sent} />
              </span>
            ),
          });
          void queryClient.invalidateQueries();
          // Refetch again a bit later in case it lands after the lookup gave up.
          setTimeout(() => void queryClient.invalidateQueries(), 15_000);
          return { status: "unknown", transactionHash: sent };
        }
        if (receipt.status === "success") {
          toast.success(`${label}: confirmed`, { id, description: <ExplorerLink hash={sent} /> });
          try {
            opts?.onSuccess?.(receipt);
          } catch {
            /* a UI follow-up failing must not turn a confirmed tx into an error */
          }
        } else {
          toast.error(`${label}: reverted`, { id, description: <ExplorerLink hash={sent} /> });
        }
        await queryClient.invalidateQueries();
        return receipt;
      } finally {
        setPending(null);
      }
    },
    [config, queryClient, chainId, isConnected, switchChainAsync],
  );

  return { run, pending, busy: pending !== null };
}

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Hash, TransactionReceipt } from "viem";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Config } from "wagmi";
import { CHAIN_ID, txUrl } from "./config";
import { friendlyError, isUserRejection } from "./errors";

function ReceiptLink({ hash }: { hash: Hash }) {
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="font-medium underline">
      View receipt
    </a>
  );
}

/** Sent, but we couldn't confirm it yet (network hiccup). It may still go through. */
export type UnknownTx = { status: "unknown"; transactionHash: Hash };
export type TxResult = TransactionReceipt | UnknownTx | undefined;

/**
 * Runs a wallet action with friendly toasts: "approve in your wallet" -> "working on it" -> done.
 * Callers simulate first so problems surface before anyone signs. Errors are translated into
 * plain language (see lib/errors.ts). Gas is left to the wallet's estimate.
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
      opts?: { onSuccess?: (r: TransactionReceipt) => void; done?: string },
    ): Promise<TxResult> => {
      if (!isConnected) {
        toast.error("Sign in first", { description: "Connect to start using your Daemon." });
        return undefined;
      }
      const id = toast.loading(label, { description: "Approve it in your wallet…" });
      setPending(label);
      let hash: Hash | undefined;
      try {
        if (chainId !== CHAIN_ID) {
          toast.loading(label, { id, description: "Switching your wallet to Monad…" });
          await switchChainAsync({ chainId: CHAIN_ID });
        }
        hash = await send(config);
      } catch (err) {
        if (isUserRejection(err)) toast.message(`${label} cancelled`, { id, description: undefined });
        else toast.error(`Couldn't ${label.toLowerCase()}`, { id, description: friendlyError(err) });
        setPending(null);
        return undefined;
      }

      const sent = hash;
      try {
        toast.loading(label, { id, description: "Working on it…" });
        let receipt: TransactionReceipt;
        try {
          receipt = await waitForTransactionReceipt(config, { hash: sent, chainId: CHAIN_ID });
        } catch {
          toast.warning(`${label}: sent`, {
            id,
            description: (
              <span>
                It&apos;s on its way but we couldn&apos;t confirm it yet. Check before trying again. <ReceiptLink hash={sent} />
              </span>
            ),
          });
          void queryClient.invalidateQueries();
          setTimeout(() => void queryClient.invalidateQueries(), 15_000);
          return { status: "unknown", transactionHash: sent };
        }
        if (receipt.status === "success") {
          toast.success(opts?.done ?? `${label}: done`, { id, description: <ReceiptLink hash={sent} /> });
          try {
            opts?.onSuccess?.(receipt);
          } catch {
            /* a UI follow-up failing must not turn a confirmed action into an error */
          }
        } else {
          toast.error(`Couldn't ${label.toLowerCase()}`, {
            id,
            description: (
              <span>
                The network refused it and nothing changed. <ReceiptLink hash={sent} />
              </span>
            ),
          });
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

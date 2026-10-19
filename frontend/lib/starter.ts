"use client";

import { useRouter } from "next/navigation";
import { parseEventLogs, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { erc20Abi, mockChogAbi } from "./abis";
import { CHAIN_ID, contracts } from "./config";
import { rememberChog, useBalances, useOwnedChogs, useProtocol } from "./hooks";
import { useTx } from "./tx";

export const MINT_LABEL = "Mint a Chog";
export const DOLLARS_LABEL = "Get test dollars";

/** Onboarding actions shared by the app rail and the den checklist. */
export function useStarter() {
  const router = useRouter();
  const { address } = useAccount();
  const { asset } = useProtocol();
  const bal = useBalances(address, asset?.address, undefined, { live: false });
  const owned = useOwnedChogs(address);
  const { run, pending } = useTx();

  const mint = () =>
    contracts.mockChog && address
      ? run(
          MINT_LABEL,
          async (config) => {
            const { request } = await simulateContract(config, {
              address: contracts.mockChog!,
              abi: mockChogAbi,
              functionName: "freeMint",
              account: address,
              chainId: CHAIN_ID,
            });
            return writeContract(config, request);
          },
          {
            done: "Your Chog is here",
            onSuccess: (receipt) => {
              const logs = parseEventLogs({ abi: mockChogAbi, eventName: "Transfer", logs: receipt.logs });
              const minted = logs.find(
                (l) => l.address.toLowerCase() === contracts.mockChog!.toLowerCase() && l.args.to.toLowerCase() === address.toLowerCase(),
              );
              if (minted) {
                rememberChog(address, minted.args.tokenId);
                router.push(`/daemon/${minted.args.tokenId.toString()}`);
              }
            },
          },
        )
      : undefined;

  const getDollars = () =>
    asset && address
      ? run(
          DOLLARS_LABEL,
          async (config) => {
            const { request } = await simulateContract(config, {
              address: asset.address,
              abi: erc20Abi,
              functionName: "mint",
              args: [address, parseUnits("1000", asset.decimals)],
              account: address,
              chainId: CHAIN_ID,
            });
            return writeContract(config, request);
          },
          { done: `1,000 test ${asset.symbol} added` },
        )
      : undefined;

  const hasMon = (bal.mon ?? BigInt(0)) > BigInt(0);
  const hasDollars = (bal.asset ?? BigInt(0)) > BigInt(0);
  const hasChog = (owned.data?.balance ?? BigInt(0)) > BigInt(0);

  return {
    address,
    asset,
    mint,
    getDollars,
    pending,
    canMint: Boolean(address && contracts.mockChog),
    canGetDollars: Boolean(address && asset),
    hasMon,
    hasDollars,
    hasChog,
    monBalance: bal.mon,
    dollarBalance: bal.asset,
  };
}

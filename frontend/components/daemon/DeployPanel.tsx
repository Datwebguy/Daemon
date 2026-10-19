"use client";

import { simulateContract, writeContract } from "wagmi/actions";
import { erc6551RegistryAbi } from "@/lib/abis";
import { CHAIN_ID, contracts, env } from "@/lib/config";
import { useTx } from "@/lib/tx";
import { Button, Card, Notice } from "../ui";

/** Shown while the ERC-6551 account has no code yet. createAccount is permissionless. */
export function DeployPanel({
  tokenId,
  user,
  isOwner,
  canCreate,
  onDeployed,
}: {
  tokenId: bigint;
  user?: `0x${string}`;
  isOwner: boolean;
  canCreate: boolean;
  onDeployed: () => void;
}) {
  const { run, pending } = useTx();
  const create = () =>
    user &&
    contracts.accountImpl &&
    contracts.mockChog &&
    run(
      "Activate Daemon",
      async (config) => {
        const { request } = await simulateContract(config, {
          address: contracts.registry,
          abi: erc6551RegistryAbi,
          functionName: "createAccount",
          args: [contracts.accountImpl!, env.salt, BigInt(CHAIN_ID), contracts.mockChog!, tokenId],
          account: user,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      },
      { onSuccess: onDeployed },
    );

  return (
    <Card title="✨ Activate this Daemon">
      <p className="text-sm text-dim">
        The address above is deterministic, but the token-bound account contract isn&apos;t deployed yet. Deploying it via the canonical
        ERC-6551 registry is permissionless and does not change ownership: the Chog holder stays in control.
      </p>
      {!canCreate ? (
        <div className="mt-4">
          <Notice tone="warn">NEXT_PUBLIC_DAEMON_ACCOUNT_IMPL is not set, so the account can&apos;t be created from here yet.</Notice>
        </div>
      ) : (
        <Button className="mt-4 w-full" onClick={create} loading={pending === "Activate Daemon"} disabled={!user}>
          {!user ? "Sign in to activate" : isOwner ? "Deploy my Daemon account" : "Deploy this Daemon's account"}
        </Button>
      )}
    </Card>
  );
}

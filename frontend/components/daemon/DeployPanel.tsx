"use client";

import { simulateContract, writeContract } from "wagmi/actions";
import { erc6551RegistryAbi } from "@/lib/abis";
import { CHAIN_ID, contracts, env } from "@/lib/config";
import { useTx } from "@/lib/tx";
import { Creature } from "../creature/Creature";
import { Button } from "../ui";

const LABEL = "Wake up this Daemon";

/** Shown while the Daemon's wallet doesn't exist yet. Anyone can wake it; ownership never changes. */
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
  const wake = () =>
    user &&
    contracts.accountImpl &&
    contracts.mockChog &&
    run(
      LABEL,
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
      { done: "It's awake!", onSuccess: onDeployed },
    );

  return (
    <section className="clay relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
      <div aria-hidden className="absolute -right-6 -top-6 h-40 w-40 opacity-90">
        <Creature className="h-full w-full" />
      </div>
      <div className="relative max-w-md">
        <h2 className="font-display text-3xl font-extrabold">Still asleep</h2>
        <p className="mt-2 text-dim">
          {isOwner
            ? "Wake your Daemon to give this Chog its own wallet. It stays yours, and it only takes one tap."
            : "Anyone can wake a Daemon. The Chog still belongs to its holder."}
        </p>
        {canCreate ? (
          <Button size="lg" className="mt-6" onClick={wake} loading={pending === LABEL} disabled={!user}>
            {!user ? "Sign in to wake it" : "Wake it up"}
          </Button>
        ) : (
          <p className="mt-6 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-dim">Waking Daemons opens very soon. Check back in a little while.</p>
        )}
      </div>
    </section>
  );
}

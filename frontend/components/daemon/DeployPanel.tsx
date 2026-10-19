"use client";

import { simulateContract, writeContract } from "wagmi/actions";
import { erc6551RegistryAbi } from "@/lib/abis";
import { CHAIN_ID, contracts, env } from "@/lib/config";
import { useTx } from "@/lib/tx";
import { ChogFace } from "@/components/ChogFace";
import { Note, StickerButton } from "./bits";

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
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-4 text-center sm:gap-6 sm:py-6 lg:py-10">
      <div className="relative">
        <div className="sticker h-32 w-32 rotate-3 !rounded-[1.8rem] !border-4 p-2 !shadow-[7px_7px_0_var(--st-shadow)] sm:h-48 sm:w-48">
          <ChogFace seed={1} className="h-full w-full" />
        </div>
        {[
          { l: "-0.5rem", t: "-1.4rem", s: "2rem", r: "-12deg", d: "0s" },
          { l: "-2.2rem", t: "-0.2rem", s: "1.5rem", r: "8deg", d: "0.6s" },
          { l: "-3.3rem", t: "1.2rem", s: "1.1rem", r: "-6deg", d: "1.2s" },
        ].map((z) => (
          <span
            key={z.l}
            aria-hidden
            className="dm-z absolute font-display text-jelly"
            style={{ right: z.l, top: z.t, fontSize: z.s, ["--r" as string]: z.r, animationDelay: z.d }}
          >
            Z
          </span>
        ))}
      </div>

      <div className="sticker max-w-md -rotate-1 !rounded-[1.4rem] !border-4 px-5 py-4 !shadow-[6px_6px_0_var(--st-shadow)] sm:px-6 sm:py-5">
        <h2 className="font-display text-3xl leading-none sm:text-4xl">Still asleep</h2>
        <p className="mt-3 text-dim">
          {isOwner
            ? "Wake your Daemon to give this Chog its own wallet. It stays yours, and it only takes one tap."
            : "Anyone can wake a Daemon. The Chog still belongs to its holder."}
        </p>
      </div>

      {canCreate ? (
        <StickerButton tone="jelly" size="xl" className="max-w-md" onClick={wake} loading={pending === LABEL} disabled={!user}>
          {!user ? "Sign in to wake it" : "Wake it up"}
        </StickerButton>
      ) : (
        <Note className="max-w-md">Waking Daemons opens very soon. Check back in a little while.</Note>
      )}
    </div>
  );
}

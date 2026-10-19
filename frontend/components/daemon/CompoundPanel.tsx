"use client";

import { simulateContract, writeContract } from "wagmi/actions";
import { daemonAccountAbi } from "@/lib/abis";
import { CHAIN_ID } from "@/lib/config";
import { fmtAgo, fmtDuration, fmtUnits } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { Button, Card, Notice, Stat } from "../ui";
import type { DaemonCtx } from "./types";

/** Public: anyone can compound any Daemon and receives the bounty. */
export function CompoundPanel({ ctx }: { ctx: DaemonCtx }) {
  const { account, deployed, user, protocol, state } = ctx;
  const now = useNow();
  const { run, pending } = useTx();
  const dec = protocol.asset?.decimals ?? 18;
  const sym = protocol.asset?.symbol ?? "";

  // nextCompoundAt() = anchor + cooldown, where the anchor is the first allocation time until the
  // first compound happens (so lastCompoundAt + cooldown would be wrong before then).
  const last = state.lastCompoundAt !== undefined ? Number(state.lastCompoundAt) : undefined;
  const readyAt = state.nextCompoundAt !== undefined ? Number(state.nextCompoundAt) : undefined;
  const remaining = readyAt !== undefined ? readyAt - now : undefined;
  const cooling = remaining !== undefined && remaining > 0;
  const noBounty = state.pendingBounty !== undefined && state.pendingBounty === BigInt(0);

  const compound = () =>
    user &&
    run("Compound", async (config) => {
      const { request } = await simulateContract(config, {
        address: account,
        abi: daemonAccountAbi,
        functionName: "compound",
        args: [user],
        account: user,
        chainId: CHAIN_ID,
      });
      return writeContract(config, request);
    });

  return (
    <Card title="🔁 Compound" right={<span className="text-xs text-dim">anyone can call</span>}>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Pending profit" value={`${fmtUnits(state.pendingProfit, dec)} ${sym}`} />
        <Stat label="Est. bounty" value={`${fmtUnits(state.pendingBounty, dec)} ${sym}`} hint="estimate, paid to the caller" />
        <Stat
          label="Cooldown"
          value={!deployed ? "–" : cooling ? fmtDuration(remaining ?? 0) : readyAt !== undefined ? "Ready" : "–"}
          hint={last ? `last compound ${fmtAgo(last, now)}` : "never compounded"}
        />
        <Stat
          label="Bounty share"
          value={
            protocol.config
              ? `${protocol.config.bountyStartBps / 100}% → ${protocol.config.bountyMaxBps / 100}%`
              : "–"
          }
          hint="rises the longer it waits"
        />
      </div>
      <div className="mt-4 space-y-3">
        {deployed && !cooling && noBounty && (
          <Notice tone="warn">Pending profit doesn&apos;t cover gas + bounty yet, so compound will likely revert.</Notice>
        )}
        <Button
          className="w-full"
          onClick={compound}
          loading={pending === "Compound"}
          disabled={!user || !deployed || cooling}
        >
          {!user ? "Sign in to compound" : cooling ? `Cooling down · ${fmtDuration(remaining ?? 0)}` : "Compound & earn bounty"}
        </Button>
      </div>
    </Card>
  );
}

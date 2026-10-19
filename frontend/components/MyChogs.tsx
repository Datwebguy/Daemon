"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useAuth } from "@/lib/auth";
import { contracts } from "@/lib/config";
import { errorMessage } from "@/lib/format";
import { useOwnedChogs } from "@/lib/hooks";
import { ChogCard } from "./ChogCard";
import { Button, Empty, Loading, Notice } from "./ui";

function Hero() {
  return (
    <div className="mb-8 overflow-hidden rounded-[2rem] bg-gradient-to-br from-monad-900 via-monad-600 to-monad-300 p-6 text-white sm:p-10">
      <div className="max-w-2xl">
        <div className="text-sm font-semibold uppercase tracking-widest opacity-80">Monad Testnet</div>
        <h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">Your Chog is a Daemon now. 😈</h1>
        <p className="mt-3 text-base opacity-90 sm:text-lg">
          Every Chog gets its own ERC-6551 account that earns yield in our Stable and Degen vaults. Anyone can compound it for a bounty,
          anyone can hype it. Nobody can touch your funds but you.
        </p>
      </div>
    </div>
  );
}

const METHOD_NOTE = {
  indexer: "Found via the indexer.",
  logs: "MockChog isn't enumerable and no indexer is set, so we only scanned the last ~900 blocks (Monad caps eth_getLogs) plus Chogs minted from this browser.",
} as const;

export function MyChogs() {
  const { address } = useAccount();
  const auth = useAuth();
  const owned = useOwnedChogs(address);
  const [shown, setShown] = useState(24);

  return (
    <div>
      <Hero />
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="text-xl font-black">My Chogs</h2>
        <Link href="/explore" className="text-sm font-semibold text-monad-600 hover:underline dark:text-monad-300">
          Open any Daemon →
        </Link>
      </div>

      {!contracts.mockChog ? (
        <Empty emoji="🚧" title="Contracts not deployed yet">
          MockChog&apos;s address isn&apos;t configured, so there&apos;s nothing to list. Add NEXT_PUBLIC_MOCK_CHOG to .env.local after deployment.
        </Empty>
      ) : !address ? (
        <Empty emoji="🔑" title="Sign in to see your Chogs">
          <div className="mt-2">
            <Button onClick={auth.login} disabled={!auth.ready}>
              {auth.provider === "privy" ? "Sign in with email, social or wallet" : "Connect wallet"}
            </Button>
          </div>
        </Empty>
      ) : owned.isLoading ? (
        <Loading label="Finding your Chogs…" />
      ) : owned.error ? (
        <Notice tone="error" title="Couldn't load your Chogs">
          {errorMessage(owned.error).slice(0, 240)}
        </Notice>
      ) : owned.data && owned.data.ids.length === 0 && owned.data.balance === BigInt(0) ? (
        <Empty emoji="🐸" title="No Chogs yet">
          Hit <b>Mint Test Chog</b> in the header (you&apos;ll need a little MON from the faucet for gas).
        </Empty>
      ) : (
        <>
          {owned.data && owned.data.ids.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {owned.data.ids.slice(0, shown).map((id) => (
                <ChogCard key={id.toString()} tokenId={id} />
              ))}
            </div>
          )}
          {owned.data && owned.data.ids.length > shown && (
            <div className="mt-4 text-center">
              <Button variant="ghost" onClick={() => setShown((n) => n + 24)}>
                Show more ({owned.data.ids.length - shown} left)
              </Button>
            </div>
          )}
          {owned.data?.partial && (
            <div className="mt-4">
              <Notice tone="info" title={`You hold ${owned.data.balance.toString()} Chog(s); showing ${owned.data.ids.length}.`}>
                {METHOD_NOTE[owned.data.method]} Open a missing one by ID on <Link href="/explore" className="underline">Explore</Link>.
              </Notice>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/app/PageHero";
import { addressUrl, FAUCET_URL, contracts } from "@/lib/config";

export const metadata: Metadata = { title: "Testing guide" };

const STEPS: { title: string; body: string; href?: string; cta?: string }[] = [
  { title: "Look around, no sign-in", body: "Practice mode is a pretend Daemon with the same rules as the real one. Fund it, fast-forward, hype it, harvest it.", href: "/practice", cta: "Open practice mode" },
  { title: "Sign in", body: "Use an email, Google, X or a wallet. A new wallet gets a little free MON for network fees, once, so you never need a faucet.", href: "/app", cta: "Open the den" },
  { title: "Mint a free Chog", body: "The den's Getting started list has a Mint button. Each Chog carries a real Chog Genesis artwork and its real traits." },
  { title: "Wake it and put it to work", body: "Open your Chog, then Vaults: get 1,000 test dollars, pick Stable (steady) or Degen (swingy) and press Put it to work." },
  { title: "Hype it with a second wallet", body: "Open the same Daemon from another account and hype it. MON gives +0.05x for 3 hours. $CHOG gives +0.10x for 4 hours and burns 10%. Feeling lucky? Roll Pyth Entropy for a chance at a maxed, longer boost." },
  { title: "Let anyone harvest it", body: "After the rest timer, anyone can press Harvest and keep a tip that starts at 5% and grows to 10%. The rest goes straight back to work, and a boost is paid only from the hype jar." },
  { title: "Take everything out", body: "Only the Chog's holder can. One tap on Take everything out sends every vault, reward and the jar back to your wallet." },
];

const CONTRACTS: [string, string | undefined][] = [
  ["Chog (testnet)", contracts.mockChog],
  ["Daemon account (template)", contracts.accountImpl],
  ["Strategy registry", contracts.strategyRegistry],
  ["Daemon hub (batch harvest)", contracts.hub],
  ["Stable vault", contracts.stableVault],
  ["Degen vault", contracts.degenVault],
  ["Welcome MON drip", contracts.welcomeDrip],
];

export default function GuidePage() {
  return (
    <div>
      <PageHero tone="--sky" kicker="For judges and curious people" title="Testing guide" face={{ mood: 1, seed: 9 }}>
        Everything works on Monad testnet with free test money. About three minutes end to end.
      </PageHero>

      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <ol className="space-y-2.5 sm:space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="stk flex gap-3 !rounded-2xl p-3.5 sm:gap-4 sm:p-5">
              <span className="stk grid h-9 w-9 shrink-0 place-items-center !rounded-full bg-butter font-display text-base leading-none text-[#1e1238] sm:h-11 sm:w-11 sm:text-xl">{i + 1}</span>
              <div className="min-w-0">
                <h2 className="font-display text-base leading-tight sm:text-xl">{s.title}</h2>
                <p className="mt-1 text-sm text-dim sm:text-base">{s.body}</p>
                {s.href && (
                  <Link href={s.href} className="stk squish mt-2.5 inline-flex h-9 items-center !rounded-full bg-jelly px-4 text-sm font-bold text-white">
                    {s.cta}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="stk mt-6 !rounded-2xl p-4 sm:mt-10 sm:p-6">
          <h2 className="font-display text-lg sm:text-2xl">Why the Chog matters</h2>
          <p className="mt-2 text-sm text-dim sm:text-base">
            Each Daemon is a wallet owned by one Chog (an ERC-6551 token-bound account). Whoever holds the Chog holds the Daemon: the savings, the mood, the history and the boost. Sell or gift the Chog and everything follows it. Without the NFT there is no owner, so nobody can deposit, withdraw or choose a vault. No operator, no keys, no admin over funds.
          </p>
        </div>

        <div className="stk mt-4 !rounded-2xl p-4 sm:mt-6 sm:p-6">
          <h2 className="font-display text-lg sm:text-2xl">Contracts on Monad testnet</h2>
          <ul className="mt-2 divide-y-2 divide-dashed divide-[color:var(--st-line)]/20 text-sm">
            {CONTRACTS.filter(([, a]) => a).map(([name, a]) => (
              <li key={name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2">
                <span className="font-bold">{name}</span>
                <a href={addressUrl(a!)} target="_blank" rel="noreferrer" className="font-mono text-xs text-jelly underline-offset-4 hover:underline">
                  {a!.slice(0, 8)}…{a!.slice(-6)}
                </a>
              </li>
            ))}
            {CONTRACTS.every(([, a]) => !a) && <li className="py-2 text-dim">Addresses appear here once the contracts are deployed.</li>}
          </ul>
          <p className="mt-3 text-xs text-dim">
            Need more test MON? <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="font-bold text-jelly underline-offset-4 hover:underline">Use the Monad faucet</a>. Source code and tests are in the public repository.
          </p>
        </div>
      </section>
    </div>
  );
}

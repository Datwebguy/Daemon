import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/app/PageHero";
import { addressUrl, FAUCET_URL, contracts } from "@/lib/config";

export const metadata: Metadata = { title: "Get started" };

const STEPS: { title: string; body: string; href?: string; cta?: string }[] = [
  { title: "Try it first", body: "Practice mode needs no sign-in.", href: "/practice", cta: "Open practice" },
  { title: "Sign in", body: "Email, Google, X or a wallet. New wallets get a little MON for fees.", href: "/app", cta: "Open the den" },
  { title: "Mint a Chog", body: "It's free and comes with real Chog art." },
  { title: "Put it to work", body: "Pick Stable or Degen under Vaults." },
  { title: "Hype it", body: "Anyone can hype any Daemon. $CHOG gives a bigger boost." },
  { title: "Harvest it", body: "Anyone can harvest and keep a 5 to 10% tip." },
  { title: "Take it out", body: "Only the Chog's holder can, in one tap." },
];

const CONTRACTS: [string, string | undefined][] = [
  ["Chog", contracts.mockChog],
  ["Daemon account", contracts.accountImpl],
  ["Strategy registry", contracts.strategyRegistry],
  ["Daemon hub", contracts.hub],
  ["Stable vault", contracts.stableVault],
  ["Degen vault", contracts.degenVault],
  ["Welcome drip", contracts.welcomeDrip],
];

export default function StartPage() {
  const deployed = CONTRACTS.filter(([, a]) => a);
  return (
    <div>
      <PageHero tone="--sky" kicker="Quick start" title="Get started" face={{ mood: 1, seed: 9 }}>
        From sign-in to your first harvest.
      </PageHero>

      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <ol className="space-y-2.5 sm:space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="stk flex items-center gap-3 !rounded-2xl p-3 sm:gap-4 sm:p-4">
              <span className="stk grid h-9 w-9 shrink-0 place-items-center !rounded-full bg-butter font-display text-base leading-none text-[#1e1238] sm:h-10 sm:w-10 sm:text-lg">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-base leading-tight sm:text-lg">{s.title}</h2>
                <p className="text-sm text-dim">{s.body}</p>
              </div>
              {s.href && (
                <Link href={s.href} className="stk squish inline-flex h-9 shrink-0 items-center !rounded-full bg-jelly px-4 text-sm font-bold text-white">
                  {s.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>

        {deployed.length > 0 && (
          <div className="stk mt-6 !rounded-2xl p-4 sm:mt-8 sm:p-5">
            <h2 className="font-display text-lg sm:text-xl">Contracts</h2>
            <ul className="mt-2 divide-y-2 divide-dashed divide-[color:var(--st-line)]/20 text-sm">
              {deployed.map(([name, a]) => (
                <li key={name} className="flex items-center justify-between gap-4 py-2">
                  <span className="font-bold">{name}</span>
                  <a href={addressUrl(a!)} target="_blank" rel="noreferrer" className="font-mono text-xs text-jelly underline-offset-4 hover:underline">
                    {a!.slice(0, 8)}…{a!.slice(-6)}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-dim">
              Need MON for fees?{" "}
              <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="font-bold text-jelly underline-offset-4 hover:underline">
                Faucet
              </a>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

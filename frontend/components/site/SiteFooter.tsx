import Link from "next/link";
import { ChogFace } from "@/components/ChogFace";
import { Logo } from "../brand/Logo";

const COLS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Use Daemon",
    links: [
      { href: "/app", label: "Open the app" },
      { href: "/explore", label: "Find a Daemon" },
      { href: "/feed", label: "Live activity" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#moods", label: "Moods" },
      { href: "/#earn", label: "Earn tips" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "https://discord.gg/chog", label: "Chog Discord", external: true },
      { href: "https://x.com/ChogNFT", label: "Chog on X", external: true },
      { href: "https://chog.xyz", label: "chog.xyz", external: true },
      { href: "https://github.com/Datwebguy/Daemon", label: "Source code", external: true },
    ],
  },
  {
    title: "Get set up",
    links: [
      { href: "https://faucet.monad.xyz", label: "Free test MON", external: true },
      { href: "https://monad.xyz", label: "About Monad", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden">
      {/* closing call to action */}
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div
          className="sticker relative overflow-hidden !rounded-[2.5rem] bg-gradient-to-br from-[#ffe6f1] via-white to-[#e9e2ff] px-6 py-16 text-[#1e1238] sm:px-14 sm:py-20"
          data-reveal
        >
          <div aria-hidden className="absolute -right-10 -bottom-16 h-72 w-72 opacity-90 sm:h-96 sm:w-96">
            <ChogFace mood={3} boosted className="h-full w-full" />
          </div>
          <div className="relative max-w-xl">
            <h2 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1]">Your Chog is waiting to wake up.</h2>
            <p className="mt-5 text-lg text-[#1e1238]/70">It takes about a minute, it&apos;s free on the test network, and you can take everything back any time.</p>
            <Link
              href="/app"
              className="sticker sticker-pop squish mt-9 inline-flex items-center gap-3 !bg-jelly px-7 py-3.5 font-bold !text-white"
            >
              Wake your Daemon
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-20 max-w-6xl px-5 sm:px-8">
        <div className="grid gap-10 border-t border-line pt-12 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-dim">A little spirit for every Chog. It saves, earns and has opinions about it.</p>
          </div>
          {COLS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h3 className="text-sm font-semibold">{c.title}</h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noreferrer" className="text-dim transition hover:text-fg">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-dim transition hover:text-fg">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      {/* giant wordmark with a peeking Daemon */}
      <div className="relative mx-auto mt-16 max-w-6xl px-5 sm:px-8" aria-hidden>
        <div className="absolute left-[58%] top-[-2.6rem] h-24 w-24 sm:top-[-4.2rem] sm:h-36 sm:w-36">
          <ChogFace mood={1} track className="h-full w-full" />
        </div>
        <div className="select-none font-display text-[clamp(5rem,23vw,17rem)] font-extrabold leading-[0.78] tracking-[-0.06em] text-jelly/15">daemon</div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-dim sm:px-8">
        <span>© {new Date().getFullYear()} Daemon. Built for the Chog community on Monad. Test network, test tokens, no real value.</span>
        <span>
          Photos by{" "}
          <a href="https://unsplash.com/@eiskonen" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
            Hans Eiskonen
          </a>{" "}
          and{" "}
          <a href="https://unsplash.com/@iamrohitchoudhari" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
            Rohit Choudhari
          </a>{" "}
          on Unsplash
        </span>
      </div>
    </footer>
  );
}

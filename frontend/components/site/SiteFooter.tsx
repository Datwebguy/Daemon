import Link from "next/link";
import { ChogFace } from "@/components/ChogFace";
import { Logo } from "../brand/Logo";
import { ThemeToggle } from "../ThemeToggle";

type FooterLink = { href: string; label: string; external?: boolean };

const COLS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Use Daemon",
    links: [
      { href: "/app", label: "Open the app" },
      { href: "/practice", label: "Practice mode" },
      { href: "/start", label: "Get started" },
      { href: "/explore", label: "Find a Daemon" },
      { href: "/feed", label: "Live activity" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#day", label: "A day with a Daemon" },
      { href: "/#moods", label: "Moods" },
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

function FooterLinkItem({ l }: { l: FooterLink }) {
  const cls = "group inline-flex items-center gap-1.5 text-white/70 transition hover:text-butter";
  const arrow = (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
  return l.external ? (
    <a href={l.href} target="_blank" rel="noreferrer" className={cls}>
      {l.label}
      {arrow}
    </a>
  ) : (
    <Link href={l.href} className={cls}>
      {l.label}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative mt-12 sm:mt-24">
      {/* closing call to action */}
      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        <div
          className="sticker relative overflow-hidden !rounded-[1.75rem] sm:!rounded-[2.5rem] !bg-[linear-gradient(135deg,color-mix(in_oklab,var(--pink)_28%,var(--st-bg)),var(--st-bg)_55%,color-mix(in_oklab,var(--jelly)_28%,var(--st-bg)))] !text-[var(--st-fg)] px-5 py-9 sm:px-14 sm:py-16"
          data-reveal
        >
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="font-display text-[clamp(1.85rem,7vw,3.8rem)] leading-[1]">Your Chog is waiting to wake up.</h2>
              <p className="mt-3 max-w-xl text-[15px] opacity-75 sm:mt-4 sm:text-lg">It takes about a minute, it&apos;s free on the test network, and you can take everything back any time.</p>
              <Link href="/app" className="sticker sticker-pop squish mt-6 inline-flex items-center gap-3 !bg-jelly px-5 py-2.5 text-sm font-bold !text-white sm:mt-8 sm:px-7 sm:py-3.5 sm:text-base">
                Wake your Daemon
              </Link>
            </div>
            <div aria-hidden className="mx-auto hidden w-48 rotate-3 md:block lg:w-56">
              <ChogFace mood={3} boosted className="aspect-square w-full" />
            </div>
          </div>
        </div>
      </div>

      {/* the dark footer proper: zigzag edge, tucked behind the call to action */}
      <div className="zigzag-top relative -mt-14 bg-night pt-24 text-white sm:pt-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-[1.25fr_repeat(4,1fr)] md:gap-12">
            <div className="col-span-2 md:col-span-1">
              <Logo light />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">A little spirit for every Chog. It saves, earns and has opinions about it.</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <ThemeToggle compact />
              </div>
            </div>
            {COLS.map((c) => (
              <nav key={c.title} aria-label={c.title}>
                <h3 className="font-display text-base text-white sm:text-lg">{c.title}</h3>
                <ul className="mt-3 space-y-2 text-sm sm:mt-4 sm:space-y-3">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <FooterLinkItem l={l} />
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* giant wordmark cropped by the bottom edge, with a real Chog sitting on it */}
        <div className="relative mt-14 overflow-hidden select-none sm:mt-20" aria-hidden>
          <div className="relative mx-auto max-w-[96rem] px-2">
            <div className="absolute bottom-[58%] right-[9%] z-10 w-[clamp(4.5rem,10vw,8rem)] -rotate-6">
              <ChogFace mood={1} seed={2} className="aspect-square w-full" />
            </div>
            <div
              className="bg-gradient-to-r from-pink via-butter to-sky bg-clip-text pb-0 text-center font-display text-[clamp(6rem,27vw,24rem)] leading-[0.74] text-transparent"
              style={{ marginBottom: "-0.12em" }}
            >
              daemon
            </div>
          </div>
        </div>

        <div className="relative z-10 border-t-[3px] border-white/15 bg-night">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-white/55 sm:px-8">
            <span>© {new Date().getFullYear()} Daemon. Built for the Chog community on Monad. Test network, test tokens, no real value.</span>
            <span>
              Photos by{" "}
              <a href="https://unsplash.com/@eiskonen" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-white hover:underline">
                Hans Eiskonen
              </a>{" "}
              and{" "}
              <a href="https://unsplash.com/@iamrohitchoudhari" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-white hover:underline">
                Rohit Choudhari
              </a>{" "}
              on Unsplash
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

const QA: { q: string; a: string }[] = [
  {
    q: "What exactly is a Daemon?",
    a: "It's a wallet that belongs to your Chog, plus a personality. It can hold money, put it to work in vaults, and it shows a mood based on how things are going. Whoever holds the Chog controls the Daemon.",
  },
  {
    q: "Do I need a real Chog to try it?",
    a: "No. Daemon runs on Monad's test network, where you can mint a free test Chog and get free test dollars. Nothing here costs real money.",
  },
  {
    q: "Who can take money out of my Daemon?",
    a: "Only you, the person holding the Chog. There's no admin key and no company that can move your funds. Other people can only add to it: by harvesting (which grows it) or by hyping (which tops up its hype jar).",
  },
  {
    q: "Where do the earnings come from?",
    a: "Your Daemon deposits into vaults you pick. The Stable vault pays calm, steady rewards. The Degen vault's rewards swing up and down. Harvesting swaps those rewards back into savings and puts them to work again.",
  },
  {
    q: "Why would a stranger harvest my Daemon?",
    a: "Because they get a tip, a small slice of what they harvest (5% rising to 10% the longer it waits). It's the same idea as tipping a courier. Your Daemon keeps everything else, and you never have to do it yourself.",
  },
  {
    q: "What does hyping do?",
    a: "Anyone can drop a little MON or CHOG into a Daemon's hype jar. Each hype adds a boost (up to 1.25×) to its harvests for three hours, paid out of the jar. Whatever's left in the jar belongs to the Chog holder.",
  },
  {
    q: "What happens if I sell my Chog?",
    a: "Everything inside the Daemon goes to the new holder, instantly. You lose access the moment the Chog leaves your wallet, so take things out first if you want to keep them.",
  },
  {
    q: "Why is my Daemon tired?",
    a: "If nobody harvests or hypes it for three days, it gets sleepy. Harvest it or ask a friend to hype it and it'll perk right up.",
  },
  {
    q: "Does it cost anything?",
    a: "Each action needs a tiny network fee in MON. On the test network MON is free from the Monad faucet, and we'll point you to it in the app.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-14 sm:px-8 sm:py-32">
      <div className="grid gap-6 sm:gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div data-reveal className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="font-display text-[clamp(1.85rem,7vw,3.6rem)] font-extrabold leading-[1] tracking-tight">Questions, answered.</h2>
          <p className="mt-3 max-w-sm text-[15px] text-dim sm:mt-5 sm:text-lg">
            Still curious? Ask the Chog community on{" "}
            <a href="https://discord.gg/chog" target="_blank" rel="noreferrer" className="font-semibold text-jelly underline-offset-4 hover:underline">
              Discord
            </a>
            .
          </p>
        </div>
        <div className="space-y-2 sm:space-y-3">
          {QA.map((x, i) => (
            <details key={x.q} className="sticker sticker-pop group !rounded-2xl px-4 py-3 sm:px-6 sm:py-5" data-reveal style={{ ["--d" as string]: `${i * 40}ms` }}>
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-display text-[15px] font-bold leading-snug sm:gap-6 sm:text-lg">
                {x.q}
                <span className="faq-icon grid h-7 w-7 shrink-0 sm:h-9 sm:w-9 place-items-center rounded-full bg-butter text-[#1e1238] transition-transform duration-300" aria-hidden>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="faq-body mt-2 max-w-[62ch] text-sm leading-relaxed text-dim sm:mt-3 sm:text-base">{x.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

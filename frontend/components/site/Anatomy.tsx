import { ChogFace } from "@/components/ChogFace";

/** "What is a Daemon?" An annotated drawing instead of three identical cards. */
export function Anatomy() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-32">
      <div className="grid items-center gap-8 sm:gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div data-reveal>
          <h2 className="font-display text-[clamp(1.85rem,7vw,3.6rem)] font-extrabold leading-[1] tracking-tight">
            A wallet with a heartbeat.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-dim sm:mt-6 sm:text-lg">
            A Daemon is a wallet that belongs to your Chog itself, not to an app and not to us. You fill it, it earns, and it lets you know
            how it feels about it.
          </p>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-dim sm:mt-4 sm:text-lg">
            Whoever holds the Chog holds the Daemon. If you sell the Chog, the savings, the history and the attitude all go with it.
          </p>
        </div>

        <div className="relative" data-reveal style={{ ["--d" as string]: "120ms" }}>
          <div className="sticker relative overflow-hidden !rounded-[1.5rem] p-4 sm:!rounded-[2rem] sm:p-10">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
              {/* chog */}
              <div className="text-center">
                <div className="clay-sunk mx-auto grid aspect-square w-full max-w-[6.5rem] place-items-center rounded-[1.2rem] sm:max-w-[9rem] sm:rounded-[1.6rem]">
                  <ChogFace mood={1} className="h-[78%] w-[78%]" />
                </div>
                <div className="mt-2 font-display text-sm font-bold sm:mt-3 sm:text-base">Your Chog</div>
                <div className="text-[11px] leading-snug text-dim sm:text-xs">the collectible you hold</div>
              </div>
              <Flow />
              {/* wallet */}
              <div className="text-center">
                <div className="mx-auto grid aspect-square w-full max-w-[6.5rem] place-items-center rounded-[1.2rem] bg-jelly sm:max-w-[9rem] sm:rounded-[1.6rem] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_18px_40px_-16px_var(--glow)]">
                  <svg viewBox="0 0 48 48" className="h-10 w-10 sm:h-14 sm:w-14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
                    <rect x="6" y="12" width="36" height="26" rx="7" />
                    <path d="M30 22h12v8H30a4 4 0 0 1 0-8Z" />
                    <path d="M12 12l16-6 4 6" />
                  </svg>
                </div>
                <div className="mt-2 font-display text-sm font-bold sm:mt-3 sm:text-base">Its Daemon</div>
                <div className="text-[11px] leading-snug text-dim sm:text-xs">a wallet that belongs to the Chog</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-8 sm:gap-4">
              <Vault name="Stable vault" note="Calm, steady rewards" tone="#12a57a" icon="M8 26 C14 18 20 22 26 16 S36 10 40 10" />
              <Vault name="Degen vault" note="Bigger swings, more fun" tone="#ff7a45" icon="M8 30 L14 14 L20 26 L27 8 L33 22 L40 12" />
            </div>

            <ul className="mt-5 space-y-2.5 text-[13px] sm:mt-8 sm:space-y-3 sm:text-sm">
              {[
                "Only the Chog holder can take money out",
                "Anyone can help it grow, and gets a small tip for it",
                "Sell the Chog and everything inside goes with it",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-mint/15 text-mint">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </span>
                  <span className="text-fg/90">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Flow() {
  return (
    <svg viewBox="0 0 80 24" className="w-12 sm:w-20" aria-hidden>
      <path d="M2 12 H70" stroke="var(--jelly)" strokeWidth="3" strokeDasharray="5 6" strokeLinecap="round" style={{ animation: "marquee 6s linear infinite" }} />
      <path d="M64 5 L76 12 L64 19" stroke="var(--jelly)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Vault({ name, note, tone, icon }: { name: string; note: string; tone: string; icon: string }) {
  return (
    <div className="clay-sunk rounded-2xl p-3 sm:p-4">
      <svg viewBox="0 0 48 40" className="h-8 w-10" fill="none" stroke={tone} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={icon} />
      </svg>
      <div className="mt-1.5 font-display text-sm font-bold sm:mt-2 sm:text-base">{name}</div>
      <div className="text-[11px] text-dim sm:text-xs">{note}</div>
    </div>
  );
}

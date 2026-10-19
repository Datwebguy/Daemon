import { contracts, missingCore } from "@/lib/config";

/** Friendly tape strip while the app's contracts aren't live yet (no technical details). */
export function WakingBanner() {
  if (missingCore.length === 0) return null;
  const nothing = !contracts.mockChog;
  const detail = nothing ? "The app opens as soon as the network is ready. Check back shortly." : "A few actions aren't available yet.";
  const unit = (key: number) => (
    <span key={key} className="flex shrink-0 items-center gap-4 pr-4">
      <span aria-hidden className="h-2.5 w-2.5 rotate-45 border-2 border-[#1e1238] bg-[#1e1238]" />
      <b className="font-display text-base font-normal">Daemons are still waking up</b>
      <span>{detail}</span>
    </span>
  );
  return (
    <div className="tape-strip overflow-hidden">
      <p className="sr-only" role="status">
        Daemons are still waking up. {detail}
      </p>
      <div aria-hidden className="ticker-track py-1.5 text-sm font-semibold">
        {Array.from({ length: 8 }, (_, i) => unit(i))}
      </div>
    </div>
  );
}

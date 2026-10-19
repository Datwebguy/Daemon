import { contracts, missingCore } from "@/lib/config";

/** Friendly notice while the app's contracts aren't live yet (no technical details). */
export function WakingBanner() {
  if (missingCore.length === 0) return null;
  const nothing = !contracts.mockChog;
  return (
    <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3 rounded-full border border-amber-500/30 bg-amber-400/12 px-5 py-3 text-sm">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-500" aria-hidden />
        <span>
          <b>Daemons are still waking up.</b>{" "}
          <span className="text-dim">{nothing ? "The app opens as soon as the network is ready. Check back shortly." : "A few actions aren't available yet."}</span>
        </span>
      </div>
    </div>
  );
}

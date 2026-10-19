"use client";

import { moodOf } from "@/lib/mood";
import { cx } from "./ui";

/** Big mood expression + speech bubble. `image` is the on-chain tokenURI SVG (if any). */
export function DaemonAvatar({
  image,
  mood,
  message,
  boosted,
  size = "lg",
}: {
  image?: string;
  mood?: number;
  message?: string;
  boosted?: boolean;
  size?: "sm" | "lg";
}) {
  const m = moodOf(mood);
  const big = size === "lg";
  return (
    <div className="flex flex-col items-center gap-4">
      {big && (
        <div className="relative max-w-sm rounded-3xl border border-line bg-surface px-4 py-3 text-center text-sm shadow-sm">
          {message ? <span>“{message}”</span> : <span className="text-dim">No message yet. Compound or hype to wake it up.</span>}
          <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-line bg-surface" aria-hidden />
        </div>
      )}
      <div className={cx("relative rounded-[2rem] p-2 ring-4", m?.bg ?? "bg-muted", m?.ring ?? "ring-line", big ? "w-60 sm:w-72" : "w-full")}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="Chog" className={cx("aspect-square w-full rounded-[1.6rem] object-cover", big && "animate-bob")} />
        ) : (
          <div className={cx("grid aspect-square w-full place-items-center rounded-[1.6rem] bg-surface", big ? "text-8xl" : "text-5xl")}>
            <span className={big ? "animate-bob" : undefined}>{m?.emoji ?? "🐸"}</span>
          </div>
        )}
        {m && (
          <div
            className={cx(
              "absolute -right-3 -top-3 grid place-items-center rounded-full border-4 border-bg bg-surface shadow-lg",
              big ? "h-20 w-20 text-5xl" : "h-12 w-12 text-2xl",
              (m.name === "Chaotic" || boosted) && "animate-wiggle",
            )}
            title={m.name}
          >
            {m.emoji}
          </div>
        )}
        {boosted && (
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-0.5 text-xs font-black text-amber-950 shadow">
            ⚡ BOOSTED
          </div>
        )}
      </div>
      {big && m && (
        <div className="text-center">
          <div className={cx("text-2xl font-black", m.text)}>
            {m.name} <span className="font-mono text-base">{m.face}</span>
          </div>
          <div className="text-sm text-dim">{m.blurb}</div>
        </div>
      )}
    </div>
  );
}

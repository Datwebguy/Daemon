"use client";

import { useRef } from "react";
import { moodOf } from "@/lib/mood";
import { ChogImage } from "./ChogImage";
import { ChogFace } from "@/components/ChogFace";
import { cx } from "./ui";

/**
 * The Chog's on-chain portrait in a holographic card that tilts toward the pointer,
 * with a mood-coloured aura and the Daemon's latest words above it.
 */
export function DaemonAvatar({
  image,
  images,
  name,
  mood,
  message,
  boosted,
  multiplier,
}: {
  /** Single image URL (kept for compatibility); prefer `images`. */
  image?: string;
  /** Ordered fallback list of image URLs (from useChog().images). */
  images?: readonly string[];
  /** Used for the image's alt text, e.g. "CHOG #1462". */
  name?: string;
  mood?: number;
  message?: string;
  boosted?: boolean;
  multiplier?: number;
}) {
  const m = moodOf(mood);
  const srcs = images?.length ? images : image ? [image] : [];
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 16}deg`);
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
  };
  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div className="flex flex-col items-center">
      <div key={message} className="glass relative z-10 mb-5 max-w-sm rounded-[1.4rem] px-5 py-3.5 text-center animate-pop">
        <span className="font-display text-lg font-semibold leading-snug">
          {message ? `“${message}”` : mood === undefined ? "zzz…" : "“gm. Nothing to report yet.”"}
        </span>
        <span className="glass absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-t-0 border-l-0" aria-hidden />
      </div>

      <div className="relative w-full max-w-[22rem] [perspective:900px]" onPointerMove={onMove} onPointerLeave={reset}>
        <div
          aria-hidden
          className="absolute inset-[-12%] -z-10 rounded-full blur-3xl animate-aura"
          style={{ background: `radial-gradient(circle, ${m?.hex ?? "#b9a6fa"}aa, transparent 65%)` }}
        />
        <div
          ref={ref}
          className="relative aspect-square overflow-hidden rounded-[2rem] border border-white/40 shadow-[0_40px_80px_-40px_var(--glow)] transition-transform duration-300 ease-out [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d]"
          style={{ background: `radial-gradient(70% 70% at 50% 40%, ${m?.hex ?? "#b9a6fa"}66, var(--surface-2))` }}
        >
          <ChogImage
            srcs={srcs}
            eager
            alt={name ?? "This Chog"}
            fallback={<ChogFace mood={mood} boosted={boosted} track className="h-full w-full p-6" />}
            overlay={
              <div
                className="absolute bottom-3 left-3 h-14 w-14 overflow-hidden rounded-full border-2 border-white/70 shadow-lg"
                style={{ background: `radial-gradient(circle at 50% 40%, ${m?.hex ?? "#a8a3b8"}88, var(--surface))` }}
                title={m ? `Feeling ${m.name}` : "Asleep"}
              >
                <ChogFace mood={mood} boosted={boosted} className="h-full w-full p-1" />
              </div>
            }
          />
          {/* holographic glare */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-soft-light"
            style={{
              background:
                "radial-gradient(circle at var(--gx,50%) var(--gy,30%), rgb(255 255 255 / 0.55), transparent 45%), linear-gradient(115deg, transparent 30%, rgb(255 140 220 / 0.25) 45%, rgb(120 220 255 / 0.25) 55%, transparent 70%)",
            }}
          />
        </div>
        {boosted && (
          <div className="absolute -right-3 -top-3 rounded-full bg-spark px-3.5 py-1.5 font-display text-sm font-bold text-white shadow-[0_10px_24px_-8px_rgb(255_122_69/0.7)] animate-pop">
            {multiplier ? `${multiplier.toFixed(2)}×` : "Boosted"}
          </div>
        )}
      </div>

      {m ? (
        <div className="mt-6 text-center">
          <div className={cx("font-display text-3xl font-extrabold", m.text)}>
            {m.name}
          </div>
          <p className="mt-1 max-w-xs text-sm text-dim">{m.blurb}</p>
        </div>
      ) : (
        <div className="mt-6 text-center">
          <div className="font-display text-3xl font-extrabold text-dim">Asleep</div>
          <p className="mt-1 max-w-xs text-sm text-dim">This Daemon hasn&apos;t been woken up yet.</p>
        </div>
      )}
    </div>
  );
}

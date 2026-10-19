"use client";

import type { ReactNode } from "react";
import { moodOf } from "@/lib/mood";
import { ChogFace } from "./ChogFace";
import { ChogImage } from "./ChogImage";

/**
 * The stage art: the Chog's own picture in a thick sticker frame, tilted, with a mood chip,
 * and (while boosted) a glowing aura, a dashed halo and an "x1.15" sticker.
 * Scattered trait stickers go in as `children`, positioned against the frame.
 */
export function DaemonAvatar({
  image,
  images,
  name,
  mood,
  boosted,
  multiplier,
  children,
}: {
  /** Single image URL (kept for compatibility); prefer `images`. */
  image?: string;
  /** Ordered fallback list of image URLs (from useChog().images). */
  images?: readonly string[];
  /** Used for the image's alt text, e.g. "CHOG #1462". */
  name?: string;
  mood?: number;
  boosted?: boolean;
  multiplier?: number;
  children?: ReactNode;
}) {
  const m = moodOf(mood);
  const srcs = images?.length ? images : image ? [image] : [];

  return (
    <div className="dm-art">
      {boosted && (
        <>
          <div aria-hidden className="dm-aura animate-aura" />
          <div aria-hidden className="dm-halo animate-ring [animation-duration:40s]" />
        </>
      )}

      <div className="sticker dm-frame">
        <ChogImage
          srcs={srcs}
          eager
          alt={name ?? "This Chog"}
          fallback={<ChogFace mood={mood} boosted={boosted} className="h-full w-full p-6" />}
        />
        {/* glossy sheen */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-soft-light"
          style={{ background: "linear-gradient(115deg, transparent 28%, rgb(255 255 255 / 0.5) 44%, rgb(255 140 220 / 0.25) 52%, transparent 66%)" }}
        />
      </div>

      {/* mood chip: the Daemon's own face and how it feels */}
      <div
        className="sticker absolute -bottom-5 -left-3 z-10 flex rotate-[4deg] items-center gap-2 !rounded-2xl py-1.5 pl-1.5 pr-4"
        style={{ background: m?.hex ?? "#cbd5e1" }}
        title={m ? `Feeling ${m.name}` : "Asleep"}
      >
        <ChogFace mood={mood} boosted={boosted} className="h-11 w-11 shrink-0" />
        <span className="font-display text-xl leading-none sm:text-2xl">{m ? m.name : "Asleep"}</span>
      </div>

      {boosted && (
        <div
          className="sticker absolute -right-4 -top-5 z-10 rotate-[9deg] !rounded-full px-4 py-1.5 font-display text-xl animate-pop sm:text-2xl"
          style={{ background: "var(--pink)" }}
          aria-label={multiplier ? `Boosted ${multiplier.toFixed(2)} times` : "Boosted"}
        >
          {multiplier ? `x${multiplier.toFixed(2)}` : "Boosted"}
        </div>
      )}

      {children}
    </div>
  );
}

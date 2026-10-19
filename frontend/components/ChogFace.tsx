"use client";

import { useEffect, useState } from "react";
import { preload } from "react-dom";
import { artSources, faceFor, WARM_FACES } from "@/lib/chogFaces";
import { moodOf } from "@/lib/mood";
import { cx } from "@/lib/cx";

/**
 * A real Chog showing how a Daemon feels. The expression is the Chog's own artwork:
 * each mood maps to real Chogs whose eyes, mouth and head fit it (see lib/chogFaces.ts).
 * `mood` undefined shows a sleepy one. `seed` keeps the pick stable or lets it rotate.
 * Fills its box; give it a size (and padding if you like) through `className`.
 */
export function ChogFace({
  mood,
  boosted,
  seed = 0,
  className,
  title,
}: {
  mood?: number;
  boosted?: boolean;
  seed?: number;
  className?: string;
  title?: string;
  /** accepted for older call sites; the face no longer follows the pointer */
  track?: boolean;
}) {
  const id = faceFor(mood, seed);
  const m = moodOf(mood);
  return (
    <div
      className={cx("relative", className)}
      role="img"
      aria-label={title ?? (m ? `A Chog looking ${m.name.toLowerCase()}` : "A sleepy Chog")}
    >
      <Face key={id} id={id} hue={m?.hex} boosted={boosted} />
      <Warm />
    </div>
  );
}

function Face({ id, hue, boosted }: { id: number; hue?: string; boosted?: boolean }) {
  const [gw, setGw] = useState(0);
  const [ready, setReady] = useState(false);
  const urls = artSources(id, 640);
  const src = urls[gw];
  preload(urls[0]!, { as: "image", crossOrigin: "anonymous", fetchPriority: "high" });
  return (
    <div
      className={cx(
        "relative h-full w-full overflow-hidden rounded-[1.4rem] border-[3px] border-[#1e1238] bg-white",
        boosted && "ring-4 ring-spark ring-offset-2 ring-offset-transparent",
      )}
      style={{ boxShadow: `4px 4px 0 ${hue ?? "#1e1238"}` }}
    >
      {!ready && <div aria-hidden className="absolute inset-0 animate-pulse" style={{ background: `radial-gradient(circle at 50% 40%, ${hue ?? "#b9a6fa"}66, #fff)` }} />}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          decoding="async"
          crossOrigin="anonymous"
          onLoad={() => setReady(true)}
          onError={() => setGw((g) => g + 1)}
          className={cx("h-full w-full object-cover transition-opacity duration-300", ready ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

let warmed = false;
/** After the page settles, quietly fetch one face per mood so mood changes feel instant. */
function Warm() {
  useEffect(() => {
    if (warmed) return;
    warmed = true;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() =>
      WARM_FACES.forEach((id) => {
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.src = artSources(id, 640)[0]!;
      }),
    );
  }, []);
  return null;
}

"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * The real Chog art. Steps through backup addresses if one fails, shows a soft shimmer while
 * loading, and renders `fallback` (usually the Creature) if nothing loads. Fills its parent.
 */
export function ChogImage({
  srcs,
  alt,
  className,
  fallback,
  overlay,
  eager,
}: {
  /** Ordered list of image URLs; the next one is tried when one fails. */
  srcs: readonly string[];
  alt: string;
  className?: string;
  fallback?: ReactNode;
  /** Drawn on top of the art, only while real art is showing (not when the fallback is). */
  overlay?: ReactNode;
  /** Load right away (the main portrait on a Daemon page) instead of when scrolled into view. */
  eager?: boolean;
}) {
  // Re-key on the list so a new Chog starts from a clean state.
  return <Inner key={srcs.join("|")} srcs={srcs} alt={alt} className={className} fallback={fallback} overlay={overlay} eager={eager} />;
}

function Inner({
  srcs,
  alt,
  className,
  fallback,
  overlay,
  eager,
}: {
  srcs: readonly string[];
  alt: string;
  className?: string;
  fallback?: ReactNode;
  overlay?: ReactNode;
  eager?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const src = srcs[idx];
  if (!src) return <>{fallback ?? null}</>;
  return (
    <>
      {!loaded && <div aria-hidden className="absolute inset-0 animate-pulse bg-surface-2" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        crossOrigin="anonymous"
        decoding="async"
        ref={(el) => {
          // The picture may already be loaded before React attached onLoad (cached or fast): catch that case.
          if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setIdx((i) => i + 1)}
        className={cx("h-full w-full object-cover transition-[opacity,transform] duration-500", loaded ? "opacity-100" : "opacity-0", className)}
      />
      {overlay}
    </>
  );
}

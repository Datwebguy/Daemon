"use client";

import { useState } from "react";
import { artSources } from "@/lib/chogFaces";

/** A few real Chog Genesis artworks (public collection on Monad), loaded lazily from IPFS gateways. */
const IDS = [1468, 1492, 1525, 1581, 1676, 1794, 1941, 104, 269, 393, 534, 692, 829, 992, 1158, 1292];
const TILTS = [-3, 2, -1.5, 3, -2.5, 1.5, -3.5, 2.5];
const BACKS = ["#ffe6f1", "#fff3c4", "#dff4ff", "#e9e2ff", "#dcf7ec", "#ffe9dc"];

function Tile({ id, i }: { id: number; i: number }) {
  const [gw, setGw] = useState(0);
  const [ready, setReady] = useState(false);
  const sources = artSources(id, 384);
  const failed = gw >= sources.length;
  return (
    <div
      className="sticker sticker-pop relative w-44 shrink-0 overflow-hidden p-2 sm:w-52"
      style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)`, background: BACKS[i % BACKS.length] }}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-white/70">
        {!ready && !failed && <div className="absolute inset-0 animate-pulse bg-black/5" />}
        {!failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sources[gw]}
            alt={`Chog Genesis artwork number ${id}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setReady(true)}
            onError={() => setGw((g) => g + 1)}
            className={`h-full w-full object-cover transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}
          />
        )}
        {failed && <div className="h-full w-full bg-black/5" />}
      </div>
      <div className="mt-2 flex items-center justify-between px-1 font-display text-lg">
        <span>#{id}</span>
        <span className="text-xs font-sans font-bold text-[#1e1238]/60">gets a Daemon</span>
      </div>
    </div>
  );
}

export function ChogStrip() {
  const row = [...IDS, ...IDS];
  return (
    <section aria-label="Real Chog artwork" className="relative overflow-hidden py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8" data-reveal>
        <h2 className="max-w-2xl font-display text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.02]">Your real Chog. Its own little spirit.</h2>
        <p className="mt-4 max-w-xl text-lg text-dim">
          Daemon uses the real Chog Genesis artwork and traits. Every Chog you mint here is one of the originals, and it wakes up with a Daemon of its own.
        </p>
      </div>
      <div className="mt-12 flex w-max animate-marquee gap-6 px-6 py-6 hover:[animation-play-state:paused]">
        {row.map((id, i) => (
          <Tile key={`${id}-${i}`} id={id} i={i} />
        ))}
      </div>
    </section>
  );
}

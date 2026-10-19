"use client";

import { useEffect, useId, useRef } from "react";
import { MOODS } from "@/lib/mood";
import { cx } from "../ui";

/**
 * The Daemon creature: a round Chog-like spirit drawn in SVG.
 * - mood: 0 Chill, 1 Smug, 2 Chaotic, 3 Flexing, 4 Tired; undefined = dormant (asleep, greyed)
 * - track: pupils follow the pointer (disabled for reduced-motion users)
 */
export function Creature({
  mood,
  boosted,
  track = false,
  className,
  title,
}: {
  mood?: number;
  boosted?: boolean;
  track?: boolean;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const pupils = useRef<SVGGElement>(null);
  const dormant = mood === undefined;
  const m = dormant ? undefined : MOODS[mood];
  const hue = m?.hex ?? "#a8a3b8";
  const eyesClosed = dormant || mood === 4;

  useEffect(() => {
    if (!track || eyesClosed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const cx0 = r.left + r.width / 2;
      const cy0 = r.top + r.height * 0.48;
      const dx = e.clientX - cx0;
      const dy = e.clientY - cy0;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 260);
      tx = (dx / d) * 8 * k;
      ty = (dy / d) * 6 * k;
    };
    const tick = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      pupils.current?.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [track, eyesClosed]);

  const body = dormant ? ["#cfcadb", "#9d97ad"] : ["#ad94ff", "#6a47ea"];
  const belly = dormant ? "#e7e3ef" : "#d6c9ff";

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 240 240"
      role="img"
      aria-label={title ?? (m ? `${m.name} Daemon` : "Sleeping Daemon")}
      className={cx("overflow-visible", className)}
    >
      <defs>
        <radialGradient id={`b${uid}`} cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor={body[0]} />
          <stop offset="100%" stopColor={body[1]} />
        </radialGradient>
        <radialGradient id={`a${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={hue} stopOpacity="0.9" />
          <stop offset="100%" stopColor={hue} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* aura */}
      <circle cx="120" cy="128" r="118" fill={`url(#a${uid})`} className="animate-aura" style={{ transformOrigin: "120px 128px" }} />

      {/* boost ring */}
      {boosted && !dormant && (
        <g className="animate-ring" style={{ transformOrigin: "120px 128px" }}>
          <circle cx="120" cy="128" r="108" fill="none" stroke="#ff7a45" strokeWidth="3" strokeDasharray="4 14" strokeLinecap="round" />
        </g>
      )}

      <g className="animate-breathe">
        {/* ears */}
        <path d="M68 86 L52 30 Q86 40 104 70 Z" fill={body[1]} />
        <path d="M172 86 L188 30 Q154 40 136 70 Z" fill={body[1]} />
        <path d="M70 78 L60 44 Q82 52 94 70 Z" fill="#ffb3d1" opacity={dormant ? 0.35 : 0.55} />
        <path d="M170 78 L180 44 Q158 52 146 70 Z" fill="#ffb3d1" opacity={dormant ? 0.35 : 0.55} />

        {/* feet */}
        <ellipse cx="90" cy="204" rx="20" ry="10" fill={body[1]} />
        <ellipse cx="150" cy="204" rx="20" ry="10" fill={body[1]} />

        {/* body */}
        <ellipse cx="120" cy="132" rx="88" ry="78" fill={`url(#b${uid})`} />
        <ellipse cx="120" cy="164" rx="50" ry="36" fill={belly} opacity="0.55" />
        <ellipse cx="88" cy="88" rx="22" ry="12" fill="white" opacity="0.28" transform="rotate(-24 88 88)" />

        {/* flexing arms */}
        {mood === 3 && (
          <g fill={body[1]}>
            <path d="M36 140 Q20 112 34 96 Q46 90 50 104 Q44 116 52 132 Z" />
            <path d="M204 140 Q220 112 206 96 Q194 90 190 104 Q196 116 188 132 Z" />
          </g>
        )}

        {/* cheeks */}
        <ellipse cx="74" cy="150" rx="13" ry="8" fill="#ff8fb8" opacity={dormant ? 0.25 : 0.5} />
        <ellipse cx="166" cy="150" rx="13" ry="8" fill="#ff8fb8" opacity={dormant ? 0.25 : 0.5} />

        {/* eyes */}
        {eyesClosed ? (
          <g stroke="#1e1238" strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M78 122 Q92 132 106 122" />
            <path d="M134 122 Q148 132 162 122" />
          </g>
        ) : (
          <g>
            <g className="animate-blink">
              <ellipse cx="92" cy="118" rx="21" ry={mood === 2 ? 25 : 22} fill="white" />
              <ellipse cx="148" cy="118" rx="21" ry={mood === 2 ? 25 : 22} fill="white" />
            </g>
            <g ref={pupils}>
              <circle cx="92" cy="120" r={mood === 2 ? 7 : 10} fill="#1e1238" />
              <circle cx="148" cy="120" r={mood === 2 ? 7 : 10} fill="#1e1238" />
              <circle cx="96" cy="115" r="3.5" fill="white" />
              <circle cx="152" cy="115" r="3.5" fill="white" />
            </g>
            {/* lids & brows by mood */}
            {mood === 0 && (
              <g fill={body[1]}>
                <path d="M70 118 Q70 94 92 94 Q114 94 114 118 Z" />
                <path d="M126 118 Q126 94 148 94 Q170 94 170 118 Z" />
              </g>
            )}
            {mood === 1 && (
              <g>
                <path d="M70 114 Q70 94 92 94 Q114 94 114 110 Z" fill={body[1]} />
                <path d="M126 112 Q126 94 148 94 Q170 94 170 116 Z" fill={body[1]} />
                <path d="M128 86 Q148 74 168 84" stroke="#1e1238" strokeWidth="4.5" strokeLinecap="round" fill="none" />
              </g>
            )}
            {mood === 2 && (
              <g stroke="#1e1238" strokeWidth="4.5" strokeLinecap="round" fill="none">
                <path d="M72 88 L108 98" />
                <path d="M168 88 L132 98" />
              </g>
            )}
            {mood === 3 && (
              <g stroke="#1e1238" strokeWidth="4.5" strokeLinecap="round" fill="none">
                <path d="M72 90 Q92 78 110 90" />
                <path d="M130 90 Q148 78 168 90" />
              </g>
            )}
          </g>
        )}

        {/* mouth */}
        {dormant && <path d="M112 166 Q120 170 128 166" stroke="#1e1238" strokeWidth="4" strokeLinecap="round" fill="none" />}
        {mood === 0 && <path d="M104 160 Q120 172 136 160" stroke="#1e1238" strokeWidth="4.5" strokeLinecap="round" fill="none" />}
        {mood === 1 && <path d="M104 164 Q126 170 140 154" stroke="#1e1238" strokeWidth="4.5" strokeLinecap="round" fill="none" />}
        {mood === 2 && <ellipse cx="120" cy="166" rx="13" ry="15" fill="#1e1238" />}
        {mood === 2 && <ellipse cx="120" cy="174" rx="8" ry="5" fill="#ff6b8a" />}
        {mood === 3 && (
          <g>
            <path d="M98 154 Q120 186 142 154 Z" fill="#1e1238" />
            <path d="M102 156 L138 156 L136 162 L104 162 Z" fill="white" />
          </g>
        )}
        {mood === 4 && <ellipse cx="120" cy="166" rx="6" ry="7" fill="#1e1238" />}
      </g>

      {/* mood effects */}
      {mood === 0 && (
        <g className="animate-float" fill={hue}>
          <path d="M196 64 v-26 l16 -4 v24" stroke={hue} strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="192" cy="66" r="6" />
          <circle cx="208" cy="62" r="6" />
        </g>
      )}
      {mood === 1 && <path d="M60 54 l5 -14 l5 14 l14 5 l-14 5 l-5 14 l-5 -14 l-14 -5 Z" fill="#fff6c2" className="animate-float" />}
      {mood === 2 && (
        <g fill={hue}>
          <path d="M28 80 L44 60 L40 76 L54 74 L36 98 L40 82 Z" style={{ animation: "spark 1.2s ease-in-out infinite", transformOrigin: "40px 78px" }} />
          <path d="M198 58 L214 38 L210 54 L224 52 L206 76 L210 60 Z" style={{ animation: "spark 1.2s ease-in-out .5s infinite", transformOrigin: "210px 56px" }} />
        </g>
      )}
      {mood === 3 &&
        (
          [
            [40, 54, 0],
            [204, 46, 0.4],
            [214, 120, 0.8],
            [24, 128, 1.1],
          ] as const
        ).map(([x, y, d]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y - 10} l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z`}
            fill="#ffd166"
            style={{ animation: `spark 1.6s ease-in-out ${d}s infinite`, transformOrigin: `${x}px ${y}px` }}
          />
        ))}
      {(mood === 4 || dormant) && (
        <g fill={dormant ? "#9d97ad" : hue} fontFamily="var(--font-display)" fontWeight="800">
          <text x="176" y="70" fontSize="22" style={{ animation: "zzz 3s ease-in infinite" }}>z</text>
          <text x="190" y="50" fontSize="16" style={{ animation: "zzz 3s ease-in 1s infinite" }}>z</text>
        </g>
      )}
    </svg>
  );
}

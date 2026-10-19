"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Pick it up, move it, drop it. Pointer-based so it works with mouse, pen and touch. */
export function Draggable({
  children,
  className,
  style,
  rotate = 0,
  label,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  rotate?: number;
  label?: string;
}) {
  const start = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState(false);

  return (
    <div
      role="img"
      aria-label={label}
      className={`drag-hint ${className ?? ""}`}
      style={{
        ...style,
        transform: `translate(${pos.x}px, ${pos.y}px) rotate(${held ? 0 : rotate}deg) scale(${held ? 1.12 : 1})`,
        transition: held ? "none" : "transform 0.45s cubic-bezier(0.3, 1.6, 0.5, 1)",
        zIndex: held ? 40 : undefined,
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
        setHeld(true);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        setPos({ x: s.ox + e.clientX - s.x, y: s.oy + e.clientY - s.y });
      }}
      onPointerUp={() => {
        start.current = null;
        setHeld(false);
      }}
      onPointerCancel={() => {
        start.current = null;
        setHeld(false);
      }}
    >
      {children}
    </div>
  );
}

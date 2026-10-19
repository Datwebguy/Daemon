/**
 * Lightweight canvas confetti. Appends a fixed, full-screen, click-through canvas,
 * animates ~60 pieces and removes itself when done. Does nothing for people who
 * prefer reduced motion (and on the server).
 */
export type ConfettiOptions = {
  /** burst origin in viewport pixels (defaults to the middle of the screen) */
  x?: number;
  y?: number;
  /** number of pieces, default 60 */
  count?: number;
};

const FALLBACK = { jelly: "#7a5af0", spark: "#ff7a45", mint: "#12a57a" };
const YELLOW = "#ffd166";
const PINK = "#ff8fb8";

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  round: boolean;
  life: number;
  age: number;
};

function palette(): string[] {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return [read("--jelly", FALLBACK.jelly), read("--spark", FALLBACK.spark), read("--mint", FALLBACK.mint), YELLOW, PINK];
}

export function burstConfetti(opts: ConfettiOptions = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const colors = palette();
  const ox = opts.x ?? w / 2;
  const oy = opts.y ?? h * 0.45;
  const count = opts.count ?? 60;
  const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const speed = 6 + Math.random() * 9;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[i % colors.length] ?? YELLOW,
      round: Math.random() < 0.3,
      life: 90 + Math.random() * 60,
      age: 0,
    };
  });

  let raf = 0;
  let last = performance.now();
  const stop = () => {
    cancelAnimationFrame(raf);
    canvas.remove();
  };
  const step = (now: number) => {
    const dt = Math.min((now - last) / 16.67, 3);
    last = now;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of pieces) {
      p.age += dt;
      if (p.age >= p.life || p.y > h + 20) continue;
      alive++;
      p.vy += 0.35 * dt;
      p.vx *= Math.pow(0.985, dt);
      p.vy *= Math.pow(0.99, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.globalAlpha = Math.min(1, (p.life - p.age) / 25);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (alive === 0) {
      stop();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  // safety net so a throttled tab can never leave the canvas behind
  window.setTimeout(stop, 4000);
}

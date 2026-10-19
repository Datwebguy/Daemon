/** Dark ink or white, whichever reads better on a #rrggbb background. */
export function inkOn(hex: string): "#1e1238" | "#ffffff" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#1e1238";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.22 ? "#1e1238" : "#ffffff";
}

/** Shared classes that turn a Button into a hard-shadow sticker button. */
export const STICKER_BTN = "border-[3px] border-[color:var(--st-line)] !shadow-[3px_3px_0_var(--st-shadow)] hover:-translate-y-0.5";

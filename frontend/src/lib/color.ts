/** Convert "RRGGBB" (no leading #) to HSL. Returns null on bad input. */
export function rgbToHsl(hex: string | null | undefined): { h: number; s: number; l: number } | null {
  if (!hex || hex.length < 6) return null;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

/**
 * Sort key that produces a hue-walk roughly matching how a human sorts a pile:
 *   1. chromatic colors first, ordered red → orange → yellow → green → cyan → blue → magenta
 *      (with lighter shades within the same hue first)
 *   2. grayscale next: white → gray → black
 *   3. unknown / no rgb last
 *
 * Lower triple = appears earlier.
 */
export function colorSortKey(rgb: string | null | undefined): [number, number, number] {
  const hsl = rgbToHsl(rgb);
  if (!hsl) return [3, 0, 0];
  if (hsl.s < 0.15) return [2, -hsl.l, 0];   // grayscale group; bright→dark
  return [1, hsl.h, -hsl.l];                  // chromatic; ROYGBIV; lighter→darker
}

export function compareSortKey(a: [number, number, number], b: [number, number, number]) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

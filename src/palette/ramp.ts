import { oklabToLinearRgb, oklabToOklch, oklchToOklab, linearToSrgb8, rgba32ToOklab, pack } from "../core/color.ts";
import type { Palette, RGBA32 } from "../core/types.ts";

export function hueShiftRamp(baseRgb24: number, n: number, opts: { dL?: number; dHdeg?: number } = {}): RGBA32[] {
  if (n <= 0) return [];
  const dL = opts.dL ?? 0.6, dHdeg = opts.dHdeg ?? 40;
  const [r, g, b] = [(baseRgb24 >>> 16) & 255, (baseRgb24 >>> 8) & 255, baseRgb24 & 255];
  const [L0, C0, h0] = oklabToOklch(...rgba32ToOklab(pack(r, g, b, 255)));
  const warm = 90;
  const delta = ((warm - h0 + 540) % 360) - 180;
  const sigma = delta < 0 ? -1 : 1;
  const result: RGBA32[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const L = Math.max(0.08, Math.min(0.97, L0 + t * dL));
    const C = C0 * (1 - 0.6 * (2 * Math.abs(t)) ** 1.5);
    const h = h0 + t * dHdeg * sigma;
    let chroma = C;
    let lab = oklchToOklab(L, chroma, h);
    let linear = oklabToLinearRgb(...lab);
    if (linear.some((v) => v < 0 || v > 1)) {
      let lo = 0, hi = chroma;
      for (let j = 0; j < 12; j++) {
        const mid = (lo + hi) / 2;
        const candidate = oklabToLinearRgb(...oklchToOklab(L, mid, h));
        if (candidate.every((v) => v >= 0 && v <= 1)) lo = mid;
        else hi = mid;
      }
      lab = oklchToOklab(L, lo, h);
      linear = oklabToLinearRgb(...lab);
    }
    result.push(pack(linearToSrgb8(linear[0]), linearToSrgb8(linear[1]), linearToSrgb8(linear[2]), 255));
  }
  return result;
}

export function sortPalette(palette: Palette): Palette {
  const colors = Array.from(palette.colors);
  const rest = colors.slice(1).sort((x, y) => {
    const [lx, ax, bx] = rgba32ToOklab(x), [ly, ay, by] = rgba32ToOklab(y);
    const hx = Math.floor((((Math.atan2(bx, ax) * 180 / Math.PI + 360) % 360) / 30));
    const hy = Math.floor((((Math.atan2(by, ay) * 180 / Math.PI + 360) % 360) / 30));
    return hx - hy || lx - ly;
  });
  return {
    colors: Uint32Array.from([colors[0]!, ...rest]),
    ...(palette.names === undefined ? {} : { names: [palette.names[0], ...rest.map((color) => palette.names![colors.indexOf(color)])] }),
    ...(palette.locked === undefined ? {} : { locked: Uint8Array.from([palette.locked[0]!, ...rest.map((color) => palette.locked![colors.indexOf(color)]!)]) }),
  };
}

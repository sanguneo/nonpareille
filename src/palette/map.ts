import { deltaE2, rgba32ToOklab, rgbToOklab } from "../core/color.ts";
import type { Palette } from "../core/types.ts";

export function paletteLab(palette: Palette): Float32Array {
  const result = new Float32Array(palette.colors.length * 3);
  for (let i = 1; i < palette.colors.length; i++) {
    const lab = rgba32ToOklab(palette.colors[i]!);
    result[i * 3] = lab[0];
    result[i * 3 + 1] = lab[1];
    result[i * 3 + 2] = lab[2];
  }
  return result;
}

export class PaletteMapper {
  private readonly labs: Float32Array;
  private readonly sorted: number[];
  private readonly cache = new Map<number, number>();

  constructor(private readonly palette: Palette) {
    this.labs = paletteLab(palette);
    this.sorted = Array.from({ length: Math.max(0, palette.colors.length - 1) }, (_, i) => i + 1)
      .sort((a, b) => this.labs[a * 3]! - this.labs[b * 3]!);
  }

  nearestIndex(rgb24: number): number;
  nearestIndex(r: number, g: number, b: number): number;
  nearestIndex(rOrRgb: number, g?: number, b?: number): number {
    const key = g === undefined || b === undefined
      ? rOrRgb & 0xffffff
      : ((rOrRgb & 255) << 16) | ((g & 255) << 8) | (b & 255);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const lab = g === undefined || b === undefined
      ? rgbToOklab((key >>> 16) & 255, (key >>> 8) & 255, key & 255)
      : rgbToOklab(rOrRgb, g, b);
    let best = 1;
    let bestDistance = Infinity;
    if (this.palette.colors.length <= 33) {
      for (let i = 1; i < this.palette.colors.length; i++) {
        const distance = deltaE2(lab, [this.labs[i * 3]!, this.labs[i * 3 + 1]!, this.labs[i * 3 + 2]!]);
        if (distance < bestDistance) { bestDistance = distance; best = i; }
      }
    } else {
      for (const i of this.sorted) {
        const dL = lab[0] - this.labs[i * 3]!;
        if (dL * dL >= bestDistance) break;
        const distance = deltaE2(lab, [this.labs[i * 3]!, this.labs[i * 3 + 1]!, this.labs[i * 3 + 2]!]);
        if (distance < bestDistance) { bestDistance = distance; best = i; }
      }
    }
    this.cache.set(key, best);
    return best;
  }

  nearestIndexLab(L: number, a: number, b: number): number {
    let best = 1;
    let bestDistance = Infinity;
    for (let i = 1; i < this.palette.colors.length; i++) {
      const dL = L - this.labs[i * 3]!;
      const da = a - this.labs[i * 3 + 1]!;
      const db = b - this.labs[i * 3 + 2]!;
      const distance = dL * dL + da * da + db * db;
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    }
    return best;
  }
}

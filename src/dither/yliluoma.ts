import { deltaE2, rgba32ToOklab } from "../core/color.ts";
import type { Palette } from "../core/types.ts";
import { bayerMatrix } from "./ordered.ts";

export function yliluomaDither(
  cellsRGBA: Uint8ClampedArray,
  W: number,
  H: number,
  palette: Palette,
  n = 4,
): Uint16Array {
  const matrix = bayerMatrix(n as 2 | 4 | 8 | 16);
  const labs = Array.from(palette.colors, rgba32ToOklab);
  const cache = new Map<number, [number, number, number]>();
  const N = n * n;
  const result = new Uint16Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const offset = p * 4;
    if (cellsRGBA[offset + 3]! < 128) continue;
    const key = (cellsRGBA[offset]! << 16) | (cellsRGBA[offset + 1]! << 8) | cellsRGBA[offset + 2]!;
    let choice = cache.get(key);
    if (choice === undefined) {
      const target = rgba32ToOklab(((key << 8) | 255) >>> 0);
      let cost = Infinity;
      choice = [1, 1, 0];
      for (let i = 1; i < palette.colors.length; i++) for (let j = i; j < palette.colors.length; j++) {
        const li = labs[i]!, lj = labs[j]!;
        const separation = deltaE2(li, lj);
        for (let k = 0; k <= N; k++) {
          const f = k / N;
          const mix: [number, number, number] = [
            li[0] + f * (lj[0] - li[0]),
            li[1] + f * (lj[1] - li[1]),
            li[2] + f * (lj[2] - li[2]),
          ];
          const score = deltaE2(target, mix) + 0.1 * separation * (Math.abs(f - 0.5) + 0.5);
          if (score < cost) { cost = score; choice = [i, j, k]; }
        }
      }
      cache.set(key, choice);
    }
    const x = p % W, y = Math.floor(p / W);
    result[p] = matrix[y % n]![x % n]! < choice[2] ? choice[1] : choice[0];
  }
  return result;
}

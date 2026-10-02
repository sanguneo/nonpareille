import { deltaE, linearRgbToOklab, rgba32ToOklab, rgbToOklab, srgbToLinear } from "../core/color.ts";
import type { Palette } from "../core/types.ts";

export function bayerMatrix(n: 2 | 4 | 8 | 16): number[][] {
  let matrix = [[0, 2], [3, 1]];
  while (matrix.length < n) {
    const size = matrix.length;
    const next = Array.from({ length: size * 2 }, () => Array<number>(size * 2));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = matrix[y]![x]!;
      next[y]![x] = 4 * v;
      next[y]![x + size] = 4 * v + 2;
      next[y + size]![x] = 4 * v + 3;
      next[y + size]![x + size] = 4 * v + 1;
    }
    matrix = next;
  }
  return matrix;
}

export function bayerDither(
  cellsRGBA: Uint8ClampedArray,
  W: number,
  H: number,
  palette: Palette,
  n: 2 | 4 | 8 | 16,
  opts: { strength?: number; mode?: "luma" | "rgb" } = {},
): Uint16Array {
  const { strength = 1, mode = "luma" } = opts;
  const matrix = bayerMatrix(n);
  const labs = Array.from({ length: palette.colors.length }, (_, i) => rgba32ToOklab(palette.colors[i]!));
  const nearest = (lab: readonly number[]): number => {
    let best = 1, distance = Infinity;
    for (let i = 1; i < labs.length; i++) {
      const d = deltaE(lab, labs[i]!);
      if (d < distance) { distance = d; best = i; }
    }
    return best;
  };
  const distances: number[] = [];
  for (let i = 1; i < labs.length; i++) {
    let best = Infinity;
    for (let j = 1; j < labs.length; j++) if (i !== j) best = Math.min(best, deltaE(labs[i]!, labs[j]!));
    if (Number.isFinite(best)) distances.push(best);
  }
  distances.sort((a, b) => a - b);
  const r = distances.length === 0 ? 0 : distances[Math.floor(distances.length / 2)]!;
  const result = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    const alpha = cellsRGBA[p + 3]!;
    if (alpha < 128) continue;
    const red = cellsRGBA[p]!, green = cellsRGBA[p + 1]!, blue = cellsRGBA[p + 2]!;
    const t = (matrix[y % n]![x % n]! + 0.5) / (n * n) - 0.5;
    const lab = rgbToOklab(red, green, blue);
    let adjusted: [number, number, number];
    if (mode === "luma") adjusted = [lab[0] + strength * r * t, lab[1], lab[2]];
    else adjusted = linearRgbToOklab(
      srgbToLinear(red) + strength * r * t,
      srgbToLinear(green) + strength * r * t,
      srgbToLinear(blue) + strength * r * t,
    );
    result[y * W + x] = nearest(adjusted);
  }
  return result;
}

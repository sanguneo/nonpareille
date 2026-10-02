import { rgba32ToOklab } from "../core/color.ts";
import type { Palette } from "../core/types.ts";

export type DiffusionKernel = {
  divisor: number;
  taps: readonly (readonly [dx: number, dy: number, weight: number])[];
};

export const KERNELS: Record<string, DiffusionKernel> = {
  "floyd-steinberg": { divisor: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  "jarvis-judice-ninke": { divisor: 48, taps: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
  stucki: { divisor: 42, taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]] },
  burkes: { divisor: 32, taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] },
  sierra3: { divisor: 32, taps: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]] },
  sierra2: { divisor: 16, taps: [[1, 0, 4], [2, 0, 3], [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1]] },
  "sierra-lite": { divisor: 4, taps: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
  atkinson: { divisor: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
};

export function diffuseDither(
  cellsRGBA: Uint32Array,
  W: number,
  H: number,
  palette: Palette,
  kernel: keyof typeof KERNELS,
  opts: { strength?: number; serpentine?: boolean } = {},
): Uint16Array {
  const { strength = 1, serpentine = true } = opts;
  const selected = KERNELS[kernel]!;
  const indices = new Uint16Array(W * H);
  const work = new Float32Array(W * H * 3);
  const labs = new Float32Array(palette.colors.length * 3);
  for (let i = 1; i < palette.colors.length; i++) {
    const lab = rgba32ToOklab(palette.colors[i]!);
    labs[i * 3] = lab[0];
    labs[i * 3 + 1] = lab[1];
    labs[i * 3 + 2] = lab[2];
  }
  for (let i = 0; i < cellsRGBA.length; i++) {
    if ((cellsRGBA[i]! & 255) === 0) continue;
    const lab = rgba32ToOklab(cellsRGBA[i]!);
    work[i * 3] = lab[0];
    work[i * 3 + 1] = lab[1];
    work[i * 3 + 2] = lab[2];
  }
  for (let y = 0; y < H; y++) {
    const reverse = serpentine && (y & 1) === 1;
    for (let step = 0; step < W; step++) {
      const x = reverse ? W - 1 - step : step;
      const p = y * W + x;
      if ((cellsRGBA[p]! & 255) === 0) continue;
      const base = p * 3;
      let best = 1, bestDistance = Infinity;
      for (let i = 1; i < palette.colors.length; i++) {
        const dL = work[base]! - labs[i * 3]!;
        const da = work[base + 1]! - labs[i * 3 + 1]!;
        const db = work[base + 2]! - labs[i * 3 + 2]!;
        const d = dL * dL + da * da + db * db;
        if (d < bestDistance) { bestDistance = d; best = i; }
      }
      indices[p] = best;
      const eL = (work[base]! - labs[best * 3]!) * strength;
      const ea = Math.max(-0.1, Math.min(0.1, (work[base + 1]! - labs[best * 3 + 1]!) * strength));
      const eb = Math.max(-0.1, Math.min(0.1, (work[base + 2]! - labs[best * 3 + 2]!) * strength));
      for (const [dx, dy, weight] of selected.taps) {
        const tx = x + (reverse ? -dx : dx), ty = y + dy;
        if (tx < 0 || tx >= W || ty >= H) continue;
        const target = ty * W + tx;
        if ((cellsRGBA[target]! & 255) === 0) continue;
        const offset = target * 3, factor = weight / selected.divisor;
        work[offset] = work[offset]! + eL * factor;
        work[offset + 1] = work[offset + 1]! + ea * factor;
        work[offset + 2] = work[offset + 2]! + eb * factor;
      }
    }
  }
  return indices;
}

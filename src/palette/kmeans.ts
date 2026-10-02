import { deltaE2 } from "../core/color.ts";
import type { Histogram } from "./histogram.ts";

export function kmeans(hist: Histogram, init: Float32Array, opts: {
  locked?: Uint8Array; maxIter?: number; tol?: number; onIter?: (J: number) => void;
} = {}): Float32Array {
  const centers = new Float32Array(init);
  const K = Math.floor(centers.length / 3), maxIter = opts.maxIter ?? 32, tol = opts.tol ?? 1e-4;
  for (let iter = 0; iter < maxIter; iter++) {
    const sums = new Float64Array(K * 3), weights = new Float64Array(K), errors = new Float64Array(hist.colors.length);
    let J = 0;
    for (let i = 0; i < hist.colors.length; i++) {
      let best = 0, distance = Infinity;
      for (let k = 0; k < K; k++) {
        const d = deltaE2(
          [hist.lab[i * 3]!, hist.lab[i * 3 + 1]!, hist.lab[i * 3 + 2]!],
          [centers[k * 3]!, centers[k * 3 + 1]!, centers[k * 3 + 2]!],
        );
        if (d < distance) { best = k; distance = d; }
      }
      errors[i] = distance; J += hist.weights[i]! * distance; weights[best] = weights[best]! + hist.weights[i]!;
      for (let d = 0; d < 3; d++) sums[best * 3 + d] = sums[best * 3 + d]! + hist.lab[i * 3 + d]! * hist.weights[i]!;
    }
    opts.onIter?.(J);
    let movement = 0;
    for (let k = 0; k < K; k++) {
      if (opts.locked?.[k]) continue;
      if (weights[k]! === 0 && hist.colors.length) {
        let worst = 0;
        for (let i = 1; i < errors.length; i++) if (errors[i]! > errors[worst]!) worst = i;
        for (let d = 0; d < 3; d++) {
          const value = hist.lab[worst * 3 + d]!;
          movement = Math.max(movement, Math.abs(value - centers[k * 3 + d]!));
          centers[k * 3 + d] = value;
        }
      } else if (weights[k]! > 0) for (let d = 0; d < 3; d++) {
        const value = sums[k * 3 + d]! / weights[k]!;
        movement = Math.max(movement, Math.abs(value - centers[k * 3 + d]!));
        centers[k * 3 + d] = value;
      }
    }
    if (movement < tol) break;
  }
  return centers;
}

import { oklabToRgb8 } from "../core/color.ts";
import { createPalette } from "../core/grid.ts";
import type { Palette, RGBAImage } from "../core/types.ts";
import { buildHistogram } from "./histogram.ts";
import { kmeans } from "./kmeans.ts";
import { medianCut } from "./median-cut.ts";

export function extractPalette(img: RGBAImage, K: number, opts: { alphaThreshold?: number; locked?: Uint8Array } = {}): Palette {
  const hist = buildHistogram(img, opts.alphaThreshold);
  K = Math.max(1, Math.min(K, hist.colors.length));
  const initial = medianCut(hist, K);
  const centers = kmeans(hist, initial, { ...(opts.locked === undefined ? {} : { locked: opts.locked }) });
  const colors = Array.from({ length: K }, (_, k) => {
    const [r, g, b] = oklabToRgb8(centers[k * 3]!, centers[k * 3 + 1]!, centers[k * 3 + 2]!);
    return (((r << 24) | (g << 16) | (b << 8) | 255) >>> 0);
  });
  return createPalette([...new Set(colors)]);
}

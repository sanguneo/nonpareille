import { pack, rgbToOklab } from "../core/color.ts";
import type { RGBAImage } from "../core/types.ts";

export interface Histogram {
  colors: Uint32Array;
  weights: Float64Array;
  lab: Float32Array;
}

export function buildHistogram(img: RGBAImage, alphaThreshold = 128): Histogram {
  const counts = new Map<number, number>();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! < alphaThreshold) continue;
    const rgb = (pack(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, 255) >>> 8);
    counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
  }
  if (counts.size > 65536) {
    const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
    for (const [rgb, count] of counts) {
      const r = (rgb >>> 16) & 255, g = (rgb >>> 8) & 255, b = rgb & 255;
      const key = ((r >>> 3) << 10) | ((g >>> 3) << 5) | (b >>> 3);
      const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bin.count += count; bin.r += r * count; bin.g += g * count; bin.b += b * count;
      bins.set(key, bin);
    }
    counts.clear();
    for (const bin of bins.values()) {
      const rgb = ((Math.round(bin.r / bin.count) << 16) |
        (Math.round(bin.g / bin.count) << 8) | Math.round(bin.b / bin.count)) >>> 0;
      counts.set(rgb, bin.count);
    }
  }
  const entries = [...counts].sort(([a], [b]) => a - b);
  const colors = Uint32Array.from(entries, ([rgb]) => rgb);
  const weights = Float64Array.from(entries, ([, weight]) => weight);
  const lab = new Float32Array(colors.length * 3);
  colors.forEach((rgb, i) => {
    const v = rgbToOklab((rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255);
    lab.set(v, i * 3);
  });
  return { colors, weights, lab };
}

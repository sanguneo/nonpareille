/**
 * PixelOE-style contrast-aware outline expansion.
 * Inspired by PixelOE, licensed under Apache-2.0.
 */
import type { RGBAImage } from "../core/types.ts";
import { rgbToOklab } from "../core/color.ts";

type Stats = { med: number; lo: number; hi: number };

export function outlineExpand(
  img: RGBAImage,
  period: number,
  opts: { kw?: number; ne?: number; nd?: number } = {},
): RGBAImage {
  const { kw = 10, ne = 2, nd = 2 } = opts;
  const w = img.width, h = img.height;
  const win = Math.max(1, Math.round(2 * period));
  const stride = Math.max(1, Math.round(period / 2));
  const gx = Math.ceil(Math.max(0, w - 1) / stride) + 1;
  const gy = Math.ceil(Math.max(0, h - 1) / stride) + 1;
  const stats: Stats[] = [];
  const luminance = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    luminance[i] = rgbToOklab(img.data[o]!, img.data[o + 1]!, img.data[o + 2]!)[0];
  }
  for (let sy = 0; sy < gy; sy++) for (let sx = 0; sx < gx; sx++) {
    const x0 = Math.min(w - 1, sx * stride), y0 = Math.min(h - 1, sy * stride);
    const values: number[] = [];
    for (let y = y0; y < Math.min(h, y0 + win); y++)
      for (let x = x0; x < Math.min(w, x0 + win); x++) values.push(luminance[y * w + x]!);
    values.sort((a, b) => a - b);
    const quantile = (p: number) => values[Math.floor((values.length - 1) * p)]!;
    stats.push({ med: quantile(.5), lo: quantile(.05), hi: quantile(.95) });
  }
  const weights = new Float32Array(w * h);
  const sample = (x: number, y: number, key: keyof Stats) => {
    const fx = x / stride, fy = y / stride;
    const x0 = Math.min(gx - 1, Math.floor(fx)), y0 = Math.min(gy - 1, Math.floor(fy));
    const x1 = Math.min(gx - 1, x0 + 1), y1 = Math.min(gy - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const a = stats[y0 * gx + x0]![key], b = stats[y0 * gx + x1]![key];
    const c = stats[y1 * gx + x0]![key], d = stats[y1 * gx + x1]![key];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const med = sample(x, y, "med"), lo = sample(x, y, "lo"), hi = sample(x, y, "hi");
    const z = kw * ((med - lo) - (hi - med));
    weights[y * w + x] = 1 / (1 + Math.exp(-z));
  }
  const filter = (source: RGBAImage, dilate: boolean): RGBAImage => {
    const out = { width: w, height: h, data: new Uint8ClampedArray(source.data) };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let best = dilate ? -Infinity : Infinity, color = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.max(0, Math.min(w - 1, x + dx)), yy = Math.max(0, Math.min(h - 1, y + dy));
        const i = yy * w + xx, v = luminance[i]!;
        if (dilate ? v > best : v < best) { best = v; color = i * 4; }
      }
      const o = (y * w + x) * 4;
      out.data[o] = source.data[color]!;
      out.data[o + 1] = source.data[color + 1]!;
      out.data[o + 2] = source.data[color + 2]!;
      out.data[o + 3] = source.data[color + 3]!;
    }
    return out;
  };
  const repeat = (source: RGBAImage, dilate: boolean, count: number) => {
    let out = source;
    for (let i = 0; i < count; i++) out = filter(out, dilate);
    return out;
  };
  const eroded = repeat(img, false, ne), dilated = repeat(img, true, nd);
  const mixed = { width: w, height: h, data: new Uint8ClampedArray(img.data) };
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 4; c++) {
    const weight = weights[i]!;
    mixed.data[i * 4 + c] = weight * eroded.data[i * 4 + c]! + (1 - weight) * dilated.data[i * 4 + c]!;
  }
  return filter(filter(filter(filter(mixed, false), true), true), false);
}

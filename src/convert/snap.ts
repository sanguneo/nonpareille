import { createPalette } from "../core/grid.ts";
import { oklabToRgb8, pack } from "../core/color.ts";
import { detectGrid, type GridEstimate } from "./grid-detect.ts";
import { removeBorderBackground } from "../cleanup/alpha.ts";
import { removeOrphans } from "../cleanup/orphans.ts";
import type { DotGrid, Palette, RGBAImage } from "../core/types.ts";
import { buildHistogram } from "../palette/histogram.ts";
import { kmeans } from "../palette/kmeans.ts";
import { medianCut } from "../palette/median-cut.ts";
import { cellsToGrid, resample, type SampleMode } from "./resample.ts";

export interface SnapOptions {
  sample?: SampleMode;
  trim?: number;
  palette?: { kind: "fixed"; colors: number[] } | { kind: "auto"; k: number } | { kind: "none" };
  removeBackground?: boolean;
  orphans?: boolean;
}

export function snap(
  img: RGBAImage,
  est: GridEstimate,
  o: SnapOptions = {},
): { grid: DotGrid; purity: number } {
  const xs = est.mesh?.xs;
  const ys = est.mesh?.ys;
  const W = xs ? xs.length - 1 : est.W;
  const H = ys ? ys.length - 1 : est.H;
  const source = o.removeBackground ? removeBorderBackground(img) : img;
  const sampled = resample(source, { x0: 0, y0: 0, w: img.width, h: img.height }, W, H,
    o.sample ?? "mode", { trim: o.trim ?? 0.15, ...(xs ? { xs } : {}), ...(ys ? { ys } : {}) });
  let palette: Palette | undefined;
  if (o.palette?.kind === "fixed") {
    palette = createPalette(o.palette.colors);
  } else if (o.palette?.kind === "auto") {
    const hist = buildHistogram({ width: W, height: H, data: colorsToImage(sampled.colors) });
    if (hist.colors.length) {
      const count = Math.min(o.palette.k, hist.colors.length);
      const init = medianCut(hist, count);
      const centers = kmeans(hist, init);
      const colors: number[] = [];
      for (let k = 0; k < count; k++) {
        const L = centers[3 * k]!, a = centers[3 * k + 1]!, b = centers[3 * k + 2]!;
        const [r, g, bl] = oklabToRgb8(L, a, b);
        colors.push(pack(r, g, bl, 255));
      }
      palette = createPalette(colors);
    }
  }
  let grid = cellsToGrid(sampled.colors, W, H, palette);
  if (o.orphans) grid = removeOrphans(grid).grid;
  return { grid, purity: sampled.purity };
}

function colorsToImage(colors: Uint32Array): Uint8ClampedArray {
  const data = new Uint8ClampedArray(colors.length * 4);
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i]!;
    data[4 * i] = c >>> 24;
    data[4 * i + 1] = c >>> 16;
    data[4 * i + 2] = c >>> 8;
    data[4 * i + 3] = c & 255;
  }
  return data;
}

export function snapImage(
  img: RGBAImage,
  o: SnapOptions & { expect?: [number, number] } = {},
): { grid: DotGrid; purity: number; confidence: number } {
  const est = detectGrid(img, o.expect ? { periodX: img.width / o.expect[0] } : undefined);
  if (est.confidence >= 0.15) {
    const result = snap(img, est, o);
    return { ...result, confidence: est.confidence };
  }
  if (!o.expect) return { ...snap(img, est, o), confidence: est.confidence };
  const [W, H] = o.expect;
  const sampled = resample(img, { x0: 0, y0: 0, w: img.width, h: img.height }, W, H,
    o.sample ?? "mode", { trim: o.trim ?? 0.15 });
  let grid = cellsToGrid(sampled.colors, W, H,
    o.palette?.kind === "fixed" ? createPalette(o.palette.colors) : undefined);
  if (o.orphans) grid = removeOrphans(grid).grid;
  return { grid, purity: sampled.purity, confidence: est.confidence };
}

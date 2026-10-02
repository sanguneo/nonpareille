import { SRGB_TO_LINEAR, deltaE2, linearToSrgb8, oklabToRgb8, pack, rgbToOklab } from "../core/color.ts";
import { createGrid, createPalette } from "../core/grid.ts";
import type { DotGrid, Palette, RGBAImage } from "../core/types.ts";
import { buildHistogram } from "../palette/histogram.ts";
import { kmeans } from "../palette/kmeans.ts";
import { medianCut } from "../palette/median-cut.ts";
import { PaletteMapper } from "../palette/map.ts";

export type SampleMode = "center" | "mean" | "median" | "mode" | "dominant" | "kcentroid" | "contrast";

export interface ResampleOptions {
  trim?: number;
  dominantTheta?: number;
  alphaThreshold?: number;
  kappa0?: number;
  xs?: number[];
  ys?: number[];
}

const K0 = 32;

/** Weighted quantile (q in 0..1) of values; `order` is sorted by value in place. */
function weightedQuantile(values: number[], weights: number[], order: number[], q: number): number {
  let total = 0;
  for (const w of weights) total += w;
  const target = q * total;
  let acc = 0;
  for (const i of order) {
    acc += weights[i]!;
    if (acc >= target) return values[i]!;
  }
  return values[order[order.length - 1]!]!;
}

function sortedOrder(values: number[]): number[] {
  return values.map((_, i) => i).sort((a, b) => values[a]! - values[b]! || a - b);
}

export function resample(
  img: RGBAImage,
  rect: { x0: number; y0: number; w: number; h: number },
  W: number,
  H: number,
  mode: SampleMode,
  opts: ResampleOptions = {},
): { colors: Uint32Array; purity: number } {
  const beta = opts.trim ?? 0.15;
  const theta = opts.dominantTheta ?? 0.45;
  const alphaThreshold = opts.alphaThreshold ?? 128;
  const kappa0 = opts.kappa0 ?? 0.5;
  const xs = opts.xs ?? Array.from({ length: W + 1 }, (_, i) => rect.x0 + i * (rect.w / W));
  const ys = opts.ys ?? Array.from({ length: H + 1 }, (_, j) => rect.y0 + j * (rect.h / H));
  const modeFamily = mode === "mode" || mode === "dominant";
  const { width, height, data } = img;

  // Pre-quantization labels (K0 = 32) for mode / dominant.
  const labelOf = new Map<number, number>();
  let labelColors: Float32Array = new Float32Array(0);
  if (modeFamily) {
    const cx0 = Math.max(0, Math.floor(rect.x0)), cy0 = Math.max(0, Math.floor(rect.y0));
    const cx1 = Math.min(width, Math.ceil(rect.x0 + rect.w)), cy1 = Math.min(height, Math.ceil(rect.y0 + rect.h));
    const cw = Math.max(0, cx1 - cx0), ch = Math.max(0, cy1 - cy0);
    const crop = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      const s = ((cy0 + y) * width + cx0) * 4;
      crop.set(data.subarray(s, s + cw * 4), y * cw * 4);
    }
    const hist = buildHistogram({ width: cw, height: ch, data: crop }, alphaThreshold);
    if (hist.colors.length) {
      labelColors = kmeans(hist, medianCut(hist, Math.min(K0, hist.colors.length)), { maxIter: 4 });
    }
  }
  const nLabels = labelColors.length / 3;
  const labelFor = (rgb: number, lab: number[]): number => {
    let l = labelOf.get(rgb);
    if (l !== undefined) return l;
    let best = 0, bd = Infinity;
    for (let k = 0; k < nLabels; k++) {
      const d = deltaE2(lab, [labelColors[k * 3]!, labelColors[k * 3 + 1]!, labelColors[k * 3 + 2]!]);
      if (d < bd) { bd = d; best = k; }
    }
    labelOf.set(rgb, best);
    return best;
  };
  const labCache = new Map<number, [number, number, number]>();
  const labOf = (rgb: number): [number, number, number] => {
    let v = labCache.get(rgb);
    if (!v) { v = rgbToOklab((rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255); labCache.set(rgb, v); }
    return v;
  };

  const colors = new Uint32Array(W * H);
  let purityTotal = 0;

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let xa = xs[i]!, xb = xs[i + 1]!, ya = ys[j]!, yb = ys[j + 1]!;
      const cx = Math.min(width - 1, Math.max(0, Math.floor((xa + xb) / 2)));
      const cy = Math.min(height - 1, Math.max(0, Math.floor((ya + yb) / 2)));
      if (modeFamily) {
        const pw = xb - xa, ph = yb - ya;
        if (pw >= 4) { xa += beta * pw; xb -= beta * pw; }
        if (ph >= 4) { ya += beta * ph; yb -= beta * ph; }
      }
      // Collect area-weighted pixels.
      const rgbs: number[] = [], alphas: number[] = [], ws: number[] = [];
      let totalW = 0;
      const c0 = Math.max(0, Math.floor(xa)), c1 = Math.min(width, Math.ceil(xb));
      const r0 = Math.max(0, Math.floor(ya)), r1 = Math.min(height, Math.ceil(yb));
      for (let r = r0; r < r1; r++) {
        const wy = Math.max(0, Math.min(r + 1, yb) - Math.max(r, ya));
        if (wy <= 0) continue;
        for (let c = c0; c < c1; c++) {
          const w = wy * Math.max(0, Math.min(c + 1, xb) - Math.max(c, xa));
          if (w <= 0) continue;
          const p = (r * width + c) * 4;
          rgbs.push((data[p]! << 16) | (data[p + 1]! << 8) | data[p + 2]!);
          alphas.push(data[p + 3]!);
          ws.push(w);
          totalW += w;
        }
      }
      if (ws.length === 0) { // degenerate cell: fall back to the nearest pixel
        const p = (cy * width + cx) * 4;
        rgbs.push((data[p]! << 16) | (data[p + 1]! << 8) | data[p + 2]!);
        alphas.push(data[p + 3]!);
        ws.push(1);
        totalW = 1;
      }

      // Opaque subset (alpha >= threshold).
      const op: number[] = [];
      let opW = 0;
      for (let n = 0; n < ws.length; n++) if (alphas[n]! >= alphaThreshold) { op.push(n); opW += ws[n]!; }

      // Purity share s* and exact-color share (also used for label-less modes).
      const share = new Map<number, number>();
      for (let n = 0; n < ws.length; n++) {
        const key = alphas[n]! >= alphaThreshold ? rgbs[n]! : -1;
        share.set(key, (share.get(key) ?? 0) + ws[n]!);
      }
      let sStar = 0;
      for (const v of share.values()) sStar = Math.max(sStar, v / totalW);

      const out = (r: number, g: number, b: number) => pack(r, g, b, 255);
      let result = 0;
      const meanColor = (): number => {
        let a = 0, lr = 0, lg = 0, lb = 0;
        for (let n = 0; n < ws.length; n++) {
          const wa = ws[n]! * alphas[n]! / 255;
          a += wa;
          lr += wa * SRGB_TO_LINEAR[(rgbs[n]! >>> 16) & 255]!;
          lg += wa * SRGB_TO_LINEAR[(rgbs[n]! >>> 8) & 255]!;
          lb += wa * SRGB_TO_LINEAR[rgbs[n]! & 255]!;
        }
        if (a / totalW < 0.5) return 0;
        return out(linearToSrgb8(lr / a), linearToSrgb8(lg / a), linearToSrgb8(lb / a));
      };

      if (mode === "center") {
        const p = (cy * width + cx) * 4;
        result = data[p + 3]! >= alphaThreshold ? out(data[p]!, data[p + 1]!, data[p + 2]!) : 0;
      } else if (mode === "mean") {
        result = meanColor();
      } else if (opW / totalW < 0.5) {
        result = 0;
      } else if (mode === "median" || mode === "contrast") {
        const Ls = op.map((n) => labOf(rgbs[n]!)[0]);
        const As = op.map((n) => labOf(rgbs[n]!)[1]);
        const Bs = op.map((n) => labOf(rgbs[n]!)[2]);
        const w = op.map((n) => ws[n]!);
        const oL = sortedOrder(Ls);
        const med = weightedQuantile(Ls, w, oL, 0.5);
        const a = weightedQuantile(As, w, sortedOrder(As), 0.5);
        const b = weightedQuantile(Bs, w, sortedOrder(Bs), 0.5);
        let L = med;
        if (mode === "contrast") {
          let mu = 0;
          for (let n = 0; n < w.length; n++) mu += w[n]! * Ls[n]!;
          mu /= opW;
          let varSum = 0;
          for (let n = 0; n < w.length; n++) varSum += w[n]! * (Ls[n]! - mu) ** 2;
          const kappa = (mu - med) / (Math.sqrt(varSum / opW) + 1e-6);
          if (kappa > kappa0) L = weightedQuantile(Ls, w, oL, 0.95);
          else if (kappa < -kappa0) L = weightedQuantile(Ls, w, oL, 0.05);
        }
        const [r, g, bl] = oklabToRgb8(L, a, b);
        result = out(r, g, bl);
      } else if (mode === "kcentroid") {
        const labs = op.map((n) => labOf(rgbs[n]!));
        const w = op.map((n) => ws[n]!);
        let lo = 0, hi = 0;
        labs.forEach((l, n) => { if (l[0] < labs[lo]![0]) lo = n; if (l[0] > labs[hi]![0]) hi = n; });
        const cen: number[][] = [[...labs[lo]!], [...labs[hi]!]];
        const mass = [0, 0];
        for (let it = 0; it < 3; it++) {
          const sum = [[0, 0, 0], [0, 0, 0]];
          mass[0] = 0; mass[1] = 0;
          labs.forEach((l, n) => {
            const k = deltaE2(l, cen[1]!) < deltaE2(l, cen[0]!) ? 1 : 0;
            mass[k]! += w[n]!;
            for (let d = 0; d < 3; d++) sum[k]![d]! += w[n]! * l[d]!;
          });
          for (let k = 0; k < 2; k++) if (mass[k]! > 0) cen[k] = sum[k]!.map((v) => v / mass[k]!);
        }
        const c = mass[1]! > mass[0]! ? cen[1]! : cen[0]!;
        const [r, g, bl] = oklabToRgb8(c[0]!, c[1]!, c[2]!);
        result = out(r, g, bl);
      } else { // mode / dominant
        const lw = new Map<number, number>();
        const labelRgb = new Map<number, Map<number, number>>();
        for (const n of op) {
          const l = labelFor(rgbs[n]!, labOf(rgbs[n]!));
          lw.set(l, (lw.get(l) ?? 0) + ws[n]!);
          let m = labelRgb.get(l);
          if (!m) { m = new Map(); labelRgb.set(l, m); }
          m.set(rgbs[n]!, (m.get(rgbs[n]!) ?? 0) + ws[n]!);
        }
        const meanRgba = meanColor();
        const meanLab = rgbToOklab((meanRgba >>> 24) & 255, (meanRgba >>> 16) & 255, (meanRgba >>> 8) & 255);
        let bestL = -1, bestW = -1, bestD = Infinity;
        for (const [l, w] of [...lw].sort((a, b) => a[0] - b[0])) {
          const d = deltaE2(meanLab, [labelColors[l * 3]!, labelColors[l * 3 + 1]!, labelColors[l * 3 + 2]!]);
          if (w > bestW + 1e-9 || (Math.abs(w - bestW) <= 1e-9 && d < bestD)) { bestL = l; bestW = w; bestD = d; }
        }
        sStar = bestW / totalW;
        if (mode === "dominant" && bestW / opW < theta) {
          result = meanRgba;
        } else {
          let rgb = 0, rw = -1;
          for (const [c, w] of [...labelRgb.get(bestL)!].sort((a, b) => a[0] - b[0])) {
            if (w > rw) { rw = w; rgb = c; }
          }
          result = out((rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255);
        }
      }
      colors[j * W + i] = result;
      purityTotal += sStar;
    }
  }
  return { colors, purity: purityTotal / (W * H) };
}

/** Builds a DotGrid from per-cell RGBA32 colors: unique-color palette, or nearest-color mapping to `palette`. */
export function cellsToGrid(colors: Uint32Array, W: number, H: number, palette?: Palette): DotGrid {
  if (palette) {
    const grid = createGrid(W, H, palette);
    const mapper = new PaletteMapper(palette);
    for (let n = 0; n < colors.length; n++) {
      const c = colors[n]!;
      grid.data[n] = (c & 255) === 0 ? 0 : mapper.nearestIndex(c >>> 8);
    }
    return grid;
  }
  const index = new Map<number, number>();
  const unique: number[] = [];
  for (const c of colors) {
    if ((c & 255) !== 0 && !index.has(c)) { index.set(c, unique.length + 1); unique.push(c); }
  }
  const grid = createGrid(W, H, createPalette(unique));
  for (let n = 0; n < colors.length; n++) grid.data[n] = index.get(colors[n]!) ?? 0;
  return grid;
}

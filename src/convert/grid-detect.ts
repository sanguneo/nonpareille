import { deltaE, rgbToOklab } from "../core/color.ts";
import type { RGBAImage } from "../core/types.ts";

export interface GridEstimate {
  px: number;
  py: number;
  phiX: number;
  phiY: number;
  W: number;
  H: number;
  confidence: number;
  mesh?: { xs: number[]; ys: number[] };
}

const TAU = 2 * Math.PI;
const mod = (x: number, p: number): number => ((x % p) + p) % p;

interface Axis {
  p: number;
  phi: number;
  confidence: number;
}

function spectrum(e: Float64Array, f: number): [number, number] {
  const cr = Math.cos(TAU * f), ci = -Math.sin(TAU * f);
  let zr = 1, zi = 0, re = 0, im = 0;
  for (let x = 0; x < e.length; x++) {
    re += e[x]! * zr;
    im += e[x]! * zi;
    const next = zr * cr - zi * ci;
    zi = zr * ci + zi * cr;
    zr = next;
  }
  return [re, im];
}

function amplitude(e: Float64Array, f: number, sum: number): number {
  const [re, im] = spectrum(e, f);
  return sum > 0 ? Math.hypot(re, im) / sum : 0;
}

function atPeriod(E: Float64Array, p: number): Axis {
  const sum = E.reduce((a, b) => a + b, 0);
  const mean = sum / E.length;
  const e = E.map(v => v - mean);
  const [re, im] = spectrum(E, 1 / p);
  return { p, phi: mod(-Math.atan2(im, re) / TAU * p, p), confidence: amplitude(e, 1 / p, sum) };
}

function estimate(E: Float64Array, prior?: number): Axis {
  const sum = E.reduce((a, b) => a + b, 0);
  const e = E.map(v => v - sum / E.length);
  const lo = prior === undefined ? 2 : Math.max(2, prior * 0.6);
  const hi = prior === undefined ? E.length / 4 : Math.min(E.length / 4, prior * 1.6);
  const values: number[] = [];
  let max = 0;
  for (let i = 0; lo + i * 0.05 <= hi; i++) {
    const a = amplitude(e, 1 / (lo + i * 0.05), sum);
    values.push(a);
    max = Math.max(max, a);
  }
  let p = lo;
  for (let i = 0; i < values.length; i++) {
    const a = values[i]!;
    if (a >= max * 0.5 && a >= (values[i - 1] ?? -1) && a >= (values[i + 1] ?? -1)) {
      p = lo + i * 0.05;
    }
  }
  if (max < 0.15 && prior !== undefined) return estimate(E);
  let numerator = 0, denominator = 0;
  for (let k = 1; k <= Math.min(4, Math.floor(p / 2)); k++) {
    const f0 = k / p;
    let bestF = f0, bestA = -1;
    for (let i = 0; i <= 80; i++) {
      const f = (0.98 + i * 0.0005) * f0;
      const a = amplitude(e, f, sum);
      if (a > bestA) { bestA = a; bestF = f; }
    }
    numerator += k * bestF;
    denominator += k * k;
  }
  return atPeriod(E, denominator > 0 ? denominator / numerator : p);
}

/** Full cells plus partial end cells covering at least half a period. */
function boundaries(n: number, axis: Axis): number[] {
  const first = Math.ceil(-axis.phi / axis.p);
  const last = Math.floor((n - axis.phi) / axis.p);
  const bs: number[] = [];
  for (let k = first; k <= last; k++) bs.push(axis.phi + k * axis.p);
  const lf = bs[0] ?? n, rf = n - (bs[bs.length - 1] ?? 0);
  if (lf < axis.p / 2 && rf < axis.p / 2 && lf + rf >= axis.p / 2) {
    // Two half fragments of one phase-shifted cell: keep exactly one, on the larger side.
    if (lf >= rf) bs.unshift(0); else bs.push(n);
    return bs;
  }
  if (lf >= axis.p / 2) bs.unshift(0);
  if (rf >= axis.p / 2) bs.push(n);
  return bs;
}

function snapMesh(E: Float64Array, axis: Axis): number[] {
  const bs = boundaries(E.length, axis);
  const mean = E.reduce((a, b) => a + b, 0) / E.length;
  const sd = Math.sqrt(E.reduce((a, b) => a + (b - mean) ** 2, 0) / E.length);
  return bs.map(b => {
    if (b === 0 || b === E.length) return b;
    let best = -1, xBest = b;
    for (let x = Math.max(1, Math.ceil(b - axis.p / 4)); x <= Math.min(E.length - 1, Math.floor(b + axis.p / 4)); x++) {
      if (E[x]! > best) { best = E[x]!; xBest = x; }
    }
    return best > mean + sd ? xBest : b;
  });
}

/** Contrast between neighboring cell means divided by within-cell deviation. */
function quality(lab: Float32Array, width: number, xs: number[], ys: number[]): number {
  const w = xs.length - 1, h = ys.length - 1;
  const means: [number, number, number][] = [];
  let variance = 0, cells = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = xs[i + 1]! - xs[i]!, dy = ys[j + 1]! - ys[j]!;
    const x0 = Math.ceil(xs[i]! + 0.15 * dx), x1 = Math.ceil(xs[i + 1]! - 0.15 * dx);
    const y0 = Math.ceil(ys[j]! + 0.15 * dy), y1 = Math.ceil(ys[j + 1]! - 0.15 * dy);
    let L = 0, a = 0, b = 0, squares = 0, count = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const q = 3 * (y * width + x);
      const l = lab[q]!, aa = lab[q + 1]!, bb = lab[q + 2]!;
      L += l; a += aa; b += bb;
      squares += l * l + aa * aa + bb * bb;
      count++;
    }
    const c: [number, number, number] = count ? [L / count, a / count, b / count] : [0, 0, 0];
    means.push(c);
    if (count) { variance += Math.max(0, squares / count - c[0] ** 2 - c[1] ** 2 - c[2] ** 2); cells++; }
  }
  let contrast = 0, pairs = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = means[j * w + i]!;
    if (i + 1 < w) { contrast += deltaE(c, means[j * w + i + 1]!); pairs++; }
    if (j + 1 < h) { contrast += deltaE(c, means[(j + 1) * w + i]!); pairs++; }
  }
  return pairs && cells ? contrast / pairs / Math.sqrt(variance / cells + 1e-4) : 0;
}

export function detectGrid(img: RGBAImage, prior?: { periodX?: number; periodY?: number }): GridEstimate {
  // Halve oversized inputs before the quadratic spectral search.
  if (Math.max(img.width, img.height) > 4096) {
    const width = Math.ceil(img.width / 2), height = Math.ceil(img.height / 2);
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const source = 4 * ((2 * y) * img.width + 2 * x);
      for (let c = 0; c < 4; c++) data[4 * (y * width + x) + c] = img.data[source + c]!;
    }
    const est = detectGrid({ width, height, data }, {
      ...(prior?.periodX !== undefined ? { periodX: prior.periodX / 2 } : {}),
      ...(prior?.periodY !== undefined ? { periodY: prior.periodY / 2 } : {}),
    });
    return { ...est, px: est.px * 2, py: est.py * 2, phiX: est.phiX * 2, phiY: est.phiY * 2,
      ...(est.mesh ? { mesh: { xs: est.mesh.xs.map(x => x * 2), ys: est.mesh.ys.map(y => y * 2) } } : {}) };
  }
  const labs = new Float32Array(img.width * img.height * 3);
  for (let i = 0; i < img.width * img.height; i++) {
    // A fixed key makes hidden RGB irrelevant.
    const c = img.data[4 * i + 3]! < 128 ? rgbToOklab(255, 0, 255)
      : rgbToOklab(img.data[4 * i]!, img.data[4 * i + 1]!, img.data[4 * i + 2]!);
    labs.set(c, 3 * i);
  }
  const corners = [0, img.width - 1, (img.height - 1) * img.width, img.width * img.height - 1];
  let key = corners[0]!, votes = 0;
  for (const i of corners) {
    let n = 0;
    for (const j of corners) if (Math.hypot(labs[3 * i]! - labs[3 * j]!, labs[3 * i + 1]! - labs[3 * j + 1]!, labs[3 * i + 2]! - labs[3 * j + 2]!) < 0.04) n++;
    if (n > votes) { votes = n; key = i; }
  }
  const bg = labs.subarray(3 * key, 3 * key + 3);
  let left = 0, right = img.width, top = 0, bottom = img.height;
  const background = (x: number, y: number): boolean => {
    const i = 3 * (y * img.width + x);
    return Math.hypot(labs[i]! - bg[0]!, labs[i + 1]! - bg[1]!, labs[i + 2]! - bg[2]!) < 0.04;
  };
  const column = (x: number): boolean => {
    for (let y = top; y < bottom; y++) if (!background(x, y)) return false;
    return true;
  };
  const row = (y: number): boolean => {
    for (let x = left; x < right; x++) if (!background(x, y)) return false;
    return true;
  };
  while (right - left > 1 && column(left)) left++;
  while (right - left > 1 && column(right - 1)) right--;
  while (bottom - top > 1 && row(top)) top++;
  while (bottom - top > 1 && row(bottom - 1)) bottom--;
  const width = right - left, height = bottom - top;
  const lab = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) lab.set(labs.subarray(3 * ((top + y) * img.width + left), 3 * ((top + y) * img.width + right)), 3 * y * width);
  const ex = new Float64Array(width), ey = new Float64Array(height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = 3 * (y * width + x);
    for (const [step, profile, index] of [[3, ex, x], [3 * width, ey, y]] as const) {
      if (index === 0) continue;
      const d = Math.hypot(lab[i]! - lab[i - step]!, lab[i + 1]! - lab[i - step + 1]!, lab[i + 2]! - lab[i - step + 2]!);
      profile[index] = profile[index]! + d;
    }
  }
  // Zero energy is not evidence of an upscale.
  if (ex.some(v => v > 0) && ey.some(v => v > 0)) {
    for (let s = Math.floor(width / 2); s >= 2; s--) {
      if (width % s || height % s) continue;
      let exact = true;
      for (let x = 1; x < width; x++) if (x % s && ex[x]! > 1e-6) { exact = false; break; }
      if (exact) for (let y = 1; y < height; y++) if (y % s && ey[y]! > 1e-6) { exact = false; break; }
      if (exact) return { px: s, py: s, phiX: left, phiY: top, W: width / s, H: height / s, confidence: 1,
        mesh: { xs: Array.from({ length: width / s + 1 }, (_, i) => left + i * s), ys: Array.from({ length: height / s + 1 }, (_, i) => top + i * s) } };
    }
  }
  // Subtract the per-axis noise floor (median edge energy): boundaries are sparse, so the
  // median measures noise, and removing it keeps confidence meaningful on noisy inputs.
  for (const profile of [ex, ey]) {
    const floor = Float64Array.from(profile).sort()[profile.length >> 1] ?? 0;
    for (let k = 0; k < profile.length; k++) profile[k] = Math.max(0, profile[k]! - floor);
  }
  let ax = estimate(ex, prior?.periodX), ay = estimate(ey, prior?.periodY);
  if (Math.abs(ax.p - ay.p) / Math.max(ax.p, ay.p) < 0.03) {
    const p = (ax.p * ax.confidence + ay.p * ay.confidence) / (ax.confidence + ay.confidence || 1);
    ax = atPeriod(ex, p); ay = atPeriod(ey, p);
  }
  // Score both axes together so half cells do not win by artificially reducing variance.
  let best = -1, bx = ax, by = ay;
  for (const factor of [1, 2, 0.5, 0]) {
    const px = factor ? ax.p * factor : Math.round(ax.p);
    const py = factor ? ay.p * factor : Math.round(ay.p);
    if (px < 2 || py < 2) continue;
    const cx = atPeriod(ex, px), cy = atPeriod(ey, py);
    const q = quality(lab, width, boundaries(width, cx), boundaries(height, cy));
    if (q > best) { best = q; bx = cx; by = cy; }
  }
  const confidence = Math.min(bx.confidence, by.confidence);
  const xs = snapMesh(ex, bx), ys = snapMesh(ey, by);
  return { px: bx.p, py: by.p, phiX: bx.phi + left, phiY: by.phi + top,
    W: confidence < 0.15 ? 0 : xs.length - 1, H: confidence < 0.15 ? 0 : ys.length - 1, confidence,
    mesh: { xs: xs.map(x => x + left), ys: ys.map(y => y + top) } };
}

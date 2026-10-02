/** Harri-style 6D shape-vector ASCII rendering (plan 5.10.4). */
import type { RGBAImage } from "../core/types.ts";
import { rgbToOklab } from "../core/color.ts";
import { CIRCLES, GLYPHS, RADIUS_CW } from "./glyph-vectors.ts";

export interface ShapeAsciiOptions {
  cols: number;
  dirExp?: number;
  globalExp?: number;
  edgeChars?: boolean;
  /** Emit ANSI truecolor foreground from the cell mean color. */
  color?: boolean;
  /** Memoize lookups by 30-bit quantized key (result must not depend on it). Default true. */
  cache?: boolean;
}

const N = CIRCLES.length;
const HEX: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  ...Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3) * 0.5, Math.sin((k * Math.PI) / 3) * 0.5] as const),
];

function enhance(v: number[], m: (d: number) => number, e: number): void {
  for (let d = 0; d < v.length; d++) {
    const md = m(d);
    v[d] = md > 0 ? md * Math.pow((v[d] as number) / md, e) : 0;
  }
}

export function toShapeAscii(img: RGBAImage, opts: ShapeAsciiOptions): string {
  const { dirExp = 2, globalExp = 1.5, edgeChars = false, color = false, cache = true } = opts;
  const cols = Math.max(1, Math.floor(opts.cols));
  const cw = img.width / cols;
  const ch = cw * GLYPHS.cellAspect;
  const rows = Math.max(1, Math.floor(img.height / ch));
  const r = RADIUS_CW * cw;

  const lum = (x: number, y: number): number => {
    const xi = Math.min(img.width - 1, Math.max(0, Math.floor(x)));
    const yi = Math.min(img.height - 1, Math.max(0, Math.floor(y)));
    const o = (yi * img.width + xi) * 4;
    const a = (img.data[o + 3] as number) / 255;
    return rgbToOklab(img.data[o] as number, img.data[o + 1] as number, img.data[o + 2] as number)[0] * a;
  };
  const sample = (cx: number, cy: number): number => {
    let s = 0;
    for (const [hx, hy] of HEX) s += lum(cx + hx * r, cy + hy * r);
    return s / HEX.length;
  };

  const memo = new Map<number, number>();
  const nearest = (v: number[]): number => {
    const q = v.map((x) => Math.min(31, Math.max(0, Math.round(x * 31))));
    let key = 0;
    for (const x of q) key = key * 32 + x;
    if (cache) {
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
    }
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < GLYPHS.vectors.length; c++) {
      const g = GLYPHS.vectors[c] as number[];
      let s = 0;
      for (let d = 0; d < N; d++) {
        const diff = (q[d] as number) / 31 - (g[d] as number);
        s += diff * diff;
      }
      if (s < bestD) {
        bestD = s;
        best = c;
      }
    }
    if (cache) memo.set(key, best);
    return best;
  };

  const picks = new Array<number>(rows * cols);
  const meanL = new Float64Array(rows * cols);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = i * cw;
      const y0 = j * ch;
      const v: number[] = [];
      const x: number[] = [];
      for (const c of CIRCLES) {
        const px = c.u * cw;
        const py = c.v * ch;
        v.push(sample(x0 + px, y0 + py));
        // reflect across the nearest cell edge
        const dl = px;
        const dr = cw - px;
        const dt = py;
        const db = ch - py;
        const m = Math.min(dl, dr, dt, db);
        let ex = px;
        let ey = py;
        if (m === dl) ex = -px;
        else if (m === dr) ex = 2 * cw - px;
        else if (m === dt) ey = -py;
        else ey = 2 * ch - py;
        x.push(sample(x0 + ex, y0 + ey));
      }
      enhance(v, (d) => Math.max(v[d] as number, x[d] as number), dirExp);
      const gm = Math.max(...v);
      enhance(v, () => gm, globalExp);
      meanL[j * cols + i] = v.reduce((a, b) => a + b, 0) / N;
      picks[j * cols + i] = nearest(v);
    }
  }

  const glyphs = picks.map((p) => GLYPHS.chars[p] as string);
  if (edgeChars) {
    const L = (i: number, j: number): number =>
      meanL[Math.min(rows - 1, Math.max(0, j)) * cols + Math.min(cols - 1, Math.max(0, i))] as number;
    const mag = new Float64Array(rows * cols);
    const ang = new Float64Array(rows * cols);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const gx = L(i + 1, j - 1) + 2 * L(i + 1, j) + L(i + 1, j + 1) - L(i - 1, j - 1) - 2 * L(i - 1, j) - L(i - 1, j + 1);
        const gy = L(i - 1, j + 1) + 2 * L(i, j + 1) + L(i + 1, j + 1) - L(i - 1, j - 1) - 2 * L(i, j - 1) - L(i + 1, j - 1);
        mag[j * cols + i] = Math.hypot(gx, gy);
        ang[j * cols + i] = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
      }
    }
    const sorted = Array.from(mag).sort((a, b) => b - a);
    const thr = sorted[Math.max(0, Math.ceil(sorted.length * 0.1) - 1)] as number;
    for (let k = 0; k < mag.length; k++) {
      if ((mag[k] as number) > 0 && (mag[k] as number) >= thr) {
        const a = ang[k] as number;
        glyphs[k] = a < 22.5 || a >= 157.5 ? "|" : a < 67.5 ? "/" : a < 112.5 ? "-" : "\\";
      }
    }
  }

  const lines: string[] = [];
  for (let j = 0; j < rows; j++) {
    let line = "";
    for (let i = 0; i < cols; i++) {
      const g = glyphs[j * cols + i] as string;
      if (!color) {
        line += g;
        continue;
      }
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      const xa = Math.floor(i * cw);
      const xb = Math.max(xa + 1, Math.floor((i + 1) * cw));
      const ya = Math.floor(j * ch);
      const yb = Math.max(ya + 1, Math.floor((j + 1) * ch));
      for (let y = ya; y < Math.min(yb, img.height); y++) {
        for (let x = xa; x < Math.min(xb, img.width); x++) {
          const o = (y * img.width + x) * 4;
          sr += img.data[o] as number;
          sg += img.data[o + 1] as number;
          sb += img.data[o + 2] as number;
          n++;
        }
      }
      n = n || 1;
      line += `\x1b[38;2;${Math.round(sr / n)};${Math.round(sg / n)};${Math.round(sb / n)}m${g}`;
    }
    lines.push(color ? line + "\x1b[0m" : line);
  }
  return lines.join("\n");
}

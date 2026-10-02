/**
 * Builds src/text/glyph-vectors.json: per-glyph ink ratios inside the 6 sampling circles.
 * Usage: bun scripts/build-glyph-vectors.ts [--font path.ttf]
 */
import opentype from "opentype.js";

const argv = process.argv.slice(2);
const fi = argv.indexOf("--font");
const fontPath = fi >= 0 && argv[fi + 1] ? (argv[fi + 1] as string) : "C:/Windows/Fonts/consola.ttf";
// Staggered sampling circles (plan 5.10.4), row-major. R must match src/text/glyph-vectors.ts.
const RADIUS_CW = 0.28;
const CIRCLES = [
  { u: 0.3, v: 0.2 + 0.04 },
  { u: 0.7, v: 0.2 - 0.04 },
  { u: 0.3, v: 0.5 + 0.04 },
  { u: 0.7, v: 0.5 - 0.04 },
  { u: 0.3, v: 0.8 + 0.04 },
  { u: 0.7, v: 0.8 - 0.04 },
];
const CW = 12;
const RHO = 2.0;
const CH = CW * RHO;
const SS = 4;

const buf = await Bun.file(fontPath).arrayBuffer();
const font = opentype.parse(buf);
const scale = CH / (font.ascender - font.descender);
const fontSize = scale * font.unitsPerEm;
const baseline = font.ascender * scale;

type Pt = [number, number];

function flatten(cmds: opentype.PathCommand[]): Pt[][] {
  const polys: Pt[][] = [];
  let cur: Pt[] = [];
  let x = 0;
  let y = 0;
  for (const c of cmds) {
    if (c.type === "M") {
      if (cur.length) polys.push(cur);
      cur = [[c.x, c.y]];
      x = c.x;
      y = c.y;
    } else if (c.type === "L") {
      cur.push([c.x, c.y]);
      x = c.x;
      y = c.y;
    } else if (c.type === "Q") {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const d = t * t;
        cur.push([a * x + b * c.x1 + d * c.x, a * y + b * c.y1 + d * c.y]);
      }
      x = c.x;
      y = c.y;
    } else if (c.type === "C") {
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        const m = 1 - t;
        cur.push([
          m * m * m * x + 3 * m * m * t * c.x1 + 3 * m * t * t * c.x2 + t * t * t * c.x,
          m * m * m * y + 3 * m * m * t * c.y1 + 3 * m * t * t * c.y2 + t * t * t * c.y,
        ]);
      }
      x = c.x;
      y = c.y;
    } else if (c.type === "Z") {
      if (cur.length) polys.push(cur);
      cur = [];
    }
  }
  if (cur.length) polys.push(cur);
  return polys;
}

/** Nonzero winding test of point (px, py) against closed polygons. */
function inside(polys: Pt[][], px: number, py: number): boolean {
  let w = 0;
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = poly[i] as Pt;
      const [x1, y1] = poly[(i + 1) % n] as Pt;
      if (y0 <= py) {
        if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) w++;
      } else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) w--;
    }
  }
  return w !== 0;
}

const chars: string[] = [];
for (let c = 32; c < 127; c++) chars.push(String.fromCharCode(c));

const GW = CW * SS;
const GH = CH * SS;
const raw: number[][] = [];
for (const ch of chars) {
  const glyph = font.charToGlyph(ch);
  const xOff = (CW - (glyph.advanceWidth ?? 0) * scale) / 2;
  const polys = flatten(glyph.getPath(xOff, baseline, fontSize).commands);
  const ink = new Uint8Array(GW * GH);
  if (polys.length) {
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) ink[y * GW + x] = inside(polys, (x + 0.5) / SS, (y + 0.5) / SS) ? 1 : 0;
  }
  raw.push(
    CIRCLES.map((c) => {
      const cx = c.u * CW;
      const cy = c.v * CH;
      const r = RADIUS_CW * CW;
      let n = 0;
      let s = 0;
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          const dx = (x + 0.5) / SS - cx;
          const dy = (y + 0.5) / SS - cy;
          if (dx * dx + dy * dy <= r * r) {
            n++;
            s += ink[y * GW + x] as number;
          }
        }
      }
      return n ? s / n : 0;
    }),
  );
}
const maxes = CIRCLES.map((_, d) => Math.max(...raw.map((v) => v[d] as number)));
const vectors = raw.map((v) => v.map((x, d) => Number((x / ((maxes[d] as number) || 1)).toFixed(5))));
const out = { font: fontPath.split(/[\\/]/).pop() as string, cellAspect: RHO, circles: CIRCLES, chars: chars.join(""), vectors };
await Bun.write(new URL("../src/text/glyph-vectors.json", import.meta.url), JSON.stringify(out) + "\n");
console.log("wrote " + vectors.length + " glyph vectors from " + out.font);

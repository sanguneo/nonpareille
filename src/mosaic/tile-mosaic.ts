import { linearToSrgb8, rgbToOklab } from "../core/color.ts";
import { createImage, getPixel, setPixel } from "../core/image.ts";
import { mulberry32, shuffle } from "../core/prng.ts";
import type { RGBAImage } from "../core/types.ts";

type Feature = { values: number[]; mean: [number, number, number]; variance: number };

export function sliceTiles(tileset: RGBAImage, T: number): RGBAImage[] {
  if (!Number.isInteger(T) || T < 1 || tileset.width % T || tileset.height % T) {
    throw new RangeError("Tile size must evenly divide the tileset dimensions");
  }
  const tiles: RGBAImage[] = [];
  for (let y = 0; y < tileset.height; y += T) for (let x = 0; x < tileset.width; x += T) {
    const tile = createImage(T, T);
    for (let dy = 0; dy < T; dy++) for (let dx = 0; dx < T; dx++)
      setPixel(tile, dx, dy, getPixel(tileset, x + dx, y + dy));
    tiles.push(tile);
  }
  return tiles;
}

function feature(image: RGBAImage, T: number, k: number): Feature {
  const values: number[] = [];
  let variance = 0;
  for (let sy = 0; sy < k; sy++) for (let sx = 0; sx < k; sx++) {
    let lab: [number, number, number] = [0, 0, 0], n = 0;
    const samples: [number, number, number][] = [];
    for (let y = Math.floor(sy * T / k); y < Math.floor((sy + 1) * T / k); y++)
      for (let x = Math.floor(sx * T / k); x < Math.floor((sx + 1) * T / k); x++) {
        const p = (y * image.width + x) * 4;
        if (image.data[p + 3]! === 0) continue;
        const c = rgbToOklab(image.data[p]!, image.data[p + 1]!, image.data[p + 2]!);
        lab = [lab[0] + c[0], lab[1] + c[1], lab[2] + c[2]];
        samples.push(c);
        n++;
      }
    if (n) lab = [lab[0] / n, lab[1] / n, lab[2] / n];
    values.push(...lab);
    for (const sample of samples) variance += (sample[0] - lab[0]) ** 2 + (sample[1] - lab[1]) ** 2 + (sample[2] - lab[2]) ** 2;
  }
  variance /= Math.max(1, image.width * image.height);
  const mean: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < values.length; i += 3) for (let c = 0; c < 3; c++) mean[c] = mean[c]! + values[i + c]! / (values.length / 3);
  return { values, mean, variance };
}

export function tileMosaic(
  target: RGBAImage, tiles: RGBAImage[], T: number,
  opts: { k?: number; reuseRadius?: number; lambdaReuse?: number; colorCorrect?: number; seed?: number } = {},
): { indices: Uint32Array; cols: number; rows: number; image: RGBAImage } {
  const k = opts.k ?? 2, radius = opts.reuseRadius ?? 2, lambda = opts.lambdaReuse ?? 0.002;
  if (!Number.isInteger(T) || T < 1 || !Number.isInteger(k) || k < 1 || tiles.length === 0 ||
      tiles.some((tile) => tile.width !== T || tile.height !== T)) throw new RangeError("Invalid tile mosaic dimensions");
  const cols = Math.ceil(target.width / T), rows = Math.ceil(target.height / T);
  const cells: Feature[] = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const cell = createImage(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const tx = cx * T + x, ty = cy * T + y;
      if (tx < target.width && ty < target.height) setPixel(cell, x, y, getPixel(target, tx, ty));
    }
    cells.push(feature(cell, T, k));
  }
  const tileFeatures = tiles.map((tile) => feature(tile, T, k));
  const order = shuffle(mulberry32(opts.seed ?? 1), cells.map((_, i) => i).sort((a, b) => cells[b]!.variance - cells[a]!.variance));
  const indices = new Uint32Array(cells.length).fill(0xffffffff), uses = new Uint32Array(tiles.length);
  const output = createImage(cols * T, rows * T), correction = Math.max(0, Math.min(1, opts.colorCorrect ?? 0));
  for (const cellIndex of order) {
    const x = cellIndex % cols, y = Math.floor(cellIndex / cols);
    let best = -1, bestCost = Infinity;
    for (let ti = 0; ti < tiles.length; ti++) {
      let excluded = false;
      for (let yy = Math.max(0, y - radius); yy <= Math.min(rows - 1, y + radius); yy++)
        for (let xx = Math.max(0, x - radius); xx <= Math.min(cols - 1, x + radius); xx++) {
          if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) <= radius && indices[yy * cols + xx] === ti) excluded = true;
        }
      if (excluded) continue;
      const a = cells[cellIndex]!, b = tileFeatures[ti]!;
      let cost = 0;
      for (let d = 0; d < a.values.length; d++) cost += (a.values[d]! - b.values[d]!) ** 2;
      cost += lambda * uses[ti]!;
      if (cost < bestCost) { bestCost = cost; best = ti; }
    }
    if (best < 0) throw new RangeError("Reuse radius leaves no available tile");
    indices[cellIndex] = best;
    uses[best] = uses[best]! + 1;
    const tile = tiles[best]!, a = cells[cellIndex]!, b = tileFeatures[best]!;
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const p = (py * T + px) * 4, alpha = tile.data[p + 3]!;
      let rgb = [tile.data[p]!, tile.data[p + 1]!, tile.data[p + 2]!];
      if (correction && alpha) {
        const lab = rgbToOklab(rgb[0]!, rgb[1]!, rgb[2]!);
        const adjusted = lab.map((v, c) => v + correction * (a.mean[c]! - b.mean[c]!));
        rgb = labToRgb(adjusted[0]!, adjusted[1]!, adjusted[2]!);
      }
      setPixel(output, x * T + px, y * T + py,
        ((rgb[0]! << 24) | (rgb[1]! << 16) | (rgb[2]! << 8) | alpha) >>> 0);
    }
  }
  return { indices, cols, rows, image: output };
}

function labToRgb(L: number, a: number, b: number): number[] {
  const lp = L + 0.3963377774 * a + 0.2158037573 * b;
  const mp = L - 0.1055613458 * a - 0.0638541728 * b;
  const sp = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lp ** 3, m = mp ** 3, s = sp ** 3;
  return [
    linearToSrgb8(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb8(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb8(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

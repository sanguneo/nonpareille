import { describe, expect, test } from "bun:test";
import { pack, unpack } from "../src/core/color.ts";
import { mulberry32 } from "../src/core/prng.ts";
import type { RGBAImage } from "../src/core/types.ts";
import { cellsToGrid, resample } from "../src/convert/resample.ts";

const N = 32, S = 6;

function makeCells(): Uint32Array {
  const rnd = mulberry32(7);
  const pal = Array.from({ length: 8 }, (_, k) => pack(30 * k + 10, (k * 97) % 256, 255 - 25 * k, 255));
  return Uint32Array.from({ length: N * N }, () => pal[Math.floor(rnd() * pal.length)]!);
}

function upscale(cells: Uint32Array): RGBAImage {
  const w = N * S;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = unpack(cells[Math.floor(y / S) * N + Math.floor(x / S)]!);
    data.set([r, g, b, a], (y * w + x) * 4);
  }
  return { width: w, height: w, data };
}

describe("resample", () => {
  const cells = makeCells();
  const img = upscale(cells);
  const rect = { x0: 0, y0: 0, w: N * S, h: N * S };

  test("center reproduces cells 100% with purity 1", () => {
    const r = resample(img, rect, N, N, "center");
    expect(Array.from(r.colors)).toEqual(Array.from(cells));
    expect(r.purity).toBe(1);
  });

  test("mode reproduces cells 100% with purity 1", () => {
    const r = resample(img, rect, N, N, "mode");
    expect(Array.from(r.colors)).toEqual(Array.from(cells));
    expect(r.purity).toBe(1);
  });

  test("mean of a 2-color checker cell is the linear-light average", () => {
    const data = new Uint8ClampedArray(2 * 2 * 4);
    const px = [[0, 0, 0], [255, 255, 255], [255, 255, 255], [0, 0, 0]];
    px.forEach((p, n) => data.set([...p, 255], n * 4));
    const r = resample({ width: 2, height: 2, data }, { x0: 0, y0: 0, w: 2, h: 2 }, 1, 1, "mean");
    // linear 0.5 -> sRGB 188
    expect(unpack(r.colors[0]!)).toEqual([188, 188, 188, 255]);
  });

  test("transparent cell when mean alpha < 0.5", () => {
    const data = new Uint8ClampedArray(4 * 4);
    data.set([255, 0, 0, 255], 0);
    const r = resample({ width: 2, height: 2, data }, { x0: 0, y0: 0, w: 2, h: 2 }, 1, 1, "mean");
    expect(r.colors[0]).toBe(0);
  });

  test("cellsToGrid builds a unique-color palette and maps transparency to 0", () => {
    const red = pack(255, 0, 0, 255), blue = pack(0, 0, 255, 255);
    const g = cellsToGrid(Uint32Array.from([red, 0, blue, red]), 2, 2);
    expect(Array.from(g.palette.colors)).toEqual([0, red, blue]);
    expect(Array.from(g.data)).toEqual([1, 0, 2, 1]);
  });
});

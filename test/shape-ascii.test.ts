import { describe, expect, test } from "bun:test";
import type { RGBAImage } from "../src/core/types.ts";
import { GLYPHS } from "../src/text/glyph-vectors.ts";
import { toShapeAscii } from "../src/text/shape-ascii.ts";

/** One cell (cols = 1): 10x20 black image with a white bar over rows [y0, y1). */
function bar(y0: number, y1: number): RGBAImage {
  const w = 10;
  const h = 20;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = y >= y0 && y < y1 ? 255 : 0;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function maxRow(ch: string): number {
  const v = GLYPHS.vectors[GLYPHS.chars.indexOf(ch)] as number[];
  return Math.floor(v.indexOf(Math.max(...v)) / 2);
}

describe("toShapeAscii", () => {
  const cases: Array<[string, RGBAImage, number]> = [
    ["top", bar(0, 5), 0],
    ["middle", bar(8, 13), 1],
    ["bottom", bar(15, 20), 2],
  ];
  const picked = cases.map(([, img]) => toShapeAscii(img, { cols: 1 }));

  test("bars at top/middle/bottom choose three different characters", () => {
    expect(new Set(picked).size).toBe(3);
  });

  test("chosen glyph vector max row matches bar position", () => {
    cases.forEach(([, , row], k) => expect(maxRow(picked[k] as string)).toBe(row));
  });

  test("result is identical with cache on and off", () => {
    const img = bar(8, 13);
    const wide: RGBAImage = { width: 40, height: 40, data: new Uint8ClampedArray(40 * 40 * 4) };
    for (let i = 0; i < 1600; i++) {
      wide.data[i * 4] = wide.data[i * 4 + 1] = wide.data[i * 4 + 2] = (i * 37) % 256;
      wide.data[i * 4 + 3] = 255;
    }
    for (const im of [img, wide]) {
      expect(toShapeAscii(im, { cols: 8, cache: true })).toBe(toShapeAscii(im, { cols: 8, cache: false }));
    }
  });
});

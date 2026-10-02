import { describe, expect, test } from "bun:test";
import { pack, oklabToRgb8 } from "../src/core/color.ts";
import { bayerDither, bayerMatrix } from "../src/dither/ordered.ts";
import { yliluomaDither } from "../src/dither/yliluoma.ts";
import { createPalette } from "../src/core/grid.ts";

const palette = createPalette([pack(0, 0, 0, 255), pack(255, 255, 255, 255)]);

describe("ordered dithering", () => {
  test("generates the specified 4x4 Bayer matrix", () => {
    expect(bayerMatrix(4)).toEqual([
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ]);
  });

  test("assigns eight white pixels in every 4x4 midpoint gray tile", () => {
    const [gray] = oklabToRgb8(0.5, 0, 0);
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([gray!, gray!, gray!, 255], i);
    const output = bayerDither(rgba, 8, 8, palette, 4);
    for (let y = 0; y < 8; y += 4) for (let x = 0; x < 8; x += 4) {
      let white = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        if (output[(y + dy) * 8 + x + dx] === 2) white++;
      }
      expect(white).toBe(8);
    }
  });

  test("Yliluoma approximates the midpoint with half white", () => {
    const [gray] = oklabToRgb8(0.5, 0, 0);
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([gray!, gray!, gray!, 255], i);
    const output = yliluomaDither(rgba, 8, 8, palette);
    const ratio = output.reduce((count, index) => count + (index === 2 ? 1 : 0), 0) / output.length;
    expect(Math.abs(ratio - 0.5)).toBeLessThanOrEqual(1 / 16);
  });
});

import { describe, expect, test } from "bun:test";
import { oklabToRgb8, pack, rgbToOklab } from "../src/core/color.ts";
import type { Palette } from "../src/core/types.ts";
import { diffuseDither } from "../src/dither/diffusion.ts";

describe("diffuseDither", () => {
  test("preserves mean gray tone with Floyd-Steinberg", () => {
    expect(meanTone("floyd-steinberg")).toBeCloseTo(0.6, 2);
  });

  test("preserves mean gray tone with Atkinson", () => {
    expect(Math.abs(meanTone("atkinson") - 0.6)).toBeLessThanOrEqual(0.05);
  });
});

function meanTone(kernel: "floyd-steinberg" | "atkinson"): number {
  const W = 64, H = 64;
  const [r, g, b] = oklabToRgb8(0.6, 0, 0);
  const cell = pack(r, g, b, 255);
  const cells = new Uint32Array(W * H).fill(cell);
  const palette: Palette = { colors: new Uint32Array([0, pack(0, 0, 0, 255), pack(255, 255, 255, 255)]) };
  const indices = diffuseDither(cells, W, H, palette, kernel);
  let sum = 0;
  for (const index of indices) sum += rgbToOklab(index === 1 ? 0 : 255, index === 1 ? 0 : 255, index === 1 ? 0 : 255)[0];
  return sum / indices.length;
}

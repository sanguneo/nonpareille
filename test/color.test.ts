import { describe, expect, test } from "bun:test";
import { oklabToRgb8, rgbToOklab } from "../src/core/color.ts";

describe("OKLab color conversion", () => {
  test("matches reference values", () => {
    const refs: [number, number, number, [number, number, number]][] = [
      [255, 255, 255, [1, 0, 0]],
      [0, 0, 0, [0, 0, 0]],
      [255, 0, 0, [0.62796, 0.22486, 0.12585]],
      [0, 255, 0, [0.86644, -0.23389, 0.1795]],
      [0, 0, 255, [0.45201, -0.03246, -0.31153]],
    ];
    for (const [r, g, b, expected] of refs) {
      const actual = rgbToOklab(r, g, b);
      actual.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThan(1e-4));
    }
    expect(rgbToOklab(128, 128, 128)[0]).toBeCloseTo(0.59987, 4);
  });

  test("roundtrips seeded random 8-bit colors exactly", () => {
    let state = 0x12345678;
    const random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 10_000; i++) {
      const rgb: [number, number, number] = [
        Math.floor(random() * 256),
        Math.floor(random() * 256),
        Math.floor(random() * 256),
      ];
      expect(oklabToRgb8(...rgbToOklab(...rgb))).toEqual(rgb);
    }
  });
});

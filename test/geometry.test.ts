import { describe, expect, test } from "bun:test";
import {
  outputSize,
  pixelToDot,
  solveDotCount,
  solveDotSize,
  fitRect,
} from "../src/core/geometry.ts";
import type { CanvasSpec } from "../src/core/types.ts";

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe("geometry", () => {
  test("recovers dot size and count for 1000 seeded canvases", () => {
    const random = seeded(0x5eed);
    for (let n = 0; n < 1000; n++) {
      const W = 1 + Math.floor(random() * 200);
      const sx = 1 + Math.floor(random() * 32);
      const gap = Math.floor(random() * 8);
      const margin = Math.floor(random() * 12);
      const c: CanvasSpec = {
        width: W, height: 1, dotW: sx, dotH: 1, gap, gapColor: 0, margin, background: 0,
      };
      const { width } = outputSize(c);
      expect(solveDotSize(width, W, gap, margin)).toBe(sx);
      expect(solveDotCount(width, sx, gap, margin)).toBe(W);
    }
  });

  test("classifies margins, gaps, and dot interiors", () => {
    const c: CanvasSpec = {
      width: 2, height: 2, dotW: 2, dotH: 2, gap: 1, gapColor: 0, margin: 1, background: 0,
    };
    expect(pixelToDot(c, 0, 2)).toEqual({ kind: "margin" });
    expect(pixelToDot(c, 3, 2)).toEqual({ kind: "gap" });
    expect(pixelToDot(c, 4, 4)).toEqual({ kind: "dot", i: 1, j: 1 });
  });

  test("crops cover fit to the target aspect ratio", () => {
    expect(fitRect(200, 100, 10, 10, 1, 1, "cover")).toEqual({
      x0: 50, y0: 0, w: 100, h: 100,
    });
  });
});

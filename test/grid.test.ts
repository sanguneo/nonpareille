import { describe, expect, test } from "bun:test";
import { compactPalette, createGrid, createPalette, diffGrids, flatten } from "../src/core/grid.ts";
import { mulberry32 } from "../src/core/prng.ts";
import type { Frame, RGBA32 } from "../src/core/types.ts";

describe("core grid and PRNG", () => {
  test("mulberry32 produces the same sequence for the same seed", () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    expect(Array.from({ length: 8 }, () => a())).toEqual(Array.from({ length: 8 }, () => b()));
  });

  test("createPalette reserves transparent index zero", () => {
    const first: RGBA32 = 0xff0000ff;
    expect(Array.from(createPalette([first]).colors)).toEqual([0, first]);
    expect(Array.from(createPalette([0, first]).colors)).toEqual([0, first]);
  });

  test("flatten uses the topmost visible nontransparent layer", () => {
    const frame: Frame = {
      durationMs: 100,
      layers: [
        { name: "base", visible: true, data: new Uint16Array([1, 2]) },
        { name: "hidden", visible: false, data: new Uint16Array([3, 3]) },
        { name: "top", visible: true, data: new Uint16Array([0, 4]) },
      ],
    };
    expect(Array.from(flatten(frame, 2, 1))).toEqual([1, 4]);
  });

  test("diffGrids reports changed coordinates and indices", () => {
    const palette = createPalette([0xff0000ff]);
    const a = createGrid(2, 2, palette);
    const b = createGrid(2, 2, palette);
    b.data.set([0, 1, 1, 0]);
    expect(diffGrids(a, b)).toEqual([
      { i: 1, j: 0, from: 0, to: 1 },
      { i: 0, j: 1, from: 0, to: 1 },
    ]);
  });

  test("compactPalette drops unused entries and remaps dots", () => {
    const grid = createGrid(3, 1, createPalette([0xff0000ff, 0x00ff00ff, 0x0000ffff]));
    grid.data.set([3, 1, 3]);
    const compacted = compactPalette(grid);
    expect(Array.from(compacted.palette.colors)).toEqual([0, 0xff0000ff, 0x0000ffff]);
    expect(Array.from(compacted.data)).toEqual([2, 1, 2]);
  });
});

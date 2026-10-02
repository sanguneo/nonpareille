import { describe, expect, test } from "bun:test";
import { createGrid, createPalette } from "../src/core/grid.ts";
import { billOfMaterials } from "../src/mosaic/bom.ts";
import { tileMosaic } from "../src/mosaic/tile-mosaic.ts";
import type { RGBAImage } from "../src/core/types.ts";

function solid(color: number): RGBAImage {
  return { width: 1, height: 1, data: new Uint8ClampedArray([
    (color >>> 24) & 255, (color >>> 16) & 255, (color >>> 8) & 255, color & 255,
  ]) };
}

describe("tile mosaic", () => {
  test("recovers target tile indices with no reuse-radius conflicts", () => {
    const tiles = Array.from({ length: 25 }, (_, i) => solid(
      ((((i * 7 + 20) & 255) << 24) | (((i * 11 + 30) & 255) << 16) |
        (((i * 17 + 40) & 255) << 8) | 255) >>> 0,
    ));
    const target: RGBAImage = { width: 5, height: 5, data: new Uint8ClampedArray(5 * 5 * 4) };
    const expected = Uint32Array.from({ length: 25 }, (_, i) => i);
    expected.forEach((index, i) => target.data.set(tiles[index]!.data, i * 4));
    const result = tileMosaic(target, tiles, 1, { k: 1, reuseRadius: 2, seed: 17 });
    expect([...result.indices]).toEqual([...expected]);
    for (let y = 0; y < result.rows; y++) for (let x = 0; x < result.cols; x++)
      for (let yy = Math.max(0, y - 2); yy <= Math.min(result.rows - 1, y + 2); yy++)
        for (let xx = Math.max(0, x - 2); xx <= Math.min(result.cols - 1, x + 2); xx++)
          if (x !== xx || y !== yy) expect(result.indices[y * result.cols + x]).not.toBe(result.indices[yy * result.cols + xx]);
  });
});

describe("bill of materials", () => {
  test("total counts opaque dots only", () => {
    const grid = createGrid(3, 2, createPalette([0, 0xff0000ff, 0x00ff00ff]));
    grid.data.set([0, 1, 2, 1, 0, 2]);
    expect(billOfMaterials(grid)).toMatchObject({ total: 4, boards: 1 });
    expect(billOfMaterials(grid).counts.reduce((sum, row) => sum + row.count, 0)).toBe(4);
  });
});

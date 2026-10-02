import { describe, expect, test } from "bun:test";
import { createGrid } from "../src/core/grid.ts";
import { pack } from "../src/core/color.ts";
import { removeOrphans } from "../src/cleanup/orphans.ts";
import { addOutline } from "../src/cleanup/outline.ts";
import { removeBorderBackground } from "../src/cleanup/alpha.ts";

const palette = { colors: Uint32Array.from([0, pack(20, 20, 20, 255), pack(240, 240, 240, 255)]) };

describe("cleanup", () => {
  test("removes an isolated dot from a solid field", () => {
    const grid = createGrid(5, 5, palette);
    grid.data.fill(1);
    grid.data[12] = 2;
    expect(removeOrphans(grid).grid.data[12]).toBe(1);
  });

  test("keeps a 2x2 blob", () => {
    const grid = createGrid(5, 5, palette);
    grid.data.fill(1);
    grid.data[12] = 2;
    grid.data[13] = 2;
    grid.data[17] = 2;
    grid.data[18] = 2;
    expect(removeOrphans(grid).grid.data.slice(12, 19)).toEqual(grid.data.slice(12, 19));
  });

  test("outline equals the N4 exterior of a circle mask", () => {
    const grid = createGrid(5, 5, palette);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++)
      if ((x - 2) ** 2 + (y - 2) ** 2 <= 4) grid.data[y * 5 + x] = 2;
    const expected = new Uint16Array(25);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      if (grid.data[y * 5 + x]) continue;
      if ([[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) =>
        x + dx! >= 0 && y + dy! >= 0 && x + dx! < 5 && y + dy! < 5 && grid.data[(y + dy!) * 5 + x + dx!] !== 0))
        expected[y * 5 + x] = 1;
    }
    expect(addOutline(grid, { mode: "black" }).data).toEqual(expected.map((v, i) => v || grid.data[i]!));
  });

  test("border flood preserves a same-color enclosed hole", () => {
    const data = new Uint8ClampedArray(5 * 5 * 4);
    for (let i = 0; i < 25; i++) data.set([255, 0, 255, 255], i * 4);
    for (const p of [6, 7, 8, 11, 13, 16, 17, 18]) data.set([0, 0, 0, 255], p * 4);
    const result = removeBorderBackground({ width: 5, height: 5, data });
    expect(result.data[3]).toBe(0);
    expect(result.data[12 * 4 + 3]).toBe(255);
  });
});

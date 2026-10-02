import { describe, expect, test } from "bun:test";
import { applyOp, bresenham, floodFill } from "../src/draw/primitives.ts";
import { pixelPerfect } from "../src/draw/stroke.ts";
import { createGrid, createPalette } from "../src/core/grid.ts";

describe("drawing primitives", () => {
  test("Bresenham includes both ends of a diagonal", () => {
    expect(bresenham(0, 0, 7, 7)).toHaveLength(8);
  });

  test("steep line octants are symmetric", () => {
    expect(bresenham(0, 0, 2, 7)).toEqual(bresenham(2, 7, 0, 0).reverse());
    expect(bresenham(0, 0, -2, 7)).toEqual(bresenham(-2, 7, 0, 0).reverse());
  });

  test("flood fill stays within a boundary", () => {
    const grid = createGrid(5, 5, createPalette([0xff0000ff]));
    for (let i = 0; i < 5; i++) { grid.data[i] = 1; grid.data[20 + i] = 1; grid.data[i * 5] = 1; grid.data[i * 5 + 4] = 1; }
    expect(floodFill(grid, 2, 2, 1)).toHaveLength(9);
    expect(grid.data[0]).toBe(1);
  });

  test("ellipse points are symmetric about their center", () => {
    const grid = createGrid(9, 9, createPalette([0xff0000ff]));
    applyOp(grid, { type: "ellipse", x: 1, y: 1, w: 7, h: 7, idx: 1, fill: false });
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      expect(grid.data[y * 9 + x]).toBe(grid.data[(8 - y) * 9 + x]);
      expect(grid.data[y * 9 + x]).toBe(grid.data[y * 9 + (8 - x)]);
    }
  });

  test("pixel-perfect removes a doubled L corner", () => {
    expect(pixelPerfect([[0, 0], [1, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
  });

  test("changed entries reverse the applied operation", () => {
    const grid = createGrid(3, 2, createPalette([0xff0000ff]));
    const original = new Uint16Array(grid.data);
    const { changed } = applyOp(grid, { type: "set", points: [[1, 0, 1], [2, 1, 1]] });
    for (const { i, j, from } of changed) grid.data[j * grid.width + i] = from;
    expect(grid.data).toEqual(original);
  });
});

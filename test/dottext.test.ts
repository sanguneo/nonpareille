import { expect, test } from "bun:test";
import { gridEquals } from "../src/core/grid.ts";
import { parseDotText, serializeDotText } from "../src/io/dottext.ts";

test("DotText roundtrips raw and RLE grids", () => {
  const grid = parseDotText("@size 4x2\n@palette\nK #1a1c2c outline\nW #f4f4f4\n@grid\n.KWK\nWWKK");
  expect(gridEquals(parseDotText(serializeDotText(grid)), grid)).toBe(true);
  expect(gridEquals(parseDotText(serializeDotText(grid, { rle: true })), grid)).toBe(true);
});

test("DotText reports exact row length location", () => {
  expect(() => parseDotText("@size 16x1\n@grid\n...............")).toThrow(
    "line 3, col 16: expected 16 chars, got 15",
  );
});

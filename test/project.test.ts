import { expect, test } from "bun:test";
import { gridEquals } from "../src/core/grid.ts";
import { documentToGrid, gridToDocument, parseDocument, serializeDocument } from "../src/io/project.ts";

test("project JSON and grid conversion roundtrip", () => {
  const grid = {
    width: 2, height: 2,
    palette: { colors: new Uint32Array([0, 0xff00ffff]), names: [undefined, "red"] },
    data: new Uint16Array([0, 1, 1, 0]),
  };
  const doc = gridToDocument(grid);
  expect(gridEquals(documentToGrid(parseDocument(serializeDocument(doc))), grid)).toBe(true);
});

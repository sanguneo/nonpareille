import { expect, test } from "bun:test";
import { formatPaletteFile, loadPaletteSpec, parsePaletteFile } from "../src/io/palette-files.ts";

const colors = [0xff0000ff, 0x00ff00ff, 0x0000ffff];

test("hex palette roundtrip", () => {
  expect(parsePaletteFile(formatPaletteFile(colors, "hex"), "hex")).toEqual(colors);
});

test("GIMP palette roundtrip", () => {
  expect(parsePaletteFile(formatPaletteFile(colors, "gpl"), "gpl")).toEqual(colors);
});

test("JASC-PAL palette roundtrip", () => {
  expect(parsePaletteFile(formatPaletteFile(colors, "pal"), "pal")).toEqual(colors);
});

test("auto palette spec parses its size without loading presets", async () => {
  expect(await loadPaletteSpec("auto:16")).toEqual({ kind: "auto", k: 16 });
});

import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../cli/main.ts";
import { convert } from "../src/convert/pipeline.ts";
import { createImage, setPixel } from "../src/core/image.ts";
import { getPreset } from "../src/palette/presets.ts";
import { encodeRGBAPNG } from "../src/io/png-encode.ts";

const pico = getPreset("pico8");
const N = 32, S = 6;
const expected = (i: number, j: number) => pico.colors[1 + ((i * 7 + j * 3) % 16)]!;

function synthetic() {
  const img = createImage(N * S, N * S);
  for (let y = 0; y < N * S; y++)
    for (let x = 0; x < N * S; x++) setPixel(img, x, y, expected(Math.floor(x / S), Math.floor(y / S)));
  return img;
}

test("mode sampling with fixed pico8 reproduces every cell", () => {
  const grid = convert(synthetic(), {
    width: N, fit: "cover", sample: "mode", palette: { kind: "fixed", colors: Array.from(pico.colors) }, dither: "none",
  });
  expect(grid.width).toBe(N);
  expect(grid.height).toBe(N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) expect(grid.palette.colors[grid.data[j * N + i]!]).toBe(expected(i, j));
});

test("nonpareille convert CLI returns 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dot-convert-"));
  const input = join(dir, "in.png");
  writeFileSync(input, encodeRGBAPNG(synthetic()));
  expect(await main(["convert", input, "--dots", "32", "--palette", "pico8", "-o", join(dir, "out.png")])).toBe(0);
});

import { test, expect } from "bun:test";
import { makeSynthetic } from "./fixtures/synth.ts";
import { snapImage } from "../src/convert/snap.ts";
import { run } from "../cli/commands/snap.ts";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodePNG } from "../src/io/decode.ts";
import { encodeRGBAPNG } from "../src/io/png-encode.ts";

test("snaps a 7.5px synthetic grid with cell accuracy above 99%", () => {
  const { img, grid } = makeSynthetic({
    W: 32, H: 32, scale: 7.5, phaseX: 3, phaseY: 3, noise: 0, blur: false, seed: 23,
  });
  const result = snapImage(img, { expect: [32, 32] });
  let correct = 0;
  for (let i = 0; i < grid.length; i++) {
    const actual = result.grid.palette.colors[result.grid.data[i]!]!;
    if (actual === grid[i]) correct++;
  }
  expect(correct / grid.length).toBeGreaterThanOrEqual(0.99);
});

test("snap command writes a PNG and returns zero with JSON reporting", async () => {
  const { img } = makeSynthetic({
    W: 8, H: 8, scale: 4, phaseX: 0, phaseY: 0, noise: 0, blur: false, seed: 9,
  });
  const dir = mkdtempSync(join(tmpdir(), "dother-snap-"));
  const input = join(dir, "in.png"), output = join(dir, "out.png");
  try {
    const encoded = encodeRGBAPNG(img);
    await Bun.write(input, encoded);
    expect(await run([input, "--expect", "8x8", "-o", output, "--json"])).toBe(0);
    expect(decodePNG(new Uint8Array(readFileSync(output))).width).toBe(8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

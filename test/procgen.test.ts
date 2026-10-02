import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { generateSprite } from "../src/gen/bollinger.ts";
import { MASKS } from "../src/gen/masks.ts";
import { pack } from "../src/core/color.ts";
import { run } from "../cli/commands/procgen.ts";

describe("procedural sprite generation", () => {
  test("same seed produces identical PNG bytes", async () => {
    const a = "test/procgen-a.png", b = "test/procgen-b.png";
    await run(["--mask", "spaceship", "--seed", "42", "-o", a]);
    await run(["--mask", "spaceship", "--seed", "42", "-o", b]);
    expect(readFileSync(a).equals(readFileSync(b))).toBe(true);
    rmSync(a); rmSync(b);
  });

  test("mirrorX sprites are horizontally symmetric", () => {
    const grid = generateSprite(MASKS.spaceship, { seed: 42 });
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
      expect(grid.data[y * grid.width + x]).toBe(grid.data[y * grid.width + grid.width - x - 1]);
    }
  });

  test("edge pass removes empty four-neighbours beside body cells", () => {
    const mask = { data: [1, 1, 1], width: 3, height: 1, mirrorX: false, mirrorY: false };
    const grid = generateSprite(mask, { seed: 42, colored: false });
    const bodyIndex = grid.palette.colors.indexOf(pack(255, 255, 255, 255));
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
      if (grid.data[y * grid.width + x] !== bodyIndex) continue;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx!, ny = y + dy!;
        if (nx >= 0 && nx < grid.width && ny >= 0 && ny < grid.height) {
          expect(grid.data[ny * grid.width + nx]).not.toBe(0);
        }
      }
    }
  });
});

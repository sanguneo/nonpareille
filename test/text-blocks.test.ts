import { describe, expect, test } from "bun:test";
import { toBraille } from "../src/text/braille.ts";
import { toHalfBlock } from "../src/text/halfblock.ts";
import { toLumaRamp } from "../src/text/ramp.ts";
import type { DotGrid } from "../src/core/types.ts";

const grid: DotGrid = {
  width: 2,
  height: 2,
  palette: { colors: Uint32Array.from([0, 0xff0000ff, 0x00ff00ff]) },
  data: Uint16Array.from([1, 0, 0, 2]),
};

describe("terminal text renderers", () => {
  test("half-block renders all transparency cases exactly", () => {
    expect(toHalfBlock(grid)).toBe(
      "\x1b[38;2;255;0;0m\x1b[49m▀\x1b[38;2;0;255;0m▄\x1b[0m",
    );
  });

  test("braille maps all-on and left-column dots", () => {
    const full: DotGrid = {
      ...grid, width: 2, height: 4,
      palette: { colors: Uint32Array.from([0, 0x000000ff]) },
      data: new Uint16Array(8).fill(1),
    };
    expect(toBraille(full)).toBe("⣿");
    const left: DotGrid = { ...full, data: Uint16Array.from([1, 0, 1, 0, 1, 0, 1, 0]) };
    expect(toBraille(left)).toBe("⡇");
  });

  test("ramp emits one character per dot column", () => {
    expect(toLumaRamp(grid).split("\n").every((row) => row.length === grid.width)).toBe(true);
  });
});

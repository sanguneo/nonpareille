import { describe, expect, test } from "bun:test";
import { blockSize, chooseKeyColor, chooseModelCanvas } from "../src/gen/prompt.ts";

describe("image prompt numeric helpers", () => {
  test("computes integer block scale", () => {
    expect(blockSize(1024, 1024, 32, 32)).toBe(32);
  });

  test("selects canvas with closest aspect ratio", () => {
    expect(chooseModelCanvas(64, 32, "openai")).toEqual([1536, 1024]);
  });

  test("avoids a key color present throughout the palette", () => {
    expect(chooseKeyColor([0xff00ffff, 0xf000f0ff, 0xe000e0ff])).not.toBe(0xff00ff);
  });
});

import { describe, expect, test } from "bun:test";
import { outlineExpand } from "../src/convert/outline-expand.ts";

describe("outlineExpand", () => {
  test("widens a dark line on white without changing dimensions", () => {
    const width = 15, height = 9;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, v = x === 7 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    const out = outlineExpand({ width, height, data }, 4);
    expect([out.width, out.height]).toEqual([width, height]);
    const dark = Array.from({ length: width }, (_, x) => out.data[(4 * width + x) * 4]! < 128);
    expect(dark.filter(Boolean).length).toBeGreaterThanOrEqual(3);
  });
});

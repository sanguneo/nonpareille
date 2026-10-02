import { expect, test } from "bun:test";
import {
  convert,
  detectGrid,
  encodeIndexedPNG,
  generateSprite,
  parseDotText,
  renderRGBA,
  snap,
  tileMosaic,
  toHalfBlock,
} from "../src/index.ts";

test("public API exports key engine functions", () => {
  for (const fn of [
    convert,
    detectGrid,
    snap,
    parseDotText,
    renderRGBA,
    encodeIndexedPNG,
    toHalfBlock,
    generateSprite,
    tileMosaic,
  ]) {
    expect(typeof fn).toBe("function");
  }
});

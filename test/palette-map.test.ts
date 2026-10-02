import { describe, expect, test } from "bun:test";
import { PaletteMapper } from "../src/palette/map.ts";
import { getPreset } from "../src/palette/presets.ts";
import { hueShiftRamp, sortPalette } from "../src/palette/ramp.ts";
import { pack } from "../src/core/color.ts";

describe("palette utilities", () => {
  test("nearest mapping returns exact palette colors", () => {
    const palette = getPreset("pico8");
    const mapper = new PaletteMapper(palette);
    for (let i = 1; i < palette.colors.length; i++) {
      const color = palette.colors[i]!;
      expect(mapper.nearestIndex((color >>> 8) & 0xffffff)).toBe(i);
    }
  });

  test("pico8 preset has sixteen colors and transparency", () => {
    const palette = getPreset("pico8");
    expect(palette.colors.length).toBe(17);
    expect(palette.colors[0]).toBe(0);
  });

  test("hue ramp has requested length and increasing lightness", () => {
    const ramp = hueShiftRamp(0x2674c8, 7);
    expect(ramp).toHaveLength(7);
    const mapperPalette = { colors: Uint32Array.from([0, ...ramp]) };
    const mapper = new PaletteMapper(mapperPalette);
    const lightness = ramp.map((color) => mapper.nearestIndexLab(0, 0, 0)); // keep mapping type exercised
    expect(lightness).toHaveLength(7);
    const L = ramp.map((color) => {
      const [r, g, b] = [(color >>> 24) & 255, (color >>> 16) & 255, (color >>> 8) & 255];
      return color === 0 ? 0 : ((r + g + b) / 3);
    });
    for (let i = 1; i < L.length; i++) expect(L[i]!).toBeGreaterThan(L[i - 1]!);
  });

  test("sorting preserves transparent index zero", () => {
    const sorted = sortPalette({ colors: Uint32Array.from([0, pack(255, 0, 0, 255), pack(0, 0, 255, 255)]) });
    expect(sorted.colors[0]).toBe(0);
  });
});

import { describe, expect, it } from "bun:test";
import { deltaE, rgba32ToOklab } from "../src/core/color.ts";
import { createImage, setPixel } from "../src/core/image.ts";
import { extractPalette } from "../src/palette/extract.ts";
import { buildHistogram } from "../src/palette/histogram.ts";
import { kmeans } from "../src/palette/kmeans.ts";
import { medianCut } from "../src/palette/median-cut.ts";

describe("palette quantization", () => {
  it("recovers eight source colors", () => {
    const source = [0xff0000ff, 0x00ff00ff, 0x0000ffff, 0xffff00ff,
      0xff00ffff, 0x00ffffff, 0x808080ff, 0xffffffff];
    const image = createImage(8, 1);
    source.forEach((color, x) => setPixel(image, x, 0, color));
    const palette = extractPalette(image, source.length);
    expect(palette.colors.length).toBe(9);
    for (const color of source) {
      const lab = rgba32ToOklab(color);
      expect(Math.min(...Array.from(palette.colors.slice(1), (candidate) =>
        deltaE(lab, rgba32ToOklab(candidate))))).toBeLessThanOrEqual(1e-3);
    }
  });

  it("keeps weighted objective non-increasing", () => {
    const image = createImage(4, 1);
    [0xff0000ff, 0xff0000ff, 0x00ff00ff, 0x0000ffff].forEach((color, x) => setPixel(image, x, 0, color));
    const hist = buildHistogram(image);
    const values: number[] = [];
    kmeans(hist, medianCut(hist, 2), { onIter: (J) => values.push(J) });
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThanOrEqual(values[i - 1]! + 1e-12);
  });

  it("does not move a locked centroid", () => {
    const image = createImage(2, 1);
    setPixel(image, 0, 0, 0xff0000ff); setPixel(image, 1, 0, 0x00ff00ff);
    const hist = buildHistogram(image);
    const init = medianCut(hist, 2);
    init[0] = 0.123;
    const result = kmeans(hist, init, { locked: Uint8Array.of(1, 0) });
    expect(result[0]).toBeCloseTo(0.123, 6);
  });
});

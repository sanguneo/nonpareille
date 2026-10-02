import { describe, expect, test } from "bun:test";
import { generate } from "../src/gen/generate.ts";
import type { GenSpec } from "../src/gen/prompt.ts";
import type { ImageGenRequest, ImageProvider } from "../src/gen/providers/types.ts";
import { encodeRGBAPNG } from "../src/io/png-encode.ts";
import type { RGBAImage } from "../src/core/types.ts";
import { makeSynthetic } from "./fixtures/synth.ts";

const spec: GenSpec = {
  subject: "slime", view: "front", width: 32, height: 32, palette: { K: 12 },
  outline: "none", shading: "flat", lightDir: "top-left", background: "transparent",
  model: "codex-image", seed: 5,
};

function fake(img: RGBAImage, seen: ImageGenRequest[] = []): ImageProvider {
  return {
    id: "fake",
    async generate(req) {
      seen.push(req);
      return { png: encodeRGBAPNG(img), meta: {} };
    },
  };
}

describe("generate", () => {
  const { img, grid } = makeSynthetic({ W: 32, H: 32, scale: 32, phaseX: 0, phaseY: 0, noise: 0, blur: false, seed: 1 });
  const paletteColors = [...new Set(grid)];

  test("recovers a 32x32 grid within the palette", async () => {
    const { grid: out, report } = await generate(spec, fake(img), { paletteColors });
    expect(out.width).toBe(32);
    expect(out.height).toBe(32);
    expect(report.confidence).toBeGreaterThanOrEqual(0.15);
    expect(out.palette.colors.length - 1).toBeLessThanOrEqual(paletteColors.length);
    expect(report.attempts).toBe(1);
  });

  test("retries change only the seed when the grid is not recognized", async () => {
    const width = 64, height = 64;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = (i * 2654435761) >>> 24;
      data.set([v, 255 - v, (v * 7) & 255, 255], 4 * i);
    }
    const seen: ImageGenRequest[] = [];
    const { report } = await generate(spec, fake({ width, height, data }, seen), { retries: 2, paletteColors });
    expect(report.recommendRegenerate).toBe(true);
    expect(report.attempts).toBe(3);
    expect(seen.map((r) => r.seed)).toEqual([5, 6, 7]);
    expect(new Set(seen.map((r) => r.prompt)).size).toBe(1);
  });

  test("retro-diffusion skips grid detection and resamples directly", async () => {
    const small = makeSynthetic({ W: 8, H: 8, scale: 1, phaseX: 0, phaseY: 0, noise: 0, blur: false, seed: 2 });
    const rd: GenSpec = { ...spec, width: 8, height: 8, model: "retro-diffusion" };
    const { grid: out, report } = await generate(rd, fake(small.img));
    expect(out.width).toBe(8);
    expect(report.confidence).toBe(1);
  });
});

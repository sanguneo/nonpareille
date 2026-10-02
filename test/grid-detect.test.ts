import { expect, test } from "bun:test";
import { detectGrid } from "../src/convert/grid-detect.ts";
import { mulberry32 } from "../src/core/prng.ts";
import { makeSynthetic } from "./fixtures/synth.ts";

for (const [W, scale, phase] of [[32, 7.5, 3], [64, 5.3, 1.7], [48, 3.25, 0.5]] as const) {
  test(`fractional period regression ${scale}`, () => {
    const { img } = makeSynthetic({ W, H: W, scale, phaseX: phase, phaseY: phase, noise: 0.02, blur: true, seed: W });
    const est = detectGrid(img);
    expect(est.W).toBe(W);
    expect(est.H).toBe(W);
    expect(Math.abs(est.px - scale)).toBeLessThan(0.1);
  });
}

test("recovers at least 95% of 60 seeded noisy fractional grids", () => {
  const rng = mulberry32(0x51a7);
  const sizes = [16, 24, 32, 48, 64];
  let recovered = 0;
  const failures: unknown[] = [];
  for (let i = 0; i < 60; i++) {
    const W = sizes[Math.floor(rng() * sizes.length)]!, H = sizes[Math.floor(rng() * sizes.length)]!;
    const scale = 3 + rng() * 13;
    const phaseX = rng() * scale, phaseY = rng() * scale;
    const noise = rng() * 0.05, blur = i % 2 === 0;
    const { img } = makeSynthetic({ W, H, scale, phaseX, phaseY, noise, blur, seed: i + 1 });
    const est = detectGrid(img);
    if (est.W === W && est.H === H) recovered++;
    else failures.push({ W, H, scale, phaseX, phaseY, noise, blur, est });
  }
  if (failures.length) console.log("Grid recovery failures:", failures);
  expect(recovered).toBeGreaterThanOrEqual(57);
}, 30_000);

test("smooth gradient has no grid", () => {
  const width = 128, height = 128, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set([x * 2, y * 2, (x + y), 255], 4 * (y * width + x));
  }
  const est = detectGrid({ width, height, data });
  expect(est.confidence).toBeLessThan(0.15);
  expect(est.W).toBe(0);
  expect(est.H).toBe(0);
});

test("exact integer nearest neighbor upscale has confidence one", () => {
  const { img } = makeSynthetic({ W: 16, H: 24, scale: 8, phaseX: 0, phaseY: 0, noise: 0, blur: false, seed: 42 });
  const est = detectGrid(img);
  expect(est.confidence).toBe(1);
  expect(est.W).toBe(16);
  expect(est.H).toBe(24);
  expect(est.px).toBe(8);
});

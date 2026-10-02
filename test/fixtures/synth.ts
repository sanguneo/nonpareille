import { pack, unpack } from "../../src/core/color.ts";
import { mulberry32 } from "../../src/core/prng.ts";
import type { RGBAImage } from "../../src/core/types.ts";

export function makeSynthetic(o: {
  W: number; H: number; scale: number; phaseX: number; phaseY: number;
  noise: number; blur: boolean; seed: number;
}): { img: RGBAImage; grid: Uint32Array } {
  const rng = mulberry32(o.seed);
  const palette = Array.from({ length: 12 }, () => pack(
    Math.floor(32 + rng() * 192), Math.floor(32 + rng() * 192), Math.floor(32 + rng() * 192), 255));
  const grid = Uint32Array.from({ length: o.W * o.H }, () => palette[Math.floor(rng() * palette.length)]!);
  const width = Math.round(o.W * o.scale), height = Math.round(o.H * o.scale);
  let data = new Uint8ClampedArray(width * height * 4);
  // A shifted periodic crop has two partial end cells; the >= half-cell rule
  // counts exactly W/H logical cells rather than counting both fragments.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = ((Math.floor((x - o.phaseX) / o.scale) % o.W) + o.W) % o.W;
    const j = ((Math.floor((y - o.phaseY) / o.scale) % o.H) + o.H) % o.H;
    data.set(unpack(grid[j * o.W + i]!), 4 * (y * width + x));
  }
  if (o.blur) {
    for (const stride of [1, width]) {
      const out = new Uint8ClampedArray(data.length);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const lo = stride === 1 ? y * width + Math.max(0, x - 1) : Math.max(0, y - 1) * width + x;
        const hi = stride === 1 ? y * width + Math.min(width - 1, x + 1) : Math.min(height - 1, y + 1) * width + x;
        for (let c = 0; c < 4; c++) out[4 * i + c] = (data[4 * lo + c]! + 2 * data[4 * i + c]! + data[4 * hi + c]!) / 4;
      }
      data = out;
    }
  }
  if (o.noise > 0) for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const normal = (rng() + rng() + rng() + rng() + rng() + rng() - 3) / Math.sqrt(0.5);
      data[i + c] = data[i + c]! + normal * o.noise * 255;
    }
  }
  return { img: { width, height, data }, grid };
}

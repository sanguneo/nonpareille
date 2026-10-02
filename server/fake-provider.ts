import { pack, unpack } from "../src/core/color.ts";
import { mulberry32 } from "../src/core/prng.ts";
import type { ImageProvider } from "../src/gen/providers/types.ts";
import { encodeRGBAPNG } from "../src/io/png-encode.ts";

/**
 * Deterministic offline provider (NONPAREILLE_FAKE_PROVIDER=1): reads the logical
 * W x H and block size back out of the prompt and paints a seeded random 12-color
 * grid (test/fixtures/synth.ts style) upscaled by the block size.
 */
export function createFakeProvider(): ImageProvider {
  return {
    id: "fake",
    async generate(req) {
      const size = /is a (\d+)x(\d+) pixel-art grid/.exec(req.prompt);
      const blockMatch = /perfectly square (\d+)x\d+ block/.exec(req.prompt);
      const W = size ? Number(size[1]) : 32, H = size ? Number(size[2]) : 32;
      const block = Math.max(1, blockMatch ? Number(blockMatch[1]) : Math.floor(Math.min(req.size[0] / W, req.size[1] / H)));

      const rng = mulberry32(req.seed ?? 0);
      const palette = Array.from({ length: 12 }, () => pack(
        Math.floor(32 + rng() * 192), Math.floor(32 + rng() * 192), Math.floor(32 + rng() * 192), 255));
      const cells = Uint32Array.from({ length: W * H }, () => palette[Math.floor(rng() * palette.length)]!);

      const width = W * block, height = H * block;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        data.set(unpack(cells[Math.floor(y / block) * W + Math.floor(x / block)]!), 4 * (y * width + x));
      }
      return { png: encodeRGBAPNG({ width, height, data }), meta: { provider: "fake", block } };
    },
  };
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, basename, extname, join } from "node:path";
import { flagBool, flagNum, flagStr, parseArgs } from "../args.ts";
import { generateSprite } from "../../src/gen/bollinger.ts";
import { MASKS } from "../../src/gen/masks.ts";
import { createGrid } from "../../src/core/grid.ts";
import { InputError, type Palette } from "../../src/core/types.ts";
import { getPreset } from "../../src/palette/presets.ts";
import { renderRGBA } from "../../src/core/render.ts";
import { encodeRGBAPNG } from "../../src/io/png-encode.ts";
import type { CommandModule } from "./types.ts";

export const summary = "generate procedural Bollinger sprites";
export const usage = "usage: nonpareille procgen --mask spaceship --seed 42 [--count 1] [--palette pico8] [--scale 4] [--sheet] [--cols 8] -o ships.png";

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const maskName = flagStr(args, "mask") ?? "spaceship";
  const mask = MASKS[maskName as keyof typeof MASKS];
  if (!mask) throw new InputError(`unknown mask "${maskName}"`);
  const seed = flagNum(args, "seed");
  if (seed === undefined || !Number.isInteger(seed)) throw new InputError("--seed must be an integer");
  const count = flagNum(args, "count") ?? 1;
  const scale = flagNum(args, "scale") ?? 4;
  const cols = flagNum(args, "cols") ?? 8;
  if (!Number.isInteger(count) || count < 1) throw new InputError("--count must be an integer >= 1");
  if (!Number.isInteger(scale) || scale < 1) throw new InputError("--scale must be an integer >= 1");
  if (!Number.isInteger(cols) || cols < 1) throw new InputError("--cols must be an integer >= 1");
  const out = flagStr(args, "out");
  if (!out) throw new InputError("-o is required");
  const preset = flagStr(args, "palette");
  const palette: Palette | undefined = preset ? getPreset(preset) : undefined;
  const sprites = Array.from({ length: count }, (_, i) => generateSprite(mask, { seed: seed + i, ...(palette ? { palette } : {}) }));
  const sheet = flagBool(args, "sheet");
  const render = (grid: typeof sprites[number]) => {
    const canvas = { width: grid.width, height: grid.height, dotW: scale, dotH: scale, gap: 0, gapColor: 0, margin: 0, background: 0 };
    return renderRGBA(grid, canvas);
  };
  mkdirSync(dirname(out), { recursive: true });
  if (!sheet && count > 1) {
    const ext = extname(out);
    const stem = basename(out, ext);
    for (let i = 0; i < count; i++) writeFileSync(join(dirname(out), `${stem}-${i + 1}${ext || ".png"}`), encodeRGBAPNG(render(sprites[i]!)));
    return 0;
  }
  if (!sheet) {
    writeFileSync(out, encodeRGBAPNG(render(sprites[0]!)));
    return 0;
  }
  const images = sprites.map(render);
  const fw = images[0]!.width, fh = images[0]!.height, rows = Math.ceil(count / cols);
  const image = { width: cols * fw, height: rows * fh, data: new Uint8ClampedArray(cols * fw * rows * fh * 4) };
  for (let n = 0; n < count; n++) {
    const src = images[n]!;
    const ox = (n % cols) * fw, oy = Math.floor(n / cols) * fh;
    for (let y = 0; y < fh; y++) image.data.set(src.data.subarray(y * fw * 4, (y + 1) * fw * 4), ((oy + y) * image.width + ox) * 4);
  }
  writeFileSync(out, encodeRGBAPNG(image));
  return 0;
}

const mod: CommandModule = { summary, usage, run };
export default mod;

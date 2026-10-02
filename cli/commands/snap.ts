import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { flagNum, flagStr, parseArgs, parseSize } from "../args.ts";
import { InputError } from "../../src/core/types.ts";
import { snapImage } from "../../src/convert/snap.ts";
import { readImageFile } from "../../src/io/decode.ts";
import { renderRGBA } from "../../src/core/render.ts";
import { encodeRGBAPNG } from "../../src/io/png-encode.ts";
import { createPalette } from "../../src/core/grid.ts";
import { parseHexColor } from "./new.ts";
import type { CommandModule } from "./types.ts";

export const summary = "snap an AI-generated image to a dot grid";
export const usage = "usage: nonpareille snap <image> [--expect 64x64] [--palette #hex,...] [--scale 1] [--json] -o sprite.png";

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const input = args.positional[0], out = flagStr(args, "out");
  if (!input || !out) throw new InputError("input and output files are required");
  const expectText = flagStr(args, "expect");
  const expect = expectText ? parseSize(expectText) : undefined;
  const paletteText = flagStr(args, "palette");
  const palette = paletteText && paletteText !== "none"
    ? { kind: "fixed" as const, colors: paletteText.split(",").map(parseHexColor) }
    : paletteText === "none" ? { kind: "none" as const } : undefined;
  const result = await snapImage(await readImageFile(input), {
    ...(expect ? { expect } : {}),
    ...(palette ? { palette } : {}),
  });
  const scale = flagNum(args, "scale") ?? 1;
  if (!Number.isInteger(scale) || scale < 1) throw new InputError("--scale must be an integer >= 1");
  const canvas = { width: result.grid.width, height: result.grid.height, dotW: scale, dotH: scale,
    gap: 0, gapColor: 0, margin: 0, background: 0 };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodeRGBAPNG(renderRGBA(result.grid, canvas)));
  if (args.flags.has("json")) process.stdout.write(`${JSON.stringify({
    W: result.grid.width, H: result.grid.height, confidence: result.confidence, purity: result.purity,
  })}\n`);
  return 0;
}

const mod: CommandModule = { summary, usage, run };
export default mod;

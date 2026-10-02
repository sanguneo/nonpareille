import { readImageFile } from "../../src/io/decode.ts";
import { detectGrid } from "../../src/convert/grid-detect.ts";
import { InputError } from "../../src/core/types.ts";
import { flagStr, parseArgs, parseSize } from "../args.ts";
import type { CommandModule } from "./types.ts";

export const summary = "detect an AI image's logical pixel grid";
export const usage = "usage: dot detect-grid <image> [--expect 64x64] --json";

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const input = args.positional[0];
  if (!input) throw new InputError("input file is required");
  const expect = flagStr(args, "expect");
  const img = await readImageFile(input);
  const prior = expect ? { periodX: img.width / parseSize(expect)[0] } : undefined;
  const est = detectGrid(img, prior);
  process.stdout.write(`${JSON.stringify({
    px: est.px, py: est.py, phiX: est.phiX, phiY: est.phiY,
    W: est.W, H: est.H, confidence: est.confidence,
  })}\n`);
  return 0;
}

const mod: CommandModule = { summary, usage, run };
export default mod;

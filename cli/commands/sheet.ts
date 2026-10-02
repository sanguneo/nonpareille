import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { flagNum, flagStr, parseArgs } from "../args.ts";
import { InputError } from "../../src/core/types.ts";
import { encodeIndexedPNG } from "../../src/io/png-encode.ts";
import { parseDocument, documentToGrid } from "../../src/io/project.ts";
import { packSheet, sliceSheet } from "../../src/io/sheet.ts";
import { EASYRPG_PRESETS, encodeEasyRpg } from "../../src/presets/easyrpg.ts";
import type { CommandModule } from "./types.ts";

export const summary = "pack frames into sprite sheet or slice sheet into frames";
export const usage = `usage: dot sheet pack <frames...> --cols C [--preset P] -o out.png
       dot sheet slice <sheet.png> --frame WxH -o outdir`;

async function runPack(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const cols = flagNum(args, "cols");
  const out = flagStr(args, "out");

  if (!cols || !out) throw new InputError("--cols and -o are required for pack");
  if (!Number.isInteger(cols) || cols < 1) throw new InputError("--cols must be >= 1");

  if (args.positional.length === 0) throw new InputError("at least one frame file required");

  // Load frames from .dot.json files
  const frames = [];
  for (const framePath of args.positional) {
    try {
      const src = readFileSync(framePath, "utf8");
      const doc = parseDocument(src);
      frames.push(documentToGrid(doc));
    } catch (e) {
      throw new InputError(`failed to load frame ${framePath}: ${(e as Error).message}`);
    }
  }

  // Pack frames
  const pad = flagNum(args, "pad") ?? 0;
  const margin = flagNum(args, "margin") ?? 0;
  const { grid, manifest } = packSheet(frames, cols, { pad, margin });

  const preset = flagStr(args, "preset");
  let pngBytes: Uint8Array;

  if (preset) {
    const easyrpgPreset = EASYRPG_PRESETS[preset];
    if (!easyrpgPreset) {
      throw new InputError(
        `unknown preset "${preset}". Valid: ${Object.keys(EASYRPG_PRESETS).join(", ")}`,
      );
    }
    pngBytes = encodeEasyRpg(grid, easyrpgPreset);
  } else {
    pngBytes = encodeIndexedPNG({
      width: grid.width,
      height: grid.height,
      indices: grid.data,
      palette: grid.palette.colors,
    });
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pngBytes);

  return 0;
}

async function runSlice(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const frameSpec = flagStr(args, "frame");
  const out = flagStr(args, "out");

  if (!frameSpec || !out) throw new InputError("--frame and -o are required for slice");

  const sheetPath = args.positional[0];
  if (!sheetPath) throw new InputError("sheet file required");

  // Parse frame spec (WxH format)
  const frameParts = frameSpec.split("x");
  if (frameParts.length !== 2) throw new InputError("--frame must be in WxH format");

  const fw = parseInt(frameParts[0]!, 10);
  const fh = parseInt(frameParts[1]!, 10);

  if (!Number.isInteger(fw) || !Number.isInteger(fh) || fw < 1 || fh < 1) {
    throw new InputError("frame dimensions must be positive integers");
  }

  // For now, slice from PNG requires reading it as a DotGrid
  // This is a simplified version - in production we'd need to:
  // 1. Decode PNG bytes
  // 2. Convert to DotGrid
  // This is left as a stub for the basic implementation
  throw new InputError("PNG slicing not yet implemented - use .dot.json input");
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const subcommand = args.positional[0];

  if (subcommand === "pack") {
    return runPack(args.positional.slice(1).concat(argv.slice(argv.indexOf("pack") + 1)));
  } else if (subcommand === "slice") {
    return runSlice(args.positional.slice(1).concat(argv.slice(argv.indexOf("slice") + 1)));
  } else {
    throw new InputError("expected subcommand: pack or slice");
  }
}

const mod: CommandModule = { summary, usage, run };
export default mod;

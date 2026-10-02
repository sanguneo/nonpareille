import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { flagNum, flagStr, parseArgs } from "../args.ts";
import { InputError, type RGBA32 } from "../../src/core/types.ts";
import { readImageFile } from "../../src/io/decode.ts";
import { fetchLospec, formatPaletteFile, parsePaletteFile } from "../../src/io/palette-files.ts";
import { extractPalette } from "../../src/palette/extract.ts";
import { hueShiftRamp } from "../../src/palette/ramp.ts";
import { parseHexColor } from "./new.ts";
import type { CommandModule } from "./types.ts";

export const summary = "extract, fetch, convert or build color palettes";
export const usage = `usage: nonpareille palette extract <in.png> -k 16 [-o f.hex]
       nonpareille palette fetch <lospec-slug> [-o f.hex]
       nonpareille palette convert <a.gpl> <b.hex>
       nonpareille palette ramp --base #b13e53 -n 5 [-o f.hex]`;

type Format = "hex" | "gpl" | "pal";

function formatOf(path: string): Format {
  const l = path.toLowerCase();
  if (l.endsWith(".hex")) return "hex";
  if (l.endsWith(".gpl")) return "gpl";
  if (l.endsWith(".pal")) return "pal";
  throw new InputError(`unknown palette file type: ${path}`);
}

function emit(colors: RGBA32[], out: string | undefined): void {
  if (!out) {
    const text = formatPaletteFile(colors, "hex");
    process.stdout.write(text.endsWith("\n") ? text : text + "\n");
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, formatPaletteFile(colors, formatOf(out)));
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const [sub, a, b] = args.positional;
  const out = flagStr(args, "out");
  switch (sub) {
    case "extract": {
      if (!a) throw new InputError("input image is required");
      const pal = extractPalette(await readImageFile(a), flagNum(args, "k") ?? 16);
      emit(Array.from(pal.colors).slice(1), out);
      return 0;
    }
    case "fetch":
      if (!a) throw new InputError("lospec slug is required");
      emit(await fetchLospec(a), out);
      return 0;
    case "convert": {
      if (!a || !b) throw new InputError("usage: nonpareille palette convert <in> <out>");
      emit(parsePaletteFile(readFileSync(a, "utf8"), formatOf(a)), b);
      return 0;
    }
    case "ramp": {
      const base = flagStr(args, "base");
      if (!base) throw new InputError("--base is required");
      const n = flagNum(args, "n") ?? 5;
      emit(hueShiftRamp(parseHexColor(base) >>> 8, n), out);
      return 0;
    }
    default:
      throw new InputError("subcommand must be extract|fetch|convert|ramp");
  }
}

const mod: CommandModule = { summary, usage, run };
export default mod;

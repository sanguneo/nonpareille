import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { flagBool, flagNum, flagStr, parseArgs } from "../args.ts";
import { convertWithReport, type ConvertOptions, type DitherMode } from "../../src/convert/pipeline.ts";
import type { SampleMode } from "../../src/convert/resample.ts";
import { usedIndices } from "../../src/core/grid.ts";
import { defaultCanvas } from "../../src/core/geometry.ts";
import { renderRGBA } from "../../src/core/render.ts";
import { InputError } from "../../src/core/types.ts";
import { readImageFile } from "../../src/io/decode.ts";
import { serializeDotText } from "../../src/io/dottext.ts";
import { loadPaletteSpec } from "../../src/io/palette-files.ts";
import { encodeRGBAPNG } from "../../src/io/png-encode.ts";
import { gridToDocument, serializeDocument } from "../../src/io/project.ts";
import { toSVG } from "../../src/io/svg.ts";
import type { CommandModule } from "./types.ts";

export const summary = "convert a photo/illustration into dot art";
export const usage = `usage: dot convert <in.png|jpg|webp> --dots 64 [--height auto|N] [--fit cover|contain|stretch] [--sample kcentroid|mode|mean|median|dominant|center|contrast] [--palette pico8|auto:16|lospec:<slug>|file.hex] [--dither none|bayer2|bayer4|bayer8|fs|jjn|stucki|atkinson|sierra|yliluoma] [--outline-expand] [--orphans] [--outline black|selout] [--scale 8] [--gap 0] [--json] -o out.(png|svg|dot.json|dot.txt)`;

const SAMPLES = ["center", "mean", "median", "mode", "dominant", "kcentroid", "contrast"];
const DITHERS = ["none", "bayer2", "bayer4", "bayer8", "fs", "jjn", "stucki", "atkinson", "sierra", "yliluoma"];
const FITS = ["cover", "contain", "stretch"];

function oneOf<T extends string>(name: string, v: string, allowed: string[]): T {
  if (!allowed.includes(v)) throw new InputError(`--${name} must be one of ${allowed.join("|")}, got "${v}"`);
  return v as T;
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const input = args.positional[0];
  const out = flagStr(args, "out");
  const json = flagBool(args, "json");
  if (!input || (!out && !json)) throw new InputError("input file and -o are required");
  const dots = flagNum(args, "dots");
  if (dots === undefined) throw new InputError("--dots is required");
  const h = flagStr(args, "height");
  const spec = flagStr(args, "palette");
  const outline = flagStr(args, "outline");
  const o: ConvertOptions = {
    width: dots,
    height: h === undefined || h === "auto" ? "auto" : Number(h),
    fit: oneOf("fit", flagStr(args, "fit") ?? "cover", FITS),
    sample: oneOf<SampleMode>("sample", flagStr(args, "sample") ?? "kcentroid", SAMPLES),
    palette: spec === undefined ? { kind: "none" } : await loadPaletteSpec(spec),
    dither: oneOf<DitherMode>("dither", flagStr(args, "dither") ?? "none", DITHERS),
    outlineExpand: flagBool(args, "outline-expand"),
    orphans: flagBool(args, "orphans"),
  };
  if (outline !== undefined) o.outline = oneOf("outline", outline, ["black", "selout"]);
  const { grid, purity } = convertWithReport(await readImageFile(input), o);

  if (out) {
    const scale = flagNum(args, "scale") ?? 8;
    if (!Number.isInteger(scale) || scale < 1) throw new InputError("--scale must be an integer >= 1");
    const canvas = defaultCanvas(grid.width, grid.height, scale);
    canvas.gap = flagNum(args, "gap") ?? 0;
    const lower = out.toLowerCase();
    let data: Uint8Array | string;
    if (lower.endsWith(".svg")) data = toSVG(grid, canvas);
    else if (lower.endsWith(".dot.json")) data = serializeDocument(gridToDocument(grid, canvas));
    else if (lower.endsWith(".dot.txt")) data = serializeDotText(grid);
    else data = encodeRGBAPNG(renderRGBA(grid, canvas));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
  }
  if (json) {
    const used = usedIndices(grid);
    used.delete(0);
    console.log(JSON.stringify({ width: grid.width, height: grid.height, colors: used.size, purity }));
  }
  return 0;
}

const mod: CommandModule = { summary, usage, run };
export default mod;

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { flagNum, flagStr, parseArgs } from "../args.ts";
import { renderRGBA } from "../../src/core/render.ts";
import { InputError, type CanvasSpec, type DotGrid } from "../../src/core/types.ts";
import { parseDotText } from "../../src/io/dottext.ts";
import { encodeIndexedPNG, encodeRGBAPNG } from "../../src/io/png-encode.ts";
import { documentToGrid, parseDocument } from "../../src/io/project.ts";
import { toSVG } from "../../src/io/svg.ts";
import { parseHexColor } from "./new.ts";
import type { CommandModule } from "./types.ts";

export const summary = "render a .dot.json / .dot.txt document to png, png8 or svg";
export const usage = `usage: dot render <in.dot.json|in.dot.txt> [--scale 8] [--gap 1 --gap-color #000000] [--margin 0] [--background #00000000] [--format png|png8|svg] -o out`;

/** Format switch: add a new --format by adding one case to `encode`. */
function encode(format: string, grid: DotGrid, canvas: CanvasSpec): Uint8Array | string {
  switch (format) {
    case "png":
      return encodeRGBAPNG(renderRGBA(grid, canvas));
    case "png8": {
      const { width, height } = grid;
      const sx = canvas.dotW, sy = canvas.dotH;
      const W = width * sx, H = height * sy;
      const indices = new Uint16Array(W * H);
      for (let y = 0; y < H; y++) {
        const row = Math.floor(y / sy) * width;
        for (let x = 0; x < W; x++) indices[y * W + x] = grid.data[row + Math.floor(x / sx)]!;
      }
      return encodeIndexedPNG({ width: W, height: H, indices, palette: grid.palette.colors });
    }
    case "svg":
      return toSVG(grid, canvas);
    default:
      throw new InputError(`unknown format "${format}"`);
  }
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const input = args.positional[0];
  const out = flagStr(args, "out");
  if (!input || !out) throw new InputError("input file and -o are required");
  let grid: DotGrid;
  let canvas: CanvasSpec;
  try {
    const src = readFileSync(input, "utf8");
    if (input.endsWith(".json")) {
      const doc = parseDocument(src);
      grid = documentToGrid(doc);
      canvas = { ...doc.canvas };
    } else {
      grid = parseDotText(src);
      canvas = { width: grid.width, height: grid.height, dotW: 8, dotH: 8, gap: 0, gapColor: 0x000000ff, margin: 0, background: 0 };
    }
    const scale = flagNum(args, "scale");
    if (scale !== undefined) {
      if (!Number.isInteger(scale) || scale < 1) throw new InputError("--scale must be an integer >= 1");
      canvas.dotW = scale;
      canvas.dotH = scale;
    }
    const gap = flagNum(args, "gap");
    if (gap !== undefined) canvas.gap = gap;
    const margin = flagNum(args, "margin");
    if (margin !== undefined) canvas.margin = margin;
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError((e as Error).message);
  }
  const gc = flagStr(args, "gap-color");
  if (gc) canvas.gapColor = parseHexColor(gc);
  const bg = flagStr(args, "background");
  if (bg) canvas.background = parseHexColor(bg);
  const format = flagStr(args, "format") ?? (out.endsWith(".svg") ? "svg" : "png");
  const data = encode(format, grid, canvas);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
  return 0;
}

const mod: CommandModule = { summary, usage, run };
export default mod;

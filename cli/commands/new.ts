import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { flagStr, parseArgs, parseSize } from "../args.ts";
import { createGrid, createPalette } from "../../src/core/grid.ts";
import { InputError } from "../../src/core/types.ts";
import { serializeDotText } from "../../src/io/dottext.ts";
import { gridToDocument, serializeDocument } from "../../src/io/project.ts";
import type { CommandModule } from "./types.ts";

export const summary = "create an empty .dot.json / .dot.txt document";
export const usage = `usage: dot new --size 32x32 [--palette #rrggbb,#rrggbb,...] -o hero.dot.json|hero.dot.txt`;

export function parseHexColor(s: string): number {
  if (!/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/.test(s)) throw new InputError(`invalid color "${s}"`);
  return (Number.parseInt(s.slice(1), 16) * (s.length === 7 ? 0x100 + 0xff : 1)) >>> 0;
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const size = flagStr(args, "size");
  const out = flagStr(args, "out");
  if (!size || !out) throw new InputError("--size and -o are required");
  let w: number, h: number;
  try {
    [w, h] = parseSize(size);
  } catch (e) {
    throw new InputError((e as Error).message);
  }
  const pal = flagStr(args, "palette");
  const colors = [0, ...(pal ? pal.split(",").map((c) => parseHexColor(c.trim())) : [])];
  const grid = createGrid(w, h, createPalette(colors));
  const text = out.endsWith(".txt") ? serializeDotText(grid) + "\n" : serializeDocument(gridToDocument(grid));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  return 0;
}

const mod: CommandModule = { summary, usage, run };
export default mod;

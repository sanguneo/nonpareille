import { readFileSync } from "node:fs";
import { flagBool, flagStr, parseArgs } from "../args.ts";
import { billOfMaterials, type MaterialColor } from "../../src/mosaic/bom.ts";
import { InputError } from "../../src/core/types.ts";
import { parseDotText } from "../../src/io/dottext.ts";
import { documentToGrid, parseDocument } from "../../src/io/project.ts";
import type { CommandModule } from "./types.ts";

export const summary = "count materials required by a dot grid";
export const usage = "usage: dot bom in.dot.json|in.dot.txt [--material perler] [--json]";
export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv), input = args.positional[0];
  if (!input) throw new InputError("input document is required");
  try {
    const source = readFileSync(input, "utf8");
    const grid = input.endsWith(".json") ? documentToGrid(parseDocument(source)) : parseDotText(source);
    const material = flagStr(args, "material");
    if (material && material !== "perler") throw new InputError(`unknown material "${material}"`);
    const colors = material ? JSON.parse(readFileSync(new URL("../../src/mosaic/materials/perler.json", import.meta.url), "utf8")) as MaterialColor[] : undefined;
    const result = billOfMaterials(grid, colors ? { material: colors } : {});
    console.log(flagBool(args, "json") ? JSON.stringify(result) : [
      ...result.counts.map((c) => `${c.index}\t#${(c.rgb >>> 8).toString(16).padStart(6, "0")}\t${c.count}`),
      `total\t${result.total}`, `boards\t${result.boards}`,
    ].join("\n"));
    return 0;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError((error as Error).message);
  }
}
const mod: CommandModule = { summary, usage, run };
export default mod;

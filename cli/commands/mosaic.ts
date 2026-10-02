import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { flagNum, flagStr, parseArgs } from "../args.ts";
import { sliceTiles, tileMosaic } from "../../src/mosaic/tile-mosaic.ts";
import { readImageFile } from "../../src/io/decode.ts";
import { encodeRGBAPNG } from "../../src/io/png-encode.ts";
import { InputError } from "../../src/core/types.ts";
import type { CommandModule } from "./types.ts";

export const summary = "build a tile mosaic from a target image";
export const usage = "usage: nonpareille mosaic target.png --tiles chipset.png --tile 16 [--k 2] [--reuse-radius 2] -o out.png";
export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv), targetPath = args.positional[0], tilesPath = flagStr(args, "tiles");
  const size = flagNum(args, "tile"), out = flagStr(args, "out");
  if (!targetPath || !tilesPath || !size || !out) throw new InputError("target, --tiles, --tile, and -o are required");
  try {
    const [target, tileset] = await Promise.all([readImageFile(targetPath), readImageFile(tilesPath)]);
    const result = tileMosaic(target, sliceTiles(tileset, size), size, {
      k: flagNum(args, "k"), reuseRadius: flagNum(args, "reuse-radius"),
      seed: flagNum(args, "seed"),
    });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, encodeRGBAPNG(result.image));
    return 0;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError((error as Error).message);
  }
}
const mod: CommandModule = { summary, usage, run };
export default mod;

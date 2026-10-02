import { flagStr, parseArgs, parseSize } from "../args.ts";
import { InputError } from "../../src/core/types.ts";
import { buildImagePrompt, type GenSpec } from "../../src/gen/prompt.ts";
import { loadPaletteSpec } from "../../src/io/palette-files.ts";
import type { CommandModule } from "./types.ts";

export const summary = "build an image-model prompt and numeric parameters";
export const usage = "usage: nonpareille prompt --subject <text> --size 32x32 --palette db32 [--view side] [--model codex-image] [--outline none|black|selout] [--shading flat|cel|soft] [--light top-left|top|top-right]";

const VIEWS = ["front", "side", "three-quarter", "top-down", "isometric"] as const;
const MODELS = ["codex-image", "openai", "sdxl-pixel-art-xl", "retro-diffusion"] as const;
const OUTLINES = ["none", "black", "selout"] as const;
const SHADINGS = ["flat", "cel", "soft"] as const;
const LIGHTS = ["top-left", "top", "top-right"] as const;

export function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T, name: string): T {
  if (value === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(value)) throw new InputError(`--${name} must be one of ${allowed.join(", ")}`);
  return value as T;
}

/** Shared by `prompt` and `gen`: flags -> GenSpec plus the resolved palette colors. */
export async function specFromArgs(argv: string[], model: GenSpec["model"] | undefined): Promise<{ spec: GenSpec; colors: number[] }> {
  const args = parseArgs(argv);
  const subject = flagStr(args, "subject"), size = flagStr(args, "size"), paletteText = flagStr(args, "palette");
  if (!subject || !size || !paletteText) throw new InputError("--subject, --size and --palette are required");
  let width: number, height: number;
  try {
    [width, height] = parseSize(size);
  } catch (e) {
    throw new InputError((e as Error).message);
  }
  const loaded = await loadPaletteSpec(paletteText);
  const colors = loaded.kind === "fixed" ? loaded.colors.filter((c) => (c & 255) !== 0) : [];
  const spec: GenSpec = {
    subject, width, height,
    view: pick(flagStr(args, "view"), VIEWS, "front", "view"),
    palette: loaded.kind === "auto" ? { K: loaded.k } : { K: colors.length },
    outline: pick(flagStr(args, "outline"), OUTLINES, "none", "outline"),
    shading: pick(flagStr(args, "shading"), SHADINGS, "cel", "shading"),
    lightDir: pick(flagStr(args, "light"), LIGHTS, "top-left", "light"),
    background: "key",
    model: model ?? pick(flagStr(args, "model"), MODELS, "codex-image", "model"),
  };
  const seed = flagStr(args, "seed");
  if (seed !== undefined) {
    if (!Number.isInteger(Number(seed))) throw new InputError("--seed must be an integer");
    spec.seed = Number(seed);
  }
  const ref = flagStr(args, "ref");
  if (ref) spec.styleRef = ref.split(",");
  return { spec, colors };
}

export async function run(argv: string[]): Promise<number> {
  const { spec, colors } = await specFromArgs(argv, undefined);
  const built = buildImagePrompt(spec, colors);
  const keyColor = `#${built.keyColor.toString(16).padStart(6, "0").toUpperCase()}`;
  process.stdout.write(`${JSON.stringify({
    prompt: built.prompt, negative: built.negative ?? null, size: built.size,
    block: built.block, keyColor, priorPeriod: built.priorPeriod,
  })}\n`);
  return 0;
}

const mod: CommandModule = { summary, usage, run };
export default mod;

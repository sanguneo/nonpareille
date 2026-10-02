import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { flagNum, flagStr, parseArgs } from "../args.ts";
import { renderRGBA } from "../../src/core/render.ts";
import { InputError } from "../../src/core/types.ts";
import { generate } from "../../src/gen/generate.ts";
import { buildImagePrompt, type GenSpec } from "../../src/gen/prompt.ts";
import { getProvider, PROVIDER_IDS } from "../../src/gen/providers/index.ts";
import { encodeRGBAPNG } from "../../src/io/png-encode.ts";
import { gridToDocument, serializeDocument } from "../../src/io/project.ts";
import { specFromArgs } from "./prompt.ts";
import type { CommandModule } from "./types.ts";

export const summary = "generate a dot sprite with an AI image provider";
export const usage = "usage: dot gen --subject <text> --size 32x32 --palette pico8 --provider codex-image [--ref a.png,b.png] [--retries 0] [--seed N] [--view side] [--outline none|black|selout] [--scale 8] [--json] -o out.dot.json|out.png";

const MODEL_FOR_PROVIDER: Record<string, GenSpec["model"]> = {
  "codex-image": "codex-image",
  openai: "openai",
  "retro-diffusion": "retro-diffusion",
  comfyui: "sdxl-pixel-art-xl",
};

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const out = flagStr(args, "out");
  if (!out) throw new InputError("output file is required");
  const providerId = flagStr(args, "provider") ?? "codex-image";
  const model = MODEL_FOR_PROVIDER[providerId];
  if (!model) throw new InputError(`unknown provider "${providerId}"; expected one of ${PROVIDER_IDS.join(", ")}`);
  const retries = flagNum(args, "retries") ?? 0;
  if (!Number.isInteger(retries) || retries < 0) throw new InputError("--retries must be an integer >= 0");
  const { spec, colors } = await specFromArgs(argv, model);
  const { grid, report } = await generate(spec, getProvider(providerId), { retries, paletteColors: colors });

  mkdirSync(dirname(out), { recursive: true });
  if (out.endsWith(".png")) {
    const scale = flagNum(args, "scale") ?? 8;
    if (!Number.isInteger(scale) || scale < 1) throw new InputError("--scale must be an integer >= 1");
    const canvas = { width: grid.width, height: grid.height, dotW: scale, dotH: scale,
      gap: 0, gapColor: 0, margin: 0, background: 0 };
    writeFileSync(out, encodeRGBAPNG(renderRGBA(grid, canvas)));
  } else {
    const doc = gridToDocument(grid);
    doc.meta = { source: providerId, prompt: buildImagePrompt(spec, colors).prompt, tool: "dot gen",
      ...(spec.seed !== undefined ? { seed: spec.seed } : {}) };
    writeFileSync(out, serializeDocument(doc));
  }
  if (args.flags.has("json")) process.stdout.write(`${JSON.stringify(report)}\n`);
  else if (report.recommendRegenerate) process.stderr.write("warning: low grid confidence or purity; regeneration recommended (--retries n)\n");
  return 0;
}

const mod: CommandModule = { summary, usage, run };
export default mod;

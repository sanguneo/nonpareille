import { InputError } from "../../core/types.ts";
import { createCodexImageProvider, type CodexImageOptions } from "./codex-image.ts";
import { createComfyUIProvider, type ComfyOptions } from "./comfyui.ts";
import { createOpenAIProvider } from "./openai.ts";
import { createRetroDiffusionProvider } from "./retro-diffusion.ts";
import type { ImageProvider } from "./types.ts";

export type { ImageProvider, ImageGenRequest, ImageGenResult } from "./types.ts";

export const PROVIDER_IDS = ["codex-image", "openai", "retro-diffusion", "comfyui"] as const;

export function getProvider(
  id: string,
  opts: CodexImageOptions & ComfyOptions & { apiKey?: string } = {},
): ImageProvider {
  switch (id) {
    case "codex-image":
      return createCodexImageProvider(opts);
    case "openai":
      return createOpenAIProvider(opts);
    case "retro-diffusion":
      return createRetroDiffusionProvider(opts);
    case "comfyui":
      return createComfyUIProvider(opts);
    default:
      throw new InputError(`unknown provider "${id}"; expected one of ${PROVIDER_IDS.join(", ")}`);
  }
}

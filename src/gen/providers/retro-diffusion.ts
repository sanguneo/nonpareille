import { ProviderError } from "../../core/types.ts";
import type { ImageGenRequest, ImageGenResult, ImageProvider } from "./types.ts";

// TO BE CONFIRMED: endpoint version (v1/v2) and response shape must be checked
// against the official Retro Diffusion docs at M4 start.
const ENDPOINT = "https://api.retrodiffusion.ai/v1/inferences";

export function createRetroDiffusionProvider(
  opts: { apiKey?: string; model?: string } = {},
): ImageProvider {
  return {
    id: "retro-diffusion",
    async generate(req: ImageGenRequest): Promise<ImageGenResult> {
      const key = opts.apiKey ?? process.env.RD_API_KEY;
      if (!key) throw new ProviderError("retro-diffusion: RD_API_KEY is not set");
      const model = opts.model ?? "RD_FLUX";
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-RD-Token": key },
        body: JSON.stringify({
          prompt: req.prompt,
          negative_prompt: req.negative ?? "",
          model,
          width: req.size[0],
          height: req.size[1],
          num_images: 1,
        }),
      });
      if (!res.ok) throw new ProviderError(`retro-diffusion: HTTP ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { base64_images?: string[] };
      const b64 = json.base64_images?.[0];
      if (!b64) throw new ProviderError("retro-diffusion: response has no base64 image");
      return { png: new Uint8Array(Buffer.from(b64, "base64")), meta: { model } };
    },
  };
}

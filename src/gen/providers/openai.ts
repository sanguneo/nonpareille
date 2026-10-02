import { ProviderError } from "../../core/types.ts";
import type { ImageGenRequest, ImageGenResult, ImageProvider } from "./types.ts";

export function createOpenAIProvider(opts: { apiKey?: string } = {}): ImageProvider {
  return {
    id: "openai",
    async generate(req: ImageGenRequest): Promise<ImageGenResult> {
      const key = opts.apiKey ?? process.env.OPENAI_API_KEY;
      if (!key) throw new ProviderError("openai: OPENAI_API_KEY is not set");
      const [w, h] = req.size;
      const body = {
        model: "gpt-image-1",
        prompt: req.prompt,
        size: `${w}x${h}`,
        background: "transparent",
        output_format: "png",
        n: 1,
      };
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new ProviderError(`openai: HTTP ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError("openai: response has no b64_json image");
      return { png: new Uint8Array(Buffer.from(b64, "base64")), meta: { model: "gpt-image-1", size: body.size } };
    },
  };
}

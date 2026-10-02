import { ProviderError } from "../../core/types.ts";
import type { ImageGenRequest, ImageGenResult, ImageProvider } from "./types.ts";

export interface ComfyOptions {
  baseUrl?: string;
  checkpoint?: string;
  pollMs?: number;
  timeoutMs?: number;
}

/** SDXL + pixel-art-xl LoRA (1.2), LCM sampler, 8 steps, CFG 1.5. */
export function buildWorkflow(
  req: ImageGenRequest,
  checkpoint: string,
  seed: number,
): Record<string, unknown> {
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
    "2": {
      class_type: "LoraLoader",
      inputs: {
        model: ["1", 0],
        clip: ["1", 1],
        lora_name: "pixel-art-xl.safetensors",
        strength_model: 1.2,
        strength_clip: 1.2,
      },
    },
    "3": { class_type: "CLIPTextEncode", inputs: { text: req.prompt, clip: ["2", 1] } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: req.negative ?? "", clip: ["2", 1] } },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: req.size[0], height: req.size[1], batch_size: 1 },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        model: ["2", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
        seed,
        steps: 8,
        cfg: 1.5,
        sampler_name: "lcm",
        scheduler: "sgm_uniform",
        denoise: 1,
      },
    },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: "dot" } },
  };
}

interface HistoryEntry {
  outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>;
}

export function createComfyUIProvider(opts: ComfyOptions = {}): ImageProvider {
  const base = (opts.baseUrl ?? "http://127.0.0.1:8188").replace(/\/+$/, "");
  const pollMs = opts.pollMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 300000;
  return {
    id: "comfyui",
    async generate(req: ImageGenRequest): Promise<ImageGenResult> {
      const seed = req.seed ?? 0;
      const workflow = buildWorkflow(req, opts.checkpoint ?? "sd_xl_base_1.0.safetensors", seed);
      const post = await fetch(`${base}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow }),
      });
      if (!post.ok) throw new ProviderError(`comfyui: HTTP ${post.status} ${await post.text()}`);
      const { prompt_id } = (await post.json()) as { prompt_id?: string };
      if (!prompt_id) throw new ProviderError("comfyui: response has no prompt_id");
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const h = await fetch(`${base}/history/${prompt_id}`);
        if (h.ok) {
          const hist = (await h.json()) as Record<string, HistoryEntry>;
          const outputs = hist[prompt_id]?.outputs;
          const img = outputs && Object.values(outputs).flatMap((o) => o.images ?? [])[0];
          if (img) {
            const q = new URLSearchParams({
              filename: img.filename,
              subfolder: img.subfolder,
              type: img.type,
            });
            const v = await fetch(`${base}/view?${q}`);
            if (!v.ok) throw new ProviderError(`comfyui: /view HTTP ${v.status}`);
            return { png: new Uint8Array(await v.arrayBuffer()), meta: { prompt_id, seed } };
          }
        }
        await new Promise((r) => setTimeout(r, pollMs));
      }
      throw new ProviderError(`comfyui: timed out after ${timeoutMs}ms waiting for ${prompt_id}`);
    },
  };
}

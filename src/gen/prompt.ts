import { deltaE, rgba32ToOklab } from "../core/color.ts";
import type { RGBA32 } from "../core/types.ts";

export interface GenSpec {
  subject: string;
  view: "front" | "side" | "three-quarter" | "top-down" | "isometric";
  width: number;
  height: number;
  palette: { preset?: string; hex?: string[]; K?: number };
  outline: "none" | "black" | "selout";
  shading: "flat" | "cel" | "soft";
  lightDir: "top-left" | "top" | "top-right";
  background: "transparent" | "key";
  styleRef?: string[];
  model: "codex-image" | "openai" | "sdxl-pixel-art-xl" | "retro-diffusion";
  seed?: number;
}

export function chooseModelCanvas(W: number, H: number, model: GenSpec["model"]): [number, number] {
  if (model === "retro-diffusion") return [W, H];
  if (model === "sdxl-pixel-art-xl") return [1024, 1024];
  const candidates: [number, number][] = [[1024, 1024], [1536, 1024], [1024, 1536]];
  return candidates.reduce((best, size) =>
    Math.abs(size[0] / size[1] - W / H) < Math.abs(best[0] / best[1] - W / H) ? size : best,
  );
}

export function blockSize(Rw: number, Rh: number, W: number, H: number): number {
  return Math.floor(Math.min(Rw / W, Rh / H));
}

export function chooseKeyColor(palette: RGBA32[]): number {
  const candidates = [0xff00ff, 0x00ff00, 0x00ffff, 0xff8000, 0x0000ff];
  const labs = palette.map(rgba32ToOklab);
  let chosen = candidates[0]!;
  let farthest = -Infinity;
  for (const rgb of candidates) {
    const lab = rgba32ToOklab(((rgb << 8) | 0xff) >>> 0);
    const nearest = labs.length === 0 ? Infinity : Math.min(...labs.map((p) => deltaE(lab, p)));
    if (nearest > farthest) {
      farthest = nearest;
      chosen = rgb;
    }
  }
  return chosen;
}

export function buildImagePrompt(spec: GenSpec, paletteColors: RGBA32[]): {
  prompt: string;
  negative?: string;
  size: [number, number];
  block: number;
  keyColor: number;
  priorPeriod: number;
} {
  const size = chooseModelCanvas(spec.width, spec.height, spec.model);
  const block = blockSize(size[0], size[1], spec.width, spec.height);
  const keyColor = chooseKeyColor(paletteColors);
  const rgb = (c: RGBA32) => `#${((c >>> 8) & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
  const colorList = paletteColors.map(rgb).join(", ");
  const K = spec.palette.K ?? spec.palette.hex?.length ?? paletteColors.length;
  const outline = spec.outline === "black" ? "Clean 1-pixel dark outline around the silhouette." : "";
  const prompt = [
    `Pixel art ${spec.view} sprite of ${spec.subject}.`,
    `The image is a ${spec.width}x${spec.height} pixel-art grid upscaled so every pixel is a crisp, perfectly square ${block}x${block} block on an exact grid; no pixel is split or blended.`,
    `Strictly limited palette of ${K} colors: ${colorList}. Use only these colors.`,
    outline,
    `${spec.shading} shading, light from the ${spec.lightDir}. Hard edges, no anti-aliasing, no gradients, no blur, no noise, no dithering, no text, no border.`,
    "Subject centered with a 1-pixel margin, fully inside the frame.",
    `Background: one flat solid color ${rgb(keyColor)} filling everything that is not the subject.`,
  ].filter(Boolean).join("\n");
  return {
    prompt,
    ...(spec.model === "sdxl-pixel-art-xl"
      ? { negative: "blurry, anti-aliasing, smooth gradient, photorealistic, 3d render, jpeg artifacts, noise, subpixel, text, watermark, frame" }
      : {}),
    size,
    block,
    keyColor,
    priorPeriod: block,
  };
}

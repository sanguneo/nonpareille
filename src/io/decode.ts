import { decode, hasPngSignature } from "fast-png";
import type { RGBAImage } from "../core/types.ts";

export function decodePNG(bytes: Uint8Array): RGBAImage {
  const png = decode(bytes);
  const { width, height, channels, depth } = png;
  const data = new Uint8ClampedArray(width * height * 4);
  const source = png.data;

  for (let i = 0; i < width * height; i++) {
    const src = i * channels;
    const dst = i * 4;
    const sample = (channel: number): number => {
      const value = source[src + channel] ?? 0;
      return depth === 16 ? Math.round(value / 257) : value;
    };

    if (png.palette) {
      const index = sample(0);
      const color = png.palette[index] ?? [0, 0, 0];
      data[dst] = color[0] ?? 0;
      data[dst + 1] = color[1] ?? 0;
      data[dst + 2] = color[2] ?? 0;
      data[dst + 3] = png.transparency?.[index] ?? 255;
    } else if (channels === 1 || channels === 2) {
      const gray = sample(0);
      data[dst] = gray;
      data[dst + 1] = gray;
      data[dst + 2] = gray;
      data[dst + 3] = channels === 2 ? sample(1) : 255;
    } else {
      data[dst] = sample(0);
      data[dst + 1] = sample(1);
      data[dst + 2] = sample(2);
      data[dst + 3] = channels === 4 ? sample(3) : 255;
    }
  }

  return { width, height, data };
}

export async function decodeImage(bytes: Uint8Array): Promise<RGBAImage> {
  if (hasPngSignature(bytes)) return decodePNG(bytes);
  const pngBytes = await new Bun.Image(bytes).png().bytes();
  return decodePNG(pngBytes);
}

export async function readImageFile(path: string): Promise<RGBAImage> {
  return decodeImage(new Uint8Array(await Bun.file(path).arrayBuffer()));
}

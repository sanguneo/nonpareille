import type { RGBA32, RGBAImage } from "./types.ts";

export function createImage(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function getPixel(img: RGBAImage, x: number, y: number): RGBA32 {
  const offset = (y * img.width + x) * 4;
  return (((img.data[offset]! << 24) | (img.data[offset + 1]! << 16) |
    (img.data[offset + 2]! << 8) | img.data[offset + 3]!) >>> 0);
}

export function setPixel(img: RGBAImage, x: number, y: number, color: RGBA32): void {
  const offset = (y * img.width + x) * 4;
  img.data[offset] = color >>> 24;
  img.data[offset + 1] = (color >>> 16) & 0xff;
  img.data[offset + 2] = (color >>> 8) & 0xff;
  img.data[offset + 3] = color & 0xff;
}

export function cloneImage(img: RGBAImage): RGBAImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

export function binarizeAlpha(img: RGBAImage, threshold = 128): RGBAImage {
  const result = cloneImage(img);
  for (let i = 3; i < result.data.length; i += 4) {
    result.data[i] = result.data[i]! < threshold ? 0 : 255;
  }
  return result;
}

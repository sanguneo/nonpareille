import { cloneImage } from "../core/image.ts";
import { deltaE, pack, rgba32ToOklab, rgbToOklab, unpack } from "../core/color.ts";
import { cloneGrid } from "../core/grid.ts";
import type { DotGrid, RGBAImage } from "../core/types.ts";

export function removeChromaKey(img: RGBAImage, keyRgb24: number, tau = 0.12): RGBAImage {
  const result = cloneImage(img);
  const key = rgbToOklab((keyRgb24 >>> 16) & 255, (keyRgb24 >>> 8) & 255, keyRgb24 & 255);
  for (let i = 0; i < result.data.length; i += 4) {
    if (result.data[i + 3] === 0) continue;
    if (deltaE(rgbToOklab(result.data[i]!, result.data[i + 1]!, result.data[i + 2]!), key) < tau)
      result.data[i + 3] = 0;
  }
  return result;
}

export function removeBorderBackground(img: RGBAImage, tau = 0.06): RGBAImage {
  const result = cloneImage(img), pixels = img.width * img.height;
  const colors = new Map<number, number>();
  const corners = [0, img.width - 1, (img.height - 1) * img.width, pixels - 1];
  for (const p of corners) {
    const i = p * 4, c = pack(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, 255);
    colors.set(c, (colors.get(c) ?? 0) + 1);
  }
  let key = corners.length ? pack(img.data[0]!, img.data[1]!, img.data[2]!, 255) : 0, max = 0;
  for (const [c, n] of colors) if (n > max) { key = c; max = n; }
  const lab = rgba32ToOklab(key), seen = new Uint8Array(pixels), queue = new Int32Array(pixels);
  let head = 0, tail = 0;
  for (const p of corners) if (!seen[p]) { seen[p] = 1; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++]!, x = p % img.width, y = Math.floor(p / img.width), i = p * 4;
    const c = pack(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, 255);
    if (deltaE(rgba32ToOklab(c), lab) >= tau) continue;
    result.data[i + 3] = 0;
    for (const n of [x > 0 ? p - 1 : -1, x + 1 < img.width ? p + 1 : -1,
      y > 0 ? p - img.width : -1, y + 1 < img.height ? p + img.width : -1]) {
      if (n >= 0 && !seen[n]) { seen[n] = 1; queue[tail++] = n; }
    }
  }
  return result;
}

export function fixKeyFringe(grid: DotGrid, keyRgb24: number, tau = 0.25): DotGrid {
  const result = cloneGrid(grid), key = rgbToOklab((keyRgb24 >>> 16) & 255, (keyRgb24 >>> 8) & 255, keyRgb24 & 255);
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    const pos = y * grid.width + x, value = grid.data[pos]!;
    if (value === 0 || deltaE(rgba32ToOklab(grid.palette.colors[value]!), key) >= tau) continue;
    const counts = new Map<number, number>();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < grid.width && ny < grid.height) {
        const n = grid.data[ny * grid.width + nx]!;
        if (n !== 0) counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
    let mode = 0, count = 0;
    for (const [n, c] of counts) if (c > count) { mode = n; count = c; }
    if (count > 0) result.data[pos] = mode;
  }
  return result;
}

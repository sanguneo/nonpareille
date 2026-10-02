import { pack, unpack } from "../core/color.ts";
import { rgba32ToOklab, deltaE2 } from "../core/color.ts";
import { createGrid, createPalette } from "../core/grid.ts";
import { mulberry32 } from "../core/prng.ts";
import type { DotGrid, Palette } from "../core/types.ts";

export interface SpriteMask {
  data: number[];
  width: number;
  height: number;
  mirrorX: boolean;
  mirrorY: boolean;
}

export function generateSprite(
  mask: SpriteMask,
  opts: {
    seed: number;
    colored?: boolean;
    edgeBrightness?: number;
    colorVariations?: number;
    brightnessNoise?: number;
    saturation?: number;
    palette?: Palette;
  },
): DotGrid {
  const rng = mulberry32(opts.seed);
  const width = mask.width * (mask.mirrorX ? 2 : 1);
  const height = mask.height * (mask.mirrorY ? 2 : 1);
  const sample = new Int8Array(width * height).fill(-1);
  const colored = opts.colored ?? true;
  const edgeBrightness = opts.edgeBrightness ?? 0.3;
  const colorVariations = opts.colorVariations ?? 0.2;
  const brightnessNoise = opts.brightnessNoise ?? 0.3;
  const saturationLimit = opts.saturation ?? 0.5;

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const value = mask.data[y * mask.width + x]!;
      sample[y * width + x] = value === 1 ? Math.round(rng())
        : value === 2 ? (rng() > 0.5 ? 1 : -1)
          : value;
    }
  }
  if (mask.mirrorX) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width / 2; x++) {
      sample[y * width + width - x - 1] = sample[y * width + x]!;
    }
  }
  if (mask.mirrorY) {
    for (let y = 0; y < height / 2; y++) for (let x = 0; x < width; x++) {
      sample[(height - y - 1) * width + x] = sample[y * width + x]!;
    }
  }
  const beforeEdges = new Int8Array(sample);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (beforeEdges[y * width + x]! <= 0) continue;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx!, ny = y + dy!;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && beforeEdges[ny * width + nx] === 0) {
        sample[ny * width + nx] = -1;
      }
    }
  }

  const dataColors = new Uint32Array(width * height);
  const mirroredColors = (x: number, y: number, rgb: [number, number, number]) => {
    const packed = pack(Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255), 255);
    dataColors[y * width + x] = packed;
    if (mask.mirrorX) dataColors[y * width + width - x - 1] = packed;
    if (mask.mirrorY) dataColors[(height - y - 1) * width + x] = packed;
    if (mask.mirrorX && mask.mirrorY) dataColors[(height - y - 1) * width + width - x - 1] = packed;
  };
  const vertical = rng() > 0.5;
  const saturation = Math.max(0, Math.min(1, rng() * saturationLimit));
  let hue = rng();
  const ulen = vertical ? height : width;
  const vlen = vertical ? width : height;
  for (let u = 0; u < ulen; u++) {
    const variation = Math.abs((rng() * 2 - 1 + rng() * 2 - 1 + rng() * 2 - 1) / 3);
    if (variation > 1 - colorVariations) hue = rng();
    for (let v = 0; v < (mask.mirrorX && !vertical ? mask.width : vlen); v++) {
      const x = vertical ? v : u, y = vertical ? u : v;
      const value = sample[y * width + x]!;
      if (value === 0) continue;
      let rgb: [number, number, number] = colored ? [1, 1, 1] : value === -1 ? [0, 0, 0] : [1, 1, 1];
      if (colored) {
        const brightness = Math.sin((u / ulen) * Math.PI) * (1 - brightnessNoise) + rng() * brightnessNoise;
        const i = Math.floor(hue * 6), f = hue * 6 - i;
        const p = brightness * (1 - saturation), q = brightness * (1 - f * saturation);
        const t = brightness * (1 - (1 - f) * saturation);
        rgb = ([[brightness, t, p], [q, brightness, p], [p, brightness, t],
          [p, q, brightness], [t, p, brightness], [brightness, p, q]] as [number, number, number][])[i % 6]!;
        if (value === -1) rgb = [rgb[0] * edgeBrightness, rgb[1] * edgeBrightness, rgb[2] * edgeBrightness];
      }
      mirroredColors(x, y, rgb);
    }
  }

  const palette = opts.palette ?? createPalette([...new Set(dataColors)].filter((c) => c !== 0));
  const grid = createGrid(width, height, palette);
  const paletteLabs = Array.from(palette.colors, (color) => rgba32ToOklab(color));
  for (let i = 0; i < dataColors.length; i++) {
    const color = dataColors[i]!;
    if (!color) continue;
    const lab = rgba32ToOklab(color);
    let nearest = 1, distance = Infinity;
    for (let p = 1; p < palette.colors.length; p++) {
      const d = deltaE2(lab, paletteLabs[p]!);
      if (d < distance) { distance = d; nearest = p; }
    }
    grid.data[i] = nearest;
  }
  return grid;
}

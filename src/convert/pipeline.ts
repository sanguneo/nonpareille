import { autoHeight, fitRect } from "../core/geometry.ts";
import { createGrid, createPalette } from "../core/grid.ts";
import { InputError, type DotGrid, type Palette, type RGBA32, type RGBAImage } from "../core/types.ts";
import { addOutline } from "../cleanup/outline.ts";
import { removeOrphans } from "../cleanup/orphans.ts";
import { bayerDither } from "../dither/ordered.ts";
import { diffuseDither } from "../dither/diffusion.ts";
import { yliluomaDither } from "../dither/yliluoma.ts";
import { extractPalette } from "../palette/extract.ts";
import { outlineExpand } from "./outline-expand.ts";
import { cellsToGrid, resample, type SampleMode } from "./resample.ts";

export type DitherMode = "none" | "bayer2" | "bayer4" | "bayer8" | "fs" | "jjn" | "stucki" | "atkinson" | "sierra" | "yliluoma";

export interface ConvertOptions {
  width: number;
  height?: number | "auto";
  fit: "cover" | "contain" | "stretch";
  sample: SampleMode;
  palette: { kind: "fixed"; colors: RGBA32[] } | { kind: "auto"; k: number } | { kind: "none" };
  dither: DitherMode;
  outlineExpand?: boolean;
  orphans?: boolean;
  outline?: "black" | "selout";
  alphaThreshold?: number;
}

function toBytes(colors: Uint32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((c, n) => {
    out[n * 4] = c >>> 24;
    out[n * 4 + 1] = (c >>> 16) & 255;
    out[n * 4 + 2] = (c >>> 8) & 255;
    out[n * 4 + 3] = c & 255;
  });
  return out;
}

/** Like convert, but also returns the resampling purity (share of cells well represented by one color). */
export function convertWithReport(img: RGBAImage, o: ConvertOptions): { grid: DotGrid; purity: number } {
  const W = o.width;
  if (!Number.isInteger(W) || W < 1 || W > 4096) throw new InputError("width must be an integer in 1..4096");
  const H = o.height === undefined || o.height === "auto" ? autoHeight(W, img.width, img.height, 1, 1) : o.height;
  if (!Number.isInteger(H) || H < 1 || H > 4096) throw new InputError("height must be an integer in 1..4096");
  const rect = fitRect(img.width, img.height, W, H, 1, 1, o.fit);
  const src = o.outlineExpand ? outlineExpand(img, rect.w / W) : img;
  const alpha = o.alphaThreshold === undefined ? {} : { alphaThreshold: o.alphaThreshold };
  const { colors, purity } = resample(src, rect, W, H, o.sample, alpha);

  let palette: Palette | undefined;
  if (o.palette.kind === "fixed") palette = createPalette(o.palette.colors);
  else if (o.palette.kind === "auto") {
    palette = extractPalette({ width: W, height: H, data: toBytes(colors) }, o.palette.k, alpha);
  }

  let grid: DotGrid;
  if (!palette || o.dither === "none") grid = cellsToGrid(colors, W, H, palette);
  else {
    let idx: Uint16Array;
    if (o.dither.startsWith("bayer")) {
      idx = bayerDither(toBytes(colors), W, H, palette, Number(o.dither.slice(5)) as 2 | 4 | 8);
    } else if (o.dither === "yliluoma") idx = yliluomaDither(toBytes(colors), W, H, palette);
    else idx = diffuseDither(colors, W, H, palette, o.dither);
    grid = createGrid(W, H, palette);
    for (let n = 0; n < idx.length; n++) grid.data[n] = (colors[n]! & 255) === 0 ? 0 : idx[n]!;
  }
  if (o.orphans) grid = removeOrphans(grid).grid;
  if (o.outline) grid = addOutline(grid, { mode: o.outline });
  return { grid, purity };
}

export function convert(img: RGBAImage, o: ConvertOptions): DotGrid {
  return convertWithReport(img, o).grid;
}

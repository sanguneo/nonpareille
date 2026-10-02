import { InputError } from "./types.ts";
import type { CanvasSpec } from "./types.ts";

export function outputSize(c: CanvasSpec): { width: number; height: number } {
  return {
    width: c.width * c.dotW + (c.width - 1) * c.gap + 2 * c.margin,
    height: c.height * c.dotH + (c.height - 1) * c.gap + 2 * c.margin,
  };
}

export function pixelToDot(
  c: CanvasSpec,
  X: number,
  Y: number,
): { kind: "margin" } | { kind: "gap" } | { kind: "dot"; i: number; j: number } {
  const { width, height } = outputSize(c);
  const u = X - c.margin;
  const v = Y - c.margin;
  if (u < 0 || v < 0 || u >= width - 2 * c.margin || v >= height - 2 * c.margin) {
    return { kind: "margin" };
  }
  const i = Math.floor(u / (c.dotW + c.gap));
  const j = Math.floor(v / (c.dotH + c.gap));
  if (i >= c.width || j >= c.height) return { kind: "margin" };
  if (u % (c.dotW + c.gap) >= c.dotW || v % (c.dotH + c.gap) >= c.dotH) {
    return { kind: "gap" };
  }
  return { kind: "dot", i, j };
}

export function solveDotSize(outW: number, W: number, gap: number, margin: number): number {
  const size = Math.floor((outW - 2 * margin - (W - 1) * gap) / W);
  if (size < 1) throw new InputError("Output width cannot fit at least one pixel per dot");
  return size;
}

export function solveDotCount(outW: number, dotSize: number, gap: number, margin: number): number {
  const count = Math.floor((outW - 2 * margin + gap) / (dotSize + gap));
  if (count < 1) throw new InputError("Output width cannot fit at least one dot");
  return count;
}

export function exactPadding(target: number, actual: number): { before: number; after: number } {
  const extra = target - actual;
  const before = Math.floor(extra / 2);
  return { before, after: extra - before };
}

export function autoHeight(W: number, srcW: number, srcH: number, sx: number, sy: number): number {
  return Math.max(1, Math.round(W * (srcH / srcW) * (sx / sy)));
}

export function fitRect(
  srcW: number,
  srcH: number,
  W: number,
  H: number,
  sx: number,
  sy: number,
  mode: "cover" | "contain" | "stretch",
): { x0: number; y0: number; w: number; h: number } {
  if (mode === "stretch") return { x0: 0, y0: 0, w: srcW, h: srcH };
  if (mode === "contain") return { x0: 0, y0: 0, w: srcW, h: srcH };
  const targetAspect = (W * sx) / (H * sy);
  const sourceAspect = srcW / srcH;
  if (sourceAspect > targetAspect) {
    const w = srcH * targetAspect;
    return { x0: (srcW - w) / 2, y0: 0, w, h: srcH };
  }
  const h = srcW / targetAspect;
  return { x0: 0, y0: (srcH - h) / 2, w: srcW, h };
}

export function defaultCanvas(width: number, height: number, scale = 1): CanvasSpec {
  return {
    width,
    height,
    dotW: scale,
    dotH: scale,
    gap: 0,
    gapColor: 0,
    margin: 0,
    background: 0,
  };
}

export function validateCanvas(c: CanvasSpec): void {
  const fields = [c.width, c.height, c.dotW, c.dotH, c.gap, c.margin];
  if (fields.some((value) => !Number.isInteger(value))) {
    throw new InputError("Canvas dimensions and spacing must be integers");
  }
  if (c.width < 1 || c.width > 4096 || c.height < 1 || c.height > 4096) {
    throw new InputError("Canvas dot dimensions must be between 1 and 4096");
  }
  if (c.dotW < 1 || c.dotH < 1 || c.gap < 0 || c.margin < 0) {
    throw new InputError("Dot sizes must be positive and gap/margin non-negative");
  }
  const { width, height } = outputSize(c);
  if (width * height > 2 ** 28) throw new InputError("Canvas output exceeds 2^28 pixels");
}

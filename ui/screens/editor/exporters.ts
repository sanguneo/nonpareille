import { defaultCanvas } from "../../../src/core/geometry.ts";
import { renderRGBA } from "../../../src/core/render.ts";
import type { DotGrid } from "../../../src/core/types.ts";
import { serializeDotText } from "../../../src/io/dottext.ts";
import { encodeRGBAPNG } from "../../../src/io/png-encode.ts";
import { toSVG } from "../../../src/io/svg.ts";

/** Largest output edge for client-side raster export (plan section 5.1 keeps OW*OH <= 2^28). */
export const MAX_EXPORT_EDGE = 4096;
export const EXPORT_SCALES = [1, 2, 4, 8, 16, 32] as const;

/** Integer scales whose rendered image stays within MAX_EXPORT_EDGE for this grid. */
export function exportScalesFor(grid: DotGrid): number[] {
  const edge = Math.max(grid.width, grid.height);
  return EXPORT_SCALES.filter((scale) => scale * edge <= MAX_EXPORT_EDGE);
}

export function fileStem(name: string): string {
  const stem = name
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/^\.+/, "");
  return stem || "nonpareille";
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the browser has had time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** PNG at `scale` screen pixels per dot, rendered and encoded in the browser. */
export function exportPNG(grid: DotGrid, scale: number, name: string): void {
  const image = renderRGBA(grid, defaultCanvas(grid.width, grid.height, scale));
  const bytes = new Uint8Array(encodeRGBAPNG(image));
  downloadBlob(`${fileStem(name)}@${scale}x.png`, new Blob([bytes], { type: "image/png" }));
}

export function exportSVG(grid: DotGrid, scale: number, name: string): void {
  const svg = toSVG(grid, defaultCanvas(grid.width, grid.height, scale));
  downloadBlob(`${fileStem(name)}.svg`, new Blob([svg], { type: "image/svg+xml" }));
}

/** Copies DotText to the clipboard; downloads a .dot.txt instead when the clipboard is unavailable. */
export async function copyDotText(grid: DotGrid, name: string): Promise<"copied" | "downloaded"> {
  const text = serializeDotText(grid);
  if (typeof navigator.clipboard?.writeText === "function" && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return "copied";
  }
  downloadBlob(`${fileStem(name)}.dot.txt`, new Blob([text], { type: "text/plain;charset=utf-8" }));
  return "downloaded";
}

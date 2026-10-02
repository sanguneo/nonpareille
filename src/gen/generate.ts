import { removeOrphans } from "../cleanup/orphans.ts";
import { removeChromaKey } from "../cleanup/alpha.ts";
import { addOutline } from "../cleanup/outline.ts";
import { deltaE, rgba32ToOklab } from "../core/color.ts";
import { createGrid, createPalette } from "../core/grid.ts";
import type { DotGrid, RGBA32 } from "../core/types.ts";
import { detectGrid } from "../convert/grid-detect.ts";
import { cellsToGrid, resample } from "../convert/resample.ts";
import { snap } from "../convert/snap.ts";
import { decodePNG } from "../io/decode.ts";
import { buildImagePrompt, type GenSpec } from "./prompt.ts";
import type { ImageProvider } from "./providers/types.ts";

export interface GenReport {
  period: number;
  phase: [number, number];
  confidence: number;
  purity: number;
  paletteResidual: number;
  recommendRegenerate: boolean;
  attempts: number;
}

const MIN_CONFIDENCE = 0.15;
const MIN_PURITY = 0.7;

/** Snap every cell to the nearest requested palette color; returns the grid and mean dE of the cells. */
function snapToPalette(grid: DotGrid, colors: RGBA32[]): { grid: DotGrid; residual: number } {
  const palette = createPalette(colors);
  const labs = Array.from(palette.colors, rgba32ToOklab);
  const out = createGrid(grid.width, grid.height, palette);
  let total = 0, cells = 0;
  for (let n = 0; n < grid.data.length; n++) {
    const index = grid.data[n]!;
    if (index === 0) continue;
    const lab = rgba32ToOklab(grid.palette.colors[index]!);
    let best = 1, bestD = Infinity;
    for (let k = 1; k < labs.length; k++) {
      const d = deltaE(lab, labs[k]!);
      if (d < bestD) { bestD = d; best = k; }
    }
    out.data[n] = best;
    total += bestD;
    cells++;
  }
  return { grid: out, residual: cells ? total / cells : 0 };
}

export async function generate(
  spec: GenSpec,
  provider: ImageProvider,
  opts: { retries?: number; paletteColors?: RGBA32[] } = {},
): Promise<{ grid: DotGrid; report: GenReport }> {
  const retries = opts.retries ?? 0;
  const requested = (opts.paletteColors ?? []).filter((c) => (c & 255) !== 0);
  const built = buildImagePrompt(spec, requested);
  let best: { grid: DotGrid; report: GenReport } | undefined;
  let made = 0;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const baseSeed = spec.seed ?? 0;
    made = attempt;
    const result = await provider.generate({
      prompt: built.prompt,
      ...(built.negative ? { negative: built.negative } : {}),
      size: built.size,
      ...(spec.styleRef ? { refs: spec.styleRef } : {}),
      ...(spec.seed !== undefined || attempt > 1 ? { seed: baseSeed + attempt - 1 } : {}),
    });
    const img = decodePNG(result.png);
    const W = spec.width, H = spec.height;
    const full = { x0: 0, y0: 0, w: img.width, h: img.height };
    const keyed = spec.background === "key" ? removeChromaKey(img, built.keyColor) : img;

    let grid: DotGrid, purity: number, confidence: number, period: number, phase: [number, number];
    if (spec.model === "retro-diffusion") {
      const sampled = resample(keyed, full, W, H, "mode", { trim: 0.15 });
      grid = cellsToGrid(sampled.colors, W, H);
      purity = sampled.purity;
      confidence = 1;
      period = img.width / W;
      phase = [0, 0];
    } else {
      const prior = built.priorPeriod * (img.width / built.size[0]);
      const est = detectGrid(img, { periodX: prior, periodY: prior });
      confidence = est.confidence;
      period = est.px;
      phase = [est.phiX, est.phiY];
      if (est.confidence >= MIN_CONFIDENCE) {
        const snapped = snap(keyed, est, { sample: "mode", trim: 0.15 });
        grid = snapped.grid;
        purity = snapped.purity;
      } else {
        // No usable grid: fall back to a direct resample to the requested size.
        const sampled = resample(keyed, full, W, H, "mode", { trim: 0.15 });
        grid = cellsToGrid(sampled.colors, W, H);
        purity = sampled.purity;
      }
    }

    let paletteResidual = 0;
    if (requested.length > 0) {
      const mapped = snapToPalette(grid, requested);
      grid = mapped.grid;
      paletteResidual = mapped.residual;
    }
    grid = removeOrphans(grid).grid;
    if (spec.outline !== "none") grid = addOutline(grid, { mode: spec.outline });

    const report: GenReport = {
      period, phase, confidence, purity, paletteResidual, attempts: attempt,
      recommendRegenerate: confidence < MIN_CONFIDENCE || purity < MIN_PURITY,
    };
    if (!best || confidence > best.report.confidence) best = { grid, report };
    if (!report.recommendRegenerate) break;
  }
  const final = best!;
  return { grid: final.grid, report: { ...final.report, attempts: made } };
}

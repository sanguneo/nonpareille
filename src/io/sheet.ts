import type { DotGrid, Palette, RGBA32 } from "../core/types.ts";
import { InputError } from "../core/types.ts";
import { cloneGrid, createGrid, setDot } from "../core/grid.ts";

export interface PackOptions {
  pad?: number;
  margin?: number;
}

export interface FrameInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
}

export interface PackManifest {
  frames: FrameInfo[];
}

/**
 * Pack multiple frames into a single sprite sheet.
 * All frames must have the same dimensions (w×h) and share a palette.
 * Arranges frames in `cols` columns, calculates `rows` automatically.
 *
 * @param frames - Array of DotGrid frames, all same size
 * @param cols - Number of columns in the sheet
 * @param opts - Packing options (pad between frames, margin around edges)
 * @returns Sheet grid and manifest with frame positions
 */
export function packSheet(
  frames: DotGrid[],
  cols: number,
  opts?: PackOptions,
): { grid: DotGrid; manifest: PackManifest } {
  if (frames.length === 0) throw new InputError("packSheet requires at least one frame");
  if (!Number.isInteger(cols) || cols < 1) throw new InputError("cols must be a positive integer");

  const pad = opts?.pad ?? 0;
  const margin = opts?.margin ?? 0;

  // All frames must have same dimensions and palette
  const fw = frames[0]!.width;
  const fh = frames[0]!.height;
  const palette = frames[0]!.palette;

  for (let i = 1; i < frames.length; i++) {
    if (frames[i]!.width !== fw || frames[i]!.height !== fh) {
      throw new InputError(`frame ${i} size mismatch: expected ${fw}×${fh}, got ${frames[i]!.width}×${frames[i]!.height}`);
    }
  }

  const rows = Math.ceil(frames.length / cols);
  const sheetW = cols * fw + (cols - 1) * pad + 2 * margin;
  const sheetH = rows * fh + (rows - 1) * pad + 2 * margin;

  const sheet = createGrid(sheetW, sheetH, palette);

  const manifest: PackManifest = { frames: [] };

  for (let frameIdx = 0; frameIdx < frames.length; frameIdx++) {
    const frame = frames[frameIdx]!;
    const col = frameIdx % cols;
    const row = Math.floor(frameIdx / cols);
    const x = margin + col * (fw + pad);
    const y = margin + row * (fh + pad);

    // Copy frame data into sheet
    for (let fy = 0; fy < fh; fy++) {
      for (let fx = 0; fx < fw; fx++) {
        const sheetY = y + fy;
        const sheetX = x + fx;
        const frameIdx = fy * fw + fx;
        const frameColor = frame.data[frameIdx]!;
        setDot(sheet, sheetX, sheetY, frameColor);
      }
    }

    manifest.frames.push({
      x,
      y,
      w: fw,
      h: fh,
      durationMs: 100, // default duration
    });
  }

  return { grid: sheet, manifest };
}

/**
 * Slice a sprite sheet into individual frames.
 * Inverse of packSheet: extracts frames based on known frame dimensions.
 *
 * @param grid - Sheet DotGrid
 * @param fw - Frame width
 * @param fh - Frame height
 * @param opts - Slicing options (pad, margin)
 * @returns Array of frame DotGrids
 */
export function sliceSheet(
  grid: DotGrid,
  fw: number,
  fh: number,
  opts?: PackOptions,
): DotGrid[] {
  if (!Number.isInteger(fw) || !Number.isInteger(fh) || fw < 1 || fh < 1) {
    throw new InputError("frame dimensions must be positive integers");
  }

  const pad = opts?.pad ?? 0;
  const margin = opts?.margin ?? 0;

  const sheetW = grid.width;
  const sheetH = grid.height;

  // Calculate how many frames fit
  const contentW = sheetW - 2 * margin;
  const contentH = sheetH - 2 * margin;

  if (contentW <= 0 || contentH <= 0) {
    throw new InputError(
      `sheet size ${sheetW}×${sheetH} too small for margin ${margin}`,
    );
  }

  // Check if frame dimensions fit
  if ((fw + pad - pad) > contentW) {
    throw new InputError(
      `frame width ${fw} exceeds available width ${contentW}`,
    );
  }

  // Calculate columns and rows
  let cols = 1;
  if (fw + pad <= contentW) {
    cols = Math.floor((contentW + pad) / (fw + pad));
  }

  if ((fh + pad - pad) > contentH) {
    throw new InputError(
      `frame height ${fh} exceeds available height ${contentH}`,
    );
  }

  let rows = 1;
  if (fh + pad <= contentH) {
    rows = Math.floor((contentH + pad) / (fh + pad));
  }

  // Validate dimensions divide evenly
  const calcW = cols * fw + (cols - 1) * pad + 2 * margin;
  const calcH = rows * fh + (rows - 1) * pad + 2 * margin;

  if (calcW !== sheetW) {
    throw new InputError(
      `sheet width ${sheetW} does not match calculated ${calcW} (cols=${cols}, fw=${fw}, pad=${pad}, margin=${margin})`,
    );
  }
  if (calcH !== sheetH) {
    throw new InputError(
      `sheet height ${sheetH} does not match calculated ${calcH} (rows=${rows}, fh=${fh}, pad=${pad}, margin=${margin})`,
    );
  }

  const frames: DotGrid[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const frame = createGrid(fw, fh, grid.palette);
      const startX = margin + col * (fw + pad);
      const startY = margin + row * (fh + pad);

      for (let fy = 0; fy < fh; fy++) {
        for (let fx = 0; fx < fw; fx++) {
          const sheetX = startX + fx;
          const sheetY = startY + fy;
          const sourceIdx = sheetY * sheetW + sheetX;
          const color = grid.data[sourceIdx]!;
          setDot(frame, fx, fy, color);
        }
      }

      frames.push(frame);
    }
  }

  return frames;
}

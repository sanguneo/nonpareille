/**
 * Shared data model contract for the whole engine (plan section 3.2).
 * Every module imports these types from here; do not redefine them elsewhere.
 */

/** Packed color 0xRRGGBBAA as an unsigned 32-bit number (use `>>> 0`). */
export type RGBA32 = number;

/** Straight-alpha RGBA8 image. data.length === 4 * width * height. */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Palette {
  /** RGBA32 colors. colors[0] === 0x00000000 is reserved for transparency. */
  colors: Uint32Array;
  names?: (string | undefined)[];
  /** 1 = locked (k-means must not move it). */
  locked?: Uint8Array;
}

export interface DotGrid {
  /** Dot counts W, H (1..4096). */
  width: number;
  height: number;
  palette: Palette;
  /** length = W*H, value = palette index, 0 = transparent. Row-major: data[j*W + i]. */
  data: Uint16Array;
}

export interface CanvasSpec {
  /** Dot counts W, H. */
  width: number;
  height: number;
  /** Physical pixels per dot (integer >= 1). */
  dotW: number;
  dotH: number;
  /** Grid line thickness in px between dots. */
  gap: number;
  gapColor: RGBA32;
  /** Outer margin in px. */
  margin: number;
  background: RGBA32;
}

export interface Layer {
  name: string;
  visible: boolean;
  data: Uint16Array;
}

export interface Frame {
  layers: Layer[];
  durationMs: number;
}

export interface DotDocument {
  version: 1;
  canvas: CanvasSpec;
  palette: Palette;
  frames: Frame[];
  meta?: { source?: string; seed?: number; prompt?: string; tool?: string };
}

/** Error raised for invalid user input; CLI maps it to exit code 2. */
export class InputError extends Error {
  override name = "InputError";
}

/** Error raised when an image provider fails; CLI maps it to exit code 3. */
export class ProviderError extends Error {
  override name = "ProviderError";
}

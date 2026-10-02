/** Glyph shape vectors for Harri-style ASCII rendering (plan 5.10.4). */
import data from "./glyph-vectors.json";

/** Sampling circle: normalized cell coordinates (u, v); radius is RADIUS_CW * cell width. */
export interface Circle {
  u: number;
  v: number;
}

/** Must match RADIUS_CW in scripts/build-glyph-vectors.ts. */
export const RADIUS_CW = 0.28;

export interface GlyphVectors {
  font: string;
  /** Cell height / cell width (rho). */
  cellAspect: number;
  circles: Circle[];
  chars: string;
  vectors: number[][];
}

export const GLYPHS: GlyphVectors = data as GlyphVectors;

/** Six staggered circles from the build script, row-major: index = row * 2 + col. */
export const CIRCLES: readonly Circle[] = GLYPHS.circles;

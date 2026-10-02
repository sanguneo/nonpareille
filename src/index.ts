export type {
  RGBA32,
  RGBAImage,
  Palette,
  DotGrid,
  CanvasSpec,
  Layer,
  Frame,
  DotDocument,
} from "./core/types.ts";
export { InputError, ProviderError } from "./core/types.ts";

export {
  pack,
  unpack,
  SRGB_TO_LINEAR,
  srgbToLinear,
  linearToSrgb8,
  linearRgbToOklab,
  oklabToLinearRgb,
  rgbToOklab,
  oklabToRgb8,
  oklabToOklch,
  oklchToOklab,
  deltaE2,
  deltaE,
  rgba32ToOklab,
} from "./core/color.ts";
export {
  outputSize,
  pixelToDot,
  solveDotSize,
  solveDotCount,
  exactPadding,
  autoHeight,
  fitRect,
  defaultCanvas,
  validateCanvas,
} from "./core/geometry.ts";
export {
  createPalette,
  createGrid,
  cloneGrid,
  getDot,
  setDot,
  gridEquals,
  diffGrids,
  flatten,
  usedIndices,
  compactPalette,
} from "./core/grid.ts";
export { mulberry32, randInt, shuffle, hashSeed } from "./core/prng.ts";
export {
  createImage,
  getPixel,
  setPixel,
  cloneImage,
  binarizeAlpha,
} from "./core/image.ts";
export { renderRGBA } from "./core/render.ts";

export { decodePNG, decodeImage, readImageFile } from "./io/decode.ts";
export { crc32, encodeIndexedPNG, encodeRGBAPNG } from "./io/png-encode.ts";
export {
  parseDotText,
  serializeDotText,
  applyDotTextPatch,
} from "./io/dottext.ts";
export {
  serializeDocument,
  parseDocument,
  gridToDocument,
  documentToGrid,
} from "./io/project.ts";
export { toSVG } from "./io/svg.ts";
export {
  parsePaletteFile,
  formatPaletteFile,
  paletteFromPNG,
  fetchLospec,
  loadPaletteSpec,
} from "./io/palette-files.ts";
export {
  packSheet,
  sliceSheet,
} from "./io/sheet.ts";
export type {
  PackOptions,
  FrameInfo,
  PackManifest,
} from "./io/sheet.ts";

export { PRESETS, getPreset } from "./palette/presets.ts";
export { buildHistogram } from "./palette/histogram.ts";
export type { Histogram } from "./palette/histogram.ts";
export { medianCut } from "./palette/median-cut.ts";
export { kmeans } from "./palette/kmeans.ts";
export { extractPalette } from "./palette/extract.ts";
export { paletteLab, PaletteMapper } from "./palette/map.ts";
export { hueShiftRamp, sortPalette } from "./palette/ramp.ts";

export { resample, cellsToGrid } from "./convert/resample.ts";
export type { SampleMode, ResampleOptions } from "./convert/resample.ts";
export { detectGrid } from "./convert/grid-detect.ts";
export type { GridEstimate } from "./convert/grid-detect.ts";
export { snap, snapImage } from "./convert/snap.ts";
export type { SnapOptions } from "./convert/snap.ts";
export { outlineExpand } from "./convert/outline-expand.ts";
export { convertWithReport, convert } from "./convert/pipeline.ts";
export type { DitherMode, ConvertOptions } from "./convert/pipeline.ts";

export { KERNELS, diffuseDither } from "./dither/diffusion.ts";
export type { DiffusionKernel } from "./dither/diffusion.ts";
export { bayerMatrix, bayerDither } from "./dither/ordered.ts";
export { yliluomaDither } from "./dither/yliluoma.ts";

export { removeOrphans } from "./cleanup/orphans.ts";
export { innerBorder, addOutline } from "./cleanup/outline.ts";
export {
  removeChromaKey,
  removeBorderBackground,
  fixKeyFringe,
} from "./cleanup/alpha.ts";

export {
  bresenham,
  ellipseRect,
  floodFill,
  applyOp,
  applyOps,
} from "./draw/primitives.ts";
export type { DrawOp } from "./draw/primitives.ts";
export { pixelPerfect } from "./draw/stroke.ts";

export { generateSprite } from "./gen/bollinger.ts";
export { MASKS } from "./gen/masks.ts";
export type { SpriteMask } from "./gen/bollinger.ts";
export { chooseModelCanvas, blockSize, chooseKeyColor, buildImagePrompt } from "./gen/prompt.ts";
export type { GenSpec } from "./gen/prompt.ts";
export { buildPainterPrompt } from "./gen/painter-prompt.ts";
export type { PainterPromptSpec } from "./gen/painter-prompt.ts";
export { generate } from "./gen/generate.ts";
export type { GenReport } from "./gen/generate.ts";
export { getProvider } from "./gen/providers/index.ts";
export type { ImageProvider } from "./gen/providers/types.ts";

export { toHalfBlock } from "./text/halfblock.ts";
export { toBraille } from "./text/braille.ts";
export { toLumaRamp } from "./text/ramp.ts";
export { toShapeAscii } from "./text/shape-ascii.ts";
export type { ShapeAsciiOptions } from "./text/shape-ascii.ts";
export { GLYPHS, CIRCLES, RADIUS_CW } from "./text/glyph-vectors.ts";
export type { Circle, GlyphVectors } from "./text/glyph-vectors.ts";

export { sliceTiles, tileMosaic } from "./mosaic/tile-mosaic.ts";
export { billOfMaterials } from "./mosaic/bom.ts";
export type { MaterialColor } from "./mosaic/bom.ts";

export {
  EASYRPG_PRESETS,
  charsetFramePos,
  validateEasyRpgPng,
  encodeEasyRpg,
} from "./presets/easyrpg.ts";
export type {
  EasyRPGPreset,
  ValidateResult,
} from "./presets/easyrpg.ts";

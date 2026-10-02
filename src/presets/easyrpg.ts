import { InputError } from "../core/types.ts";
import type { DotGrid, Palette, RGBA32 } from "../core/types.ts";
import { encodeIndexedPNG } from "../io/png-encode.ts";

export interface EasyRPGPreset {
  name: string;
  width: number;
  height: number;
  tileWidth?: number;
  tileHeight?: number;
  description: string;
}

export const EASYRPG_PRESETS: Record<string, EasyRPGPreset> = {
  "charset": {
    name: "CharSet",
    width: 288,
    height: 256,
    tileWidth: 24,
    tileHeight: 32,
    description: "Character set: 24×32 frames, 4×2 characters, 3 frames × 4 directions",
  },
  "chipset": {
    name: "ChipSet",
    width: 480,
    height: 256,
    tileWidth: 16,
    tileHeight: 16,
    description: "Tileset: 16×16 tiles, 30×16 layout",
  },
  "faceset": {
    name: "FaceSet",
    width: 192,
    height: 192,
    tileWidth: 48,
    tileHeight: 48,
    description: "Face set: 48×48 portraits, 4×4 layout",
  },
  "battle": {
    name: "Battle",
    width: 480,
    height: 96,
    tileWidth: 96,
    tileHeight: 96,
    description: "Battle sprite: 96×96, 5 per row",
  },
  "battle2": {
    name: "Battle2",
    width: 640,
    height: 640,
    tileWidth: 128,
    tileHeight: 128,
    description: "Battle sprite (2003): 128×128, 5 per row",
  },
  "battlechrset": {
    name: "BattleCharSet",
    width: 144,
    height: 384,
    tileWidth: 48,
    tileHeight: 48,
    description: "Battle character set (2003): 48×48, 3 frames × 8 rows",
  },
  "battleweapon": {
    name: "BattleWeapon",
    width: 192,
    height: 512,
    tileWidth: 64,
    tileHeight: 64,
    description: "Battle weapon (2003): 64×64, 3 × 8",
  },
  "system": {
    name: "System",
    width: 160,
    height: 80,
    description: "System graphics (windows, menus)",
  },
  "system2": {
    name: "System2",
    width: 80,
    height: 96,
    description: "System graphics 2 (2003)",
  },
  "title": {
    name: "Title",
    width: 320,
    height: 240,
    description: "Title screen background",
  },
  "frame": {
    name: "Frame",
    width: 320,
    height: 240,
    description: "Frame graphics",
  },
  "backdrop": {
    name: "Backdrop",
    width: 320,
    height: 160,
    description: "Battle backdrop (2000)",
  },
  "panorama": {
    name: "Panorama",
    width: 640,
    height: 480,
    description: "Panorama background",
  },
};

export interface ValidateResult {
  ok: boolean;
  errors: string[];
}

/**
 * Calculate CharSet frame position from character index, direction, and frame.
 */
export function charsetFramePos(c: number, d: number, f: number): { x: number; y: number } {
  if (!Number.isInteger(c) || c < 0 || c > 7) throw new InputError("character index must be 0..7");
  if (!Number.isInteger(d) || d < 0 || d > 3) throw new InputError("direction must be 0..3");
  if (!Number.isInteger(f) || f < 0 || f > 2) throw new InputError("frame must be 0..2");

  const charGridCol = c % 4;
  const charGridRow = Math.floor(c / 4);

  const x = charGridCol * 72 + f * 24;
  const y = charGridRow * 128 + d * 32;

  return { x, y };
}

/**
 * Validate that a PNG file matches EasyRPG specifications.
 */
export function validateEasyRpgPng(bytes: Uint8Array, preset: EasyRPGPreset): ValidateResult {
  const errors: string[] = [];

  try {
    if (bytes.length < 24) {
      errors.push("PNG too short");
      return { ok: false, errors };
    }

    // Check PNG signature
    const sig = bytes.slice(0, 8);
    if (sig[0] !== 0x89 || sig[1] !== 0x50 || sig[2] !== 0x4e || sig[3] !== 0x47 ||
        sig[4] !== 0x0d || sig[5] !== 0x0a || sig[6] !== 0x1a || sig[7] !== 0x0a) {
      errors.push("Invalid PNG signature");
      return { ok: false, errors };
    }

    // Parse IHDR chunk
    const view = new DataView(bytes.buffer);
    let offset = 8;
    const headerLen = view.getUint32(offset);
    if (headerLen !== 13) {
      errors.push("Invalid IHDR chunk");
      return { ok: false, errors };
    }

    offset += 4;
    const chunkType = bytes.slice(offset, offset + 4);
    if (chunkType[0] !== 0x49 || chunkType[1] !== 0x48 || chunkType[2] !== 0x44 || chunkType[3] !== 0x52) {
      errors.push("First chunk is not IHDR");
      return { ok: false, errors };
    }

    offset += 4;
    const width = view.getUint32(offset);
    const height = view.getUint32(offset + 4);
    const bitDepth = bytes[offset + 8]!;
    const colorType = bytes[offset + 9]!;

    if (width !== preset.width || height !== preset.height) {
      errors.push(`Size mismatch: expected ${preset.width}×${preset.height}, got ${width}×${height}`);
    }

    if (colorType !== 3) {
      errors.push(`Color type must be 3 (indexed), got ${colorType}`);
    }

    if (bitDepth !== 8) {
      errors.push(`Bit depth must be 8, got ${bitDepth}`);
    }
  } catch (e) {
    errors.push(`Error parsing PNG: ${(e as Error).message}`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Encode a DotGrid as EasyRPG-compatible PNG (8-bit indexed).
 */
export function encodeEasyRpg(
  grid: DotGrid,
  preset: EasyRPGPreset,
  keyColor: RGBA32 = 0xff00ffff,
): Uint8Array {
  if (grid.width !== preset.width || grid.height !== preset.height) {
    throw new InputError(
      `Grid size ${grid.width}×${grid.height} does not match preset ${preset.width}×${preset.height}`,
    );
  }

  // Create palette with key color at index 0
  const palette = new Uint32Array(grid.palette.colors.length);
  palette[0] = keyColor;
  for (let i = 1; i < grid.palette.colors.length; i++) {
    palette[i] = grid.palette.colors[i]!;
  }

  // Encode as indexed PNG with 8-bit depth (forced)
  return encodeIndexedPNG(
    {
      width: grid.width,
      height: grid.height,
      indices: grid.data,
      palette,
    },
    { bitDepth: 8 },
  );
}

import { z } from "zod";
import { createGrid, flatten } from "../core/grid.ts";
import type { CanvasSpec, DotDocument, DotGrid, Frame, Palette } from "../core/types.ts";

const paletteSchema = z.object({
  colors: z.array(z.number().int().min(0).max(0xffffffff)),
  names: z.array(z.string().nullable().optional()).optional(),
  locked: z.array(z.number().int().min(0).max(255)).optional(),
});
const canvasSchema = z.object({
  width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096),
  dotW: z.number().int().min(1), dotH: z.number().int().min(1),
  gap: z.number().int().min(0), gapColor: z.number().int().min(0).max(0xffffffff),
  margin: z.number().int().min(0), background: z.number().int().min(0).max(0xffffffff),
});
const frameSchema = z.object({
  durationMs: z.number().nonnegative(),
  layers: z.array(z.object({
    name: z.string(), visible: z.boolean(), data: z.string(),
  })),
});
const documentSchema = z.object({
  version: z.literal(1), canvas: canvasSchema, palette: paletteSchema,
  frames: z.array(frameSchema),
  meta: z.object({ source: z.string().optional(), seed: z.number().optional(), prompt: z.string().optional(), tool: z.string().optional() }).optional(),
});

function encodeData(data: Uint16Array): string {
  const bytes = new Uint8Array(data.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < data.length; i++) view.setUint16(i * 2, data[i]!, true);
  return Buffer.from(bytes).toString("base64");
}

function decodeData(encoded: string, size: number): Uint16Array {
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== size * 2) throw new Error("Layer data has invalid length");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Uint16Array.from({ length: size }, (_, i) => view.getUint16(i * 2, true));
}

export function serializeDocument(doc: DotDocument): string {
  return JSON.stringify({
    ...doc,
    palette: {
      ...doc.palette, colors: Array.from(doc.palette.colors),
      ...(doc.palette.names === undefined ? {} : { names: doc.palette.names.map((name) => name ?? null) }),
      ...(doc.palette.locked === undefined ? {} : { locked: Array.from(doc.palette.locked) }),
    },
    frames: doc.frames.map((frame) => ({
      ...frame, layers: frame.layers.map((layer) => ({ ...layer, data: encodeData(layer.data) })),
    })),
  });
}

export function parseDocument(json: string): DotDocument {
  const raw: unknown = JSON.parse(json);
  const parsed = documentSchema.parse(raw);
  const size = parsed.canvas.width * parsed.canvas.height;
  const palette: Palette = {
    colors: Uint32Array.from(parsed.palette.colors),
    ...(parsed.palette.names === undefined ? {} : { names: parsed.palette.names.map((name) => name ?? undefined) }),
    ...(parsed.palette.locked === undefined ? {} : { locked: Uint8Array.from(parsed.palette.locked) }),
  };
  const frames: Frame[] = parsed.frames.map((frame) => ({
    durationMs: frame.durationMs,
    layers: frame.layers.map((layer) => ({
      name: layer.name, visible: layer.visible, data: decodeData(layer.data, size),
    })),
  }));
  return {
    version: 1, canvas: parsed.canvas as CanvasSpec, palette, frames,
    ...(parsed.meta === undefined ? {} : { meta: parsed.meta }),
  };
}

export function gridToDocument(grid: DotGrid, canvas?: CanvasSpec): DotDocument {
  return {
    version: 1,
    canvas: canvas ?? {
      width: grid.width, height: grid.height, dotW: 1, dotH: 1, gap: 0,
      gapColor: 0, margin: 0, background: 0,
    },
    palette: grid.palette,
    frames: [{ durationMs: 100, layers: [{ name: "Layer 1", visible: true, data: new Uint16Array(grid.data) }] }],
  };
}

export function documentToGrid(doc: DotDocument, frameIndex = 0): DotGrid {
  const frame = doc.frames[frameIndex];
  if (!frame) throw new RangeError(`Frame index out of range: ${frameIndex}`);
  const grid = createGrid(doc.canvas.width, doc.canvas.height, doc.palette);
  grid.data.set(flatten(frame, grid.width, grid.height));
  return grid;
}

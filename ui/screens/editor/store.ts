import { useSyncExternalStore } from "react";
import { deltaE2, rgba32ToOklab } from "../../../src/core/color.ts";
import { defaultCanvas } from "../../../src/core/geometry.ts";
import { createGrid, createPalette } from "../../../src/core/grid.ts";
import type { CanvasSpec, DotDocument, DotGrid, Palette, RGBA32 } from "../../../src/core/types.ts";
import { documentToGrid } from "../../../src/io/project.ts";
import { getPreset } from "../../../src/palette/presets.ts";
import { type DocumentMeta, getCurrentDocument, getCurrentMeta, setCurrentDocument } from "../../state.ts";

/**
 * Editor session: the grid being edited, its undo/redo stacks and gallery metadata.
 *
 * The session lives at module level so switching screens and coming back keeps the
 * work and the history. Every committed change is also pushed to ui/state.ts as a
 * DotDocument, which is how the editor hands documents to Gallery / exports and how
 * it detects that another screen opened a different document (identity check).
 *
 * The editor works on frame 0 flattened to one layer (documentToGrid); saving writes
 * that single layer back and keeps the source canvas spec and meta.
 */

/** One dot changed by a draw operation (same shape as applyOp's `changed`). */
export interface DotChange {
  i: number;
  j: number;
  from: number;
  to: number;
}

/** Undo unit: dot changes plus the palette swap that produced them, if any. */
export interface HistoryEntry {
  changes: DotChange[];
  palette?: { from: Palette; to: Palette };
}

export interface EditorSnapshot {
  grid: DotGrid;
  meta: DocumentMeta;
  name: string;
  canUndo: boolean;
  canRedo: boolean;
  /** Edited since the document was loaded or last saved to the gallery. */
  dirty: boolean;
}

interface SessionCore {
  grid: DotGrid;
  /** Canvas spec of the loaded document; width/height follow the grid on export. */
  canvas: CanvasSpec;
  docMeta: DotDocument["meta"];
  durationMs: number;
  meta: DocumentMeta;
  name: string;
  undo: HistoryEntry[];
  redo: HistoryEntry[];
  dirty: boolean;
}

interface Session extends SessionCore {
  /** Document last handed to ui/state.ts; identity tells our own pushes from external loads. */
  syncedDoc: DotDocument | null;
  snapshot: EditorSnapshot;
}

export const DEFAULT_SIZE = 32;
export const DEFAULT_PRESET = "pico8";
/** Largest canvas the browser editor creates (documents loaded from elsewhere may be bigger). */
export const MAX_EDIT_SIZE = 256;
/** PNG indexed export and the palette panel stop at this many entries (transparent included). */
export const MAX_PALETTE = 256;
const HISTORY_LIMIT = 200;
const DEFAULT_DURATION_MS = 100;

let session: Session | null = null;
const listeners = new Set<() => void>();

function snapshotOf(core: SessionCore): EditorSnapshot {
  return {
    grid: core.grid,
    meta: core.meta,
    name: core.name,
    canUndo: core.undo.length > 0,
    canRedo: core.redo.length > 0,
    dirty: core.dirty,
  };
}

function toDocument(core: Pick<SessionCore, "grid" | "canvas" | "docMeta" | "durationMs">): DotDocument {
  const { grid } = core;
  return {
    version: 1,
    canvas: { ...core.canvas, width: grid.width, height: grid.height },
    palette: grid.palette,
    frames: [{ durationMs: core.durationMs, layers: [{ name: "Layer 1", visible: true, data: new Uint16Array(grid.data) }] }],
    ...(core.docMeta === undefined ? {} : { meta: core.docMeta }),
  };
}

function fromDocument(doc: DotDocument, meta: DocumentMeta): Session {
  const core: SessionCore = {
    grid: documentToGrid(doc),
    canvas: doc.canvas,
    docMeta: doc.meta,
    durationMs: doc.frames[0]?.durationMs ?? DEFAULT_DURATION_MS,
    meta,
    name: meta.name ?? "",
    undo: [],
    redo: [],
    dirty: false,
  };
  return { ...core, syncedDoc: doc, snapshot: snapshotOf(core) };
}

function blankSession(): Session {
  const core: SessionCore = {
    grid: createGrid(DEFAULT_SIZE, DEFAULT_SIZE, getPreset(DEFAULT_PRESET)),
    canvas: defaultCanvas(DEFAULT_SIZE, DEFAULT_SIZE),
    docMeta: undefined,
    durationMs: DEFAULT_DURATION_MS,
    meta: {},
    name: "",
    undo: [],
    redo: [],
    dirty: false,
  };
  return { ...core, syncedDoc: null, snapshot: snapshotOf(core) };
}

function ensureSession(): Session {
  const current = getCurrentDocument();
  if (session !== null && session.syncedDoc === current) return session;
  session = current === null ? blankSession() : fromDocument(current, getCurrentMeta());
  return session;
}

function commitSession(core: SessionCore, doc: DotDocument = toDocument(core)): void {
  session = { ...core, syncedDoc: doc, snapshot: snapshotOf(core) };
  setCurrentDocument(doc, core.meta);
  for (const listener of listeners) listener();
}

function withChanges(grid: DotGrid, changes: readonly DotChange[], key: "from" | "to", palette: Palette): DotGrid {
  const data = new Uint16Array(grid.data);
  for (const change of changes) data[change.j * grid.width + change.i] = change[key];
  return { width: grid.width, height: grid.height, palette, data };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding: re-renders on every committed change. */
export function useEditor(): EditorSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => ensureSession().snapshot,
    () => ensureSession().snapshot,
  );
}

/** The document as it would be saved or exported right now. */
export function currentDocument(): DotDocument {
  const s = ensureSession();
  return s.syncedDoc ?? toDocument(s);
}

/** Records one undo step: dot changes (applyOp's `changed`) and, optionally, a new palette. */
export function commitChanges(changes: DotChange[], palette?: Palette): void {
  const s = ensureSession();
  if (changes.length === 0 && palette === undefined) return;
  const entry: HistoryEntry = palette === undefined ? { changes } : { changes, palette: { from: s.grid.palette, to: palette } };
  commitSession({
    ...s,
    grid: withChanges(s.grid, changes, "to", palette ?? s.grid.palette),
    undo: [...s.undo.slice(-(HISTORY_LIMIT - 1)), entry],
    redo: [],
    dirty: true,
  });
}

export function undo(): void {
  const s = ensureSession();
  const entry = s.undo[s.undo.length - 1];
  if (!entry) return;
  commitSession({
    ...s,
    grid: withChanges(s.grid, entry.changes, "from", entry.palette?.from ?? s.grid.palette),
    undo: s.undo.slice(0, -1),
    redo: [...s.redo, entry],
    dirty: true,
  });
}

export function redo(): void {
  const s = ensureSession();
  const entry = s.redo[s.redo.length - 1];
  if (!entry) return;
  commitSession({
    ...s,
    grid: withChanges(s.grid, entry.changes, "to", entry.palette?.to ?? s.grid.palette),
    undo: [...s.undo, entry],
    redo: s.redo.slice(0, -1),
    dirty: true,
  });
}

/** Appends a color to the palette (undoable). Returns its index, or null when the palette is full. */
export function addColor(color: RGBA32): number | null {
  const s = ensureSession();
  const current = s.grid.palette;
  if (current.colors.length >= MAX_PALETTE) return null;
  const colors = new Uint32Array(current.colors.length + 1);
  colors.set(current.colors);
  colors[current.colors.length] = color >>> 0;
  const palette: Palette = {
    colors,
    ...(current.names === undefined ? {} : { names: [...current.names, undefined] }),
    ...(current.locked === undefined ? {} : { locked: Uint8Array.from([...current.locked, 0]) }),
  };
  commitChanges([], palette);
  return current.colors.length;
}

/**
 * Replaces the palette with a preset and remaps every painted dot to the nearest
 * preset color (OKLab distance, plan section 5.2). One undo step.
 */
export function applyPreset(colors: readonly RGBA32[]): void {
  const s = ensureSession();
  const palette = createPalette([...colors]);
  const targets = Array.from(palette.colors, (color) => rgba32ToOklab(color));
  const nearest = new Map<number, number>();
  const remap = (from: number): number => {
    const cached = nearest.get(from);
    if (cached !== undefined) return cached;
    const lab = rgba32ToOklab(s.grid.palette.colors[from] ?? 0);
    let best = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let k = 1; k < targets.length; k++) {
      const distance = deltaE2(lab, targets[k]!);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = k;
      }
    }
    nearest.set(from, best);
    return best;
  };
  const changes: DotChange[] = [];
  const { data, width } = s.grid;
  for (let k = 0; k < data.length; k++) {
    const from = data[k]!;
    if (from === 0) continue;
    const to = remap(from);
    if (to !== from) changes.push({ i: k % width, j: Math.floor(k / width), from, to });
  }
  commitChanges(changes, palette);
}

/** Starts a blank document of the given size with the current palette; history is cleared. */
export function newCanvas(width: number, height: number): void {
  const s = ensureSession();
  commitSession({
    grid: createGrid(width, height, s.grid.palette),
    canvas: defaultCanvas(width, height),
    docMeta: undefined,
    durationMs: DEFAULT_DURATION_MS,
    meta: {},
    name: "",
    undo: [],
    redo: [],
    dirty: true,
  });
}

export function rename(name: string): void {
  const s = ensureSession();
  commitSession({ ...s, name, meta: { ...s.meta, name } }, s.syncedDoc ?? undefined);
}

/** Called after POST/PUT /api/docs succeeded. */
export function markSaved(id: string, name: string): void {
  const s = ensureSession();
  commitSession({ ...s, name, meta: { id, name }, dirty: false }, s.syncedDoc ?? undefined);
}

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { removeOrphans } from "../src/cleanup/orphans.ts";
import { addOutline } from "../src/cleanup/outline.ts";
import { cloneGrid, createGrid, createPalette, diffGrids } from "../src/core/grid.ts";
import { renderRGBA } from "../src/core/render.ts";
import { InputError, type CanvasSpec, type DotGrid } from "../src/core/types.ts";
import { applyOp, type DrawOp } from "../src/draw/primitives.ts";
import { parseDotText, serializeDotText } from "../src/io/dottext.ts";
import { encodeIndexedPNG, encodeRGBAPNG } from "../src/io/png-encode.ts";
import { gridToDocument, serializeDocument } from "../src/io/project.ts";
import { toSVG } from "../src/io/svg.ts";
import { getPreset } from "../src/palette/presets.ts";

/** Keys auto-assigned to palette entries, in the same order DotText serialization uses. */
const AUTO_KEYS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$%&()*+,-./:;<=>?[]^_`{|}~"];

/** Grid plus the DotText key for each palette index >= 1 (keys[i - 1] belongs to index i). */
interface State { grid: DotGrid; keys: string[] }

/** Undo entry: per-cell changes, or whole-state swap when palette/size changed. */
interface Change {
  cells: { k: number; from: number; to: number }[];
  before?: State;
  after?: State;
}

type LogEntry = DrawOp | { type: "palette" | "dottext" | "outline" | "remove_orphans" };

interface Doc extends State {
  log: LogEntry[];
  undo: Change[];
  redo: Change[];
  previews: number;
}

function parseHex(hex: string): number {
  if (!/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/.test(hex)) throw new InputError(`invalid color "${hex}"`);
  const v = Number.parseInt(hex.slice(1), 16);
  return (hex.length === 7 ? v * 0x100 + 0xff : v) >>> 0;
}

function snapshot(s: State): State {
  return { grid: cloneGrid(s.grid), keys: s.keys.slice() };
}

/** Reads the palette keys of a DotText source in declaration order. */
function dotTextKeys(src: string): string[] {
  const keys: string[] = [];
  let inPalette = false;
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith(";")) continue;
    if (line.startsWith("@")) inPalette = line === "@palette";
    else if (inPalette) keys.push(line[0]!);
  }
  return keys;
}

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value) }],
});

export function createDotMcpServer(): McpServer {
  const server = new McpServer({ name: "nonpareille", version: "0.1.0" });
  const docs = new Map<string, Doc>();
  let nextId = 1;

  const getDoc = (docId: string): Doc => {
    const doc = docs.get(docId);
    if (!doc) throw new InputError(`unknown docId "${docId}"`);
    return doc;
  };
  const keyIndex = (doc: Doc, key: string): number => {
    if (key === ".") return 0;
    const i = doc.keys.indexOf(key);
    if (i < 0) throw new InputError(`unknown palette key "${key}"`);
    return i + 1;
  };
  const record = (doc: Doc, change: Change, entry: LogEntry): void => {
    doc.log.push(entry);
    doc.undo.push(change);
    doc.redo.length = 0;
  };
  /** Applies a DrawOp and records its inverse change list; returns the number of changed dots. */
  const draw = (doc: Doc, op: DrawOp): number => {
    const { changed } = applyOp(doc.grid, op);
    const cells = changed.map((c) => ({ k: c.j * doc.grid.width + c.i, from: c.from, to: c.to }));
    record(doc, { cells }, op);
    return cells.length;
  };
  /** Replaces the whole document state, recording the cell diff (or a state swap if palette/size changed). */
  const replace = (doc: Doc, next: State, entry: LogEntry): number => {
    const sameShape = next.grid.width === doc.grid.width && next.grid.height === doc.grid.height;
    const samePalette = sameShape && next.keys.join("\0") === doc.keys.join("\0") &&
      next.grid.palette.colors.length === doc.grid.palette.colors.length &&
      next.grid.palette.colors.every((c, i) => c === doc.grid.palette.colors[i]);
    const diff = sameShape ? diffGrids(doc.grid, next.grid) : [];
    const changed = sameShape ? diff.length : next.grid.data.length;
    const change: Change = samePalette
      ? { cells: diff.map((c) => ({ k: c.j * doc.grid.width + c.i, from: c.from, to: c.to })) }
      : { cells: [], before: snapshot(doc), after: snapshot(next) };
    doc.grid = next.grid;
    doc.keys = next.keys;
    record(doc, change, entry);
    return changed;
  };
  const step = (doc: Doc, change: Change, forward: boolean): void => {
    if (change.before && change.after) {
      const s = snapshot(forward ? change.after : change.before);
      doc.grid = s.grid;
      doc.keys = s.keys;
    } else for (const c of change.cells) doc.grid.data[c.k] = forward ? c.to : c.from;
  };
  const canvasFor = (grid: DotGrid, scale: number, gap: number): CanvasSpec => ({
    width: grid.width, height: grid.height, dotW: scale, dotH: scale,
    gap, gapColor: 0x000000ff, margin: 0, background: 0,
  });

  const docId = z.string();
  const coord = z.number().int();
  const key = z.string().length(1);

  server.registerTool("canvas_new", {
    description: "Create an empty canvas. palette: preset name or list of #rrggbb[aa] colors (keys auto-assigned A, B, C...). Default pico8.",
    inputSchema: {
      width: z.number().int().min(1).max(4096),
      height: z.number().int().min(1).max(4096),
      palette: z.union([z.string(), z.array(z.string())]).optional(),
    },
  }, ({ width, height, palette }) => {
    const pal = Array.isArray(palette) ? createPalette([0, ...palette.map(parseHex)]) : getPreset(palette ?? "pico8");
    const id = `doc${nextId++}`;
    docs.set(id, {
      grid: createGrid(width, height, pal),
      keys: AUTO_KEYS.slice(0, pal.colors.length - 1),
      log: [], undo: [], redo: [], previews: 0,
    });
    return text({ docId: id });
  });

  server.registerTool("palette_set", {
    description: "Set or add palette colors by DotText key. Returns the palette.",
    inputSchema: { docId, colors: z.array(z.object({ key, hex: z.string() })).min(1) },
  }, ({ docId: id, colors }) => {
    const doc = getDoc(id);
    const next = snapshot(doc);
    const list = Array.from(next.grid.palette.colors);
    for (const { key: k, hex } of colors) {
      if (k === "." || k === "@" || k === "#" || !/^[\x21-\x7e]$/.test(k)) throw new InputError(`invalid palette key "${k}"`);
      const i = next.keys.indexOf(k);
      if (i >= 0) list[i + 1] = parseHex(hex);
      else {
        if (next.keys.length >= 91) throw new InputError("palette is full (91 keys)");
        next.keys.push(k);
        list.push(parseHex(hex));
        next.grid.palette.names?.push(undefined);
      }
    }
    next.grid.palette.colors = Uint32Array.from(list);
    replace(doc, next, { type: "palette" });
    return text(doc.keys.map((k, i) => ({ key: k, hex: `#${doc.grid.palette.colors[i + 1]!.toString(16).padStart(8, "0")}` })));
  });

  server.registerTool("set_pixels", {
    description: "Set individual dots. points: [x, y, key][] (max 4096).",
    inputSchema: { docId, points: z.array(z.tuple([coord, coord, key])).max(4096) },
  }, ({ docId: id, points }) => {
    const doc = getDoc(id);
    return text({ changed: draw(doc, { type: "set", points: points.map(([x, y, k]) => [x, y, keyIndex(doc, k)]) }) });
  });

  server.registerTool("draw_line", {
    description: "Draw a Bresenham line from (x0,y0) to (x1,y1).",
    inputSchema: { docId, x0: coord, y0: coord, x1: coord, y1: coord, key },
  }, ({ docId: id, x0, y0, x1, y1, key: k }) => {
    const doc = getDoc(id);
    return text({ changed: draw(doc, { type: "line", x0, y0, x1, y1, idx: keyIndex(doc, k) }) });
  });

  const box = { docId, x: coord, y: coord, w: z.number().int().min(1), h: z.number().int().min(1), key, fill: z.boolean().optional() };
  server.registerTool("draw_rect", {
    description: "Draw a rectangle (outline unless fill).",
    inputSchema: box,
  }, ({ docId: id, x, y, w, h, key: k, fill }) => {
    const doc = getDoc(id);
    return text({ changed: draw(doc, { type: "rect", x, y, w, h, idx: keyIndex(doc, k), fill: fill ?? false }) });
  });

  server.registerTool("draw_ellipse", {
    description: "Draw an ellipse inscribed in the w x h box at (x,y) (outline unless fill).",
    inputSchema: box,
  }, ({ docId: id, x, y, w, h, key: k, fill }) => {
    const doc = getDoc(id);
    return text({ changed: draw(doc, { type: "ellipse", x, y, w, h, idx: keyIndex(doc, k), fill: fill ?? false }) });
  });

  server.registerTool("flood_fill", {
    description: "4-connected flood fill from (x,y).",
    inputSchema: { docId, x: coord, y: coord, key },
  }, ({ docId: id, x, y, key: k }) => {
    const doc = getDoc(id);
    return text({ changed: draw(doc, { type: "fill", x, y, idx: keyIndex(doc, k) }) });
  });

  server.registerTool("mirror", {
    description: "Mirror the given half onto the other half. axis x uses left/right, axis y uses top/bottom.",
    inputSchema: { docId, axis: z.enum(["x", "y"]), half: z.enum(["left", "right", "top", "bottom"]) },
  }, ({ docId: id, axis, half }) => {
    if ((axis === "x") !== (half === "left" || half === "right")) throw new InputError(`half "${half}" does not match axis "${axis}"`);
    return text({ changed: draw(getDoc(id), { type: "mirror", axis, half }) });
  });

  server.registerTool("apply_dottext", {
    description: "Replace the document with a full DotText, or paste rows of existing keys at '@patch x,y'.",
    inputSchema: { docId, dottext: z.string() },
  }, ({ docId: id, dottext }) => {
    const doc = getDoc(id);
    const patch = /^\s*@patch\s+(\d+),(\d+)\s*$/m.exec(dottext);
    let next: State;
    if (patch) {
      next = snapshot(doc);
      const x0 = Number(patch[1]), y0 = Number(patch[2]);
      const rows = dottext.slice(patch.index + patch[0].length).replace(/\r/g, "").split("\n").map((r) => r.trim()).filter(Boolean);
      rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
        const x = x0 + dx, y = y0 + dy;
        const idx = keyIndex(doc, ch);
        if (x < next.grid.width && y < next.grid.height) next.grid.data[y * next.grid.width + x] = idx;
      }));
    } else {
      const grid = parseDotText(dottext);
      next = { grid, keys: dotTextKeys(dottext) };
    }
    const changed = replace(doc, next, { type: "dottext" });
    return text({ mode: patch ? "patch" : "replace", width: doc.grid.width, height: doc.grid.height, changed });
  });

  server.registerTool("get_grid", {
    description: "Return the grid as DotText or ANSI half-block text.",
    inputSchema: { docId, format: z.enum(["dottext", "halfblock"]).optional() },
  }, async ({ docId: id, format }) => {
    const doc = getDoc(id);
    if (format === "halfblock") {
      try {
        const mod = await import("../src/text/halfblock.ts");
        return text(mod.toHalfBlock(doc.grid));
      } catch {
        return text(`; note: halfblock renderer unavailable, returning dottext\n${serializeDotText(doc.grid, { keys: doc.keys })}`);
      }
    }
    return text(serializeDotText(doc.grid, { keys: doc.keys }));
  });

  server.registerTool("render_preview", {
    description: "Render a PNG preview into the OS temp dir and return its path.",
    inputSchema: { docId, scale: z.number().int().min(1).max(64), gap: z.number().int().min(0).optional() },
  }, ({ docId: id, scale, gap }) => {
    const doc = getDoc(id);
    const path = join(tmpdir(), "nonpareille-mcp", `${id}-${++doc.previews}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodeRGBAPNG(renderRGBA(doc.grid, canvasFor(doc.grid, scale, gap ?? 0))));
    return text({ path });
  });

  server.registerTool("export", {
    description: "Write the document to path as png, png8 (indexed), svg, dot.json or dot.txt (1 dot = 1 px).",
    inputSchema: { docId, format: z.enum(["png", "png8", "svg", "dot.json", "dot.txt"]), path: z.string().min(1) },
  }, ({ docId: id, format, path }) => {
    const { grid, keys } = getDoc(id);
    const canvas = canvasFor(grid, 1, 0);
    const data = format === "png" ? encodeRGBAPNG(renderRGBA(grid, canvas))
      : format === "png8" ? encodeIndexedPNG({ width: grid.width, height: grid.height, indices: grid.data, palette: grid.palette.colors })
      : format === "svg" ? toSVG(grid, canvas)
      : format === "dot.json" ? serializeDocument(gridToDocument(grid))
      : serializeDotText(grid, { keys });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    return text({ path });
  });

  for (const [name, forward] of [["undo", false], ["redo", true]] as const) {
    server.registerTool(name, {
      description: `${name} the last change.`,
      inputSchema: { docId },
    }, ({ docId: id }) => {
      const doc = getDoc(id);
      const change = (forward ? doc.redo : doc.undo).pop();
      if (change) {
        step(doc, change, forward);
        (forward ? doc.undo : doc.redo).push(change);
      }
      return text({ applied: change !== undefined, undo: doc.undo.length, redo: doc.redo.length });
    });
  }

  server.registerTool("outline", {
    description: "Add a 1-dot outline around opaque shapes (black = darkest or given key, selout = darker body hue).",
    inputSchema: { docId, mode: z.enum(["black", "selout"]).optional(), key: key.optional(), corners: z.boolean().optional() },
  }, ({ docId: id, mode, key: k, corners }) => {
    const doc = getDoc(id);
    const grid = addOutline(doc.grid, {
      mode: mode ?? "black",
      ...(k === undefined ? {} : { index: keyIndex(doc, k) }),
      ...(corners === undefined ? {} : { corners }),
    });
    return text({ changed: replace(doc, { grid, keys: doc.keys.slice() }, { type: "outline" }) });
  });

  server.registerTool("remove_orphans", {
    description: "Replace isolated single dots with their dominant neighbor color.",
    inputSchema: { docId, minContrast: z.number().optional(), iterations: z.number().int().min(1).optional() },
  }, ({ docId: id, minContrast, iterations }) => {
    const doc = getDoc(id);
    const { grid } = removeOrphans(doc.grid, {
      ...(minContrast === undefined ? {} : { minContrast }),
      ...(iterations === undefined ? {} : { iterations }),
    });
    return text({ changed: replace(doc, { grid, keys: doc.keys.slice() }, { type: "remove_orphans" }) });
  });

  return server;
}

/** Serves the MCP server over stdio; resolves when stdin closes. */
export async function runStdio(): Promise<void> {
  const server = createDotMcpServer();
  const closed = new Promise<void>((resolve) => {
    server.server.onclose = () => resolve();
    process.stdin.once("end", () => resolve());
  });
  await server.connect(new StdioServerTransport());
  await closed;
  await server.close();
}

import { cloneGrid, createGrid, createPalette } from "../core/grid.ts";
import { InputError, type DotGrid } from "../core/types.ts";

const KEY = /^[\x21-\x7e]$/;

function parseColor(value: string, line: number, col: number): number {
  if (value === "transparent") return 0;
  if (!/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/.test(value)) {
    throw new InputError(`line ${line}, col ${col}: expected color`);
  }
  return Number.parseInt(value.slice(1), 16) * (value.length === 7 ? 0x100 + 0xff : 1) >>> 0;
}

export function parseDotText(src: string): DotGrid {
  const lines = src.replace(/\r/g, "").split("\n");
  let width = 0, height = 0, mode = "";
  let gridRows: { text: string; line: number; rle: boolean }[] = [];
  const colors: number[] = [0];
  const names: (string | undefined)[] = [undefined];
  const keys = new Map<string, number>([[".", 0]]);
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n]!;
    const text = raw.trim();
    if (!text || text.startsWith(";")) continue;
    if (text.startsWith("@")) {
      if (text.startsWith("@size ")) {
        const m = /^@size\s+(\d+)x(\d+)$/.exec(text);
        if (!m) throw new InputError(`line ${n + 1}, col 1: expected @size WxH`);
        width = Number(m[1]); height = Number(m[2]); mode = "";
      } else if (text === "@palette") mode = "palette";
      else if (text === "@grid") mode = "grid";
      else if (text === "@rle") mode = "rle";
      else if (text.startsWith("@patch ")) {
        mode = `patch:${text.slice(7)}`;
      } else throw new InputError(`line ${n + 1}, col 1: unknown directive`);
      continue;
    }
    if (mode === "palette") {
      const m = /^(\S)\s+(\S+)(?:\s+(.+))?$/.exec(text);
      if (!m || !KEY.test(m[1]!) || m[1] === "." || m[1] === "@" || m[1] === "#")
        throw new InputError(`line ${n + 1}, col 1: expected palette entry`);
      if (keys.has(m[1]!)) throw new InputError(`line ${n + 1}, col 1: duplicate key ${m[1]}`);
      keys.set(m[1]!, colors.length);
      colors.push(parseColor(m[2]!, n + 1, raw.indexOf(m[2]!) + 1));
      names.push(m[3]);
    } else if (mode === "grid" || mode === "rle" || mode.startsWith("patch:")) {
      gridRows.push({ text, line: n + 1, rle: mode === "rle" });
    } else throw new InputError(`line ${n + 1}, col 1: unexpected content`);
  }
  if (!width || !height) throw new InputError("Missing @size");
  if (width > 4096 || height > 4096) throw new InputError("Grid dimensions must be integers from 1 to 4096");
  const grid = createGrid(width, height, createPalette(colors, names));
  const rows = gridRows.filter((r) => !r.text.startsWith("@patch"));
  if (rows.length !== height) throw new InputError(`expected ${height} rows, got ${rows.length}`);
  for (let y = 0; y < height; y++) {
    const row = rows[y]!;
    const expanded: string[] = [];
    if (row.rle) {
      const re = /(\d+)(.)/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(row.text))) for (let c = 0; c < Number(match[1]); c++) expanded.push(match[2]!);
      if (expanded.length === 0 || [...row.text.matchAll(/(?:\d+.)/g)].map((m) => m[0]).join("") !== row.text)
        throw new InputError(`line ${row.line}, col 1: invalid RLE`);
    } else expanded.push(...row.text);
    if (expanded.length !== width) throw new InputError(`line ${row.line}, col ${Math.min(expanded.length, width) + 1}: expected ${width} chars, got ${expanded.length}`);
    for (let x = 0; x < width; x++) {
      const index = keys.get(expanded[x]!);
      if (index === undefined) throw new InputError(`line ${row.line}, col ${x + 1}: unknown key ${expanded[x]}`);
      grid.data[y * width + x] = index;
    }
  }
  return grid;
}

export function serializeDotText(grid: DotGrid, opts: { rle?: boolean; keys?: string[] } = {}): string {
  const n = grid.palette.colors.length - 1;
  if (n > 91) throw new InputError("DotText supports at most 91 colors");
  const available = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$%&()*+,-./:;<=>?[]^_`{|}~"]
    .filter((k) => k !== ".");
  const keys = opts.keys ?? Array.from({ length: n }, (_, i) => {
    const name = grid.palette.names?.[i + 1];
    return name && KEY.test(name) && name !== "." ? name : available[i]!;
  });
  if (keys.length < n) throw new InputError("Not enough palette keys");
  const lines = [`@size ${grid.width}x${grid.height}`, "@palette"];
  for (let i = 1; i < grid.palette.colors.length; i++) {
    const color = grid.palette.colors[i]!.toString(16).padStart(8, "0");
    const hex = color.endsWith("ff") ? `#${color.slice(0, 6)}` : `#${color}`;
    lines.push(`${keys[i - 1]} ${hex}${grid.palette.names?.[i] ? ` ${grid.palette.names[i]}` : ""}`);
  }
  lines.push(opts.rle ? "@rle" : "@grid");
  for (let y = 0; y < grid.height; y++) {
    const row = Array.from(grid.data.subarray(y * grid.width, (y + 1) * grid.width),
      (i) => i === 0 ? "." : keys[i - 1] ?? ".");
    if (!opts.rle) lines.push(row.join(""));
    else {
      let out = "";
      for (let x = 0; x < row.length;) {
        let end = x + 1;
        while (end < row.length && row[end] === row[x]) end++;
        out += `${end - x}${row[x]}`;
        x = end;
      }
      lines.push(out);
    }
  }
  return lines.join("\n");
}

export function applyDotTextPatch(grid: DotGrid, src: string): DotGrid {
  const match = /^\s*@patch\s+(\d+),(\d+)\s*$/m.exec(src);
  if (!match) throw new InputError("Expected @patch x,y");
  const x0 = Number(match[1]), y0 = Number(match[2]);
  const body = src.slice(match.index + match[0].length).trim();
  const patch = parseDotText(`@size ${body.split(/\r?\n/).length}x1\n@palette\n@grid\n${body}`);
  const out = cloneGrid(grid);
  for (let y = 0; y < patch.height; y++) for (let x = 0; x < patch.width; x++) {
    const dx = x0 + x, dy = y0 + y;
    if (dx < grid.width && dy < grid.height) out.data[dy * grid.width + dx] = patch.data[y * patch.width + x]!;
  }
  return out;
}

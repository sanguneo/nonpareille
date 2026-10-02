import { pack, unpack, rgbToOklab, deltaE2 } from "../core/color.ts";
import type { DotGrid } from "../core/types.ts";

export interface MaterialColor { name: string; hex: string }
export function billOfMaterials(
  grid: DotGrid, opts: { board?: number; material?: MaterialColor[] } = {},
): { counts: { index: number; rgb: number; count: number }[]; total: number; boards: number } {
  const board = opts.board ?? 29, counts = new Map<number, number>();
  for (const index of grid.data) {
    if (index === 0) continue;
    const mapped = opts.material
      ? nearest(grid.palette.colors[index]!, opts.material)
      : grid.palette.colors[index]!;
    counts.set(mapped, (counts.get(mapped) ?? 0) + 1);
  }
  const rows = [...counts].map(([rgb, count]) => ({
    index: opts.material ? opts.material.findIndex((m) => parseHex(m.hex) === rgb) + 1 :
      [...grid.palette.colors].indexOf(rgb),
    rgb, count,
  })).sort((a, b) => a.index - b.index);
  return { counts: rows, total: rows.reduce((sum, row) => sum + row.count, 0),
    boards: Math.ceil(grid.width / board) * Math.ceil(grid.height / board) };
}

function parseHex(hex: string): number {
  const s = hex.replace(/^#/, "");
  return (Number.parseInt(s, 16) * (s.length === 6 ? 0x100 + 0xff : 1)) >>> 0;
}
function nearest(rgb: number, materials: MaterialColor[]): number {
  const [r, g, b] = unpack(rgb);
  const color = rgbToOklab(r, g, b);
  let best = 0, distance = Infinity;
  materials.forEach((material, i) => {
    const candidate = parseHex(material.hex), [cr, cg, cb] = unpack(candidate);
    const d = deltaE2(color, rgbToOklab(cr, cg, cb));
    if (d < distance) { best = i; distance = d; }
  });
  return materials.length ? parseHex(materials[best]!.hex) : pack(0, 0, 0, 255);
}

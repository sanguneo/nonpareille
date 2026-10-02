import { cloneGrid, createGrid } from "../core/grid.ts";
import { rgba32ToOklab, deltaE2 } from "../core/color.ts";
import { oklabToRgb8, pack } from "../core/color.ts";
import type { DotGrid } from "../core/types.ts";

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const N8 = [...N4, [-1, -1], [1, -1], [1, 1], [-1, 1]] as const;

export function innerBorder(grid: DotGrid): Uint8Array {
  const mask = new Uint8Array(grid.data.length);
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    const pos = y * grid.width + x;
    if (grid.data[pos] === 0) continue;
    if (N4.some(([dx, dy]) => x + dx < 0 || y + dy < 0 || x + dx >= grid.width ||
        y + dy >= grid.height || grid.data[(y + dy) * grid.width + x + dx] === 0)) mask[pos] = 1;
  }
  return mask;
}

export function addOutline(
  grid: DotGrid,
  opts: { mode: "black" | "selout"; index?: number; corners?: boolean; expand?: boolean },
): DotGrid {
  const expand = opts.expand ?? false;
  const result = expand ? createGrid(grid.width + 2, grid.height + 2, grid.palette) : cloneGrid(grid);
  if (expand) for (let y = 0; y < grid.height; y++)
    result.data.set(grid.data.subarray(y * grid.width, (y + 1) * grid.width), (y + 1) * result.width + 1);
  const original = new Uint16Array(result.data);
  let black = opts.index;
  if (opts.mode === "black" && black === undefined) {
    let lowest = Infinity;
    for (let i = 1; i < grid.palette.colors.length; i++) {
      const L = rgba32ToOklab(grid.palette.colors[i]!)[0];
      if (L < lowest) { lowest = L; black = i; }
    }
    black ??= 0;
  }
  const neighbors = opts.corners ? N8 : N4;
  for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++) {
    const pos = y * result.width + x;
    if (original[pos] !== 0) continue;
    const bodies: number[] = [];
    for (const [dx, dy] of neighbors) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < result.width && ny < result.height) {
        const index = original[ny * result.width + nx]!;
        if (index !== 0) bodies.push(index);
      }
    }
    if (bodies.length === 0) continue;
    if (opts.mode === "black") result.data[pos] = black!;
    else {
      const body = bodies[0]!, [L, a, b] = rgba32ToOklab(grid.palette.colors[body]!);
      const target = [L * 0.35, a * 0.8, b * 0.8];
      let closest = 0, distance = Infinity;
      for (let i = 1; i < grid.palette.colors.length; i++) {
        const d = deltaE2(rgba32ToOklab(grid.palette.colors[i]!), target);
        if (d < distance) { distance = d; closest = i; }
      }
      result.data[pos] = closest;
    }
  }
  return result;
}

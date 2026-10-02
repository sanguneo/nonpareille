import { cloneGrid } from "../core/grid.ts";
import { deltaE, rgba32ToOklab } from "../core/color.ts";
import type { DotGrid } from "../core/types.ts";

export function removeOrphans(
  grid: DotGrid,
  opts: { minContrast?: number; iterations?: number } = {},
): { grid: DotGrid; changed: number } {
  const result = cloneGrid(grid);
  let changed = 0;
  for (let iteration = 0; iteration < (opts.iterations ?? 2); iteration++) {
    const next = new Uint16Array(result.data);
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
      const pos = y * grid.width + x, value = result.data[pos]!;
      if (value === 0) continue;
      const counts = new Map<number, number>();
      let same = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
        const neighbor = result.data[ny * grid.width + nx]!;
        if (neighbor === value) same++;
        counts.set(neighbor, (counts.get(neighbor) ?? 0) + 1);
      }
      let mode = 0, modeCount = 0;
      for (const [index, count] of counts) if (count > modeCount) {
        mode = index;
        modeCount = count;
      }
      if (same === 0 && modeCount >= 5 &&
          !(opts.minContrast !== undefined &&
            deltaE(rgba32ToOklab(grid.palette.colors[value]!), rgba32ToOklab(grid.palette.colors[mode]!)) > opts.minContrast)) {
        next[pos] = mode;
      }
    }
    for (let i = 0; i < next.length; i++) if (next[i] !== result.data[i]) changed++;
    result.data.set(next);
  }
  return { grid: result, changed };
}

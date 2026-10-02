import { rgba32ToOklab } from "../core/color.ts";
import type { DotGrid } from "../core/types.ts";

export function toLumaRamp(grid: DotGrid, opts: { ramp?: string; invert?: boolean } = {}): string {
  const ramp = opts.ramp ?? " .:-=+*#%@";
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y += 2) {
    let row = "";
    for (let x = 0; x < grid.width; x++) {
      const top = grid.data[y * grid.width + x]!;
      const bottom = y + 1 < grid.height ? grid.data[(y + 1) * grid.width + x]! : 0;
      const lum = (index: number) => index === 0 ? 1 : rgba32ToOklab(grid.palette.colors[index]!)[0];
      const l = (lum(top) + lum(bottom)) / 2;
      const value = opts.invert ? 1 - l : l;
      row += ramp[Math.min(ramp.length - 1, Math.floor(value * ramp.length))]!;
    }
    rows.push(row);
  }
  return rows.join("\n");
}

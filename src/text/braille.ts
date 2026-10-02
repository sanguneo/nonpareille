import { rgba32ToOklab } from "../core/color.ts";
import type { DotGrid } from "../core/types.ts";

const bits = [[0, 3], [1, 4], [2, 5], [6, 7]] as const;

export function toBraille(grid: DotGrid, opts: { thresholdL?: number; foreground?: Set<number> } = {}): string {
  const threshold = opts.thresholdL ?? 0.5;
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y += 4) {
    let row = "";
    for (let x = 0; x < grid.width; x += 2) {
      let mask = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
        const px = x + dx, py = y + dy;
        if (px >= grid.width || py >= grid.height) continue;
        const index = grid.data[py * grid.width + px]!;
        if (index !== 0 && (opts.foreground
          ? opts.foreground.has(index)
          : rgba32ToOklab(grid.palette.colors[index]!)[0] < threshold)) {
          mask |= 1 << bits[dy]![dx]!;
        }
      }
      row += String.fromCodePoint(0x2800 + mask);
    }
    rows.push(row);
  }
  return rows.join("\n");
}

import { outputSize } from "../core/geometry.ts";
import type { CanvasSpec, DotGrid } from "../core/types.ts";

export function toSVG(grid: DotGrid, canvas: CanvasSpec): string {
  const colors = new Map<number, string[]>();
  for (let y = 0; y < grid.height; y++) {
    let x = 0;
    while (x < grid.width) {
      const index = grid.data[y * grid.width + x]!;
      if (index === 0) {
        x++;
        continue;
      }
      const color = grid.palette.colors[index]!;
      const start = x++;
      while (x < grid.width && grid.data[y * grid.width + x] === index) x++;
      const runs = colors.get(color) ?? [];
      runs.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
      colors.set(color, runs);
    }
  }
  const paths = [...colors]
    .map(([color, runs]) => {
      const hex = `#${(color >>> 8).toString(16).padStart(6, "0")}`;
      return `<path fill="${hex}" d="${runs.join("")}"/>`;
    })
    .join("");
  const { width, height } = outputSize(canvas);
  // SVG uses logical dot coordinates; gap and margin are intentionally omitted.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${grid.width} ${grid.height}" shape-rendering="crispEdges">${paths}</svg>`;
}

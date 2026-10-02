import type { DotGrid } from "../core/types.ts";

export type DrawOp =
  | { type: "set"; points: [number, number, number][] }
  | { type: "line"; x0: number; y0: number; x1: number; y1: number; idx: number }
  | { type: "rect"; x: number; y: number; w: number; h: number; idx: number; fill: boolean }
  | { type: "ellipse"; x: number; y: number; w: number; h: number; idx: number; fill: boolean }
  | { type: "fill"; x: number; y: number; idx: number }
  | { type: "mirror"; axis: "x" | "y"; half: "left" | "right" | "top" | "bottom" }
  | { type: "shift"; dx: number; dy: number; wrap: boolean };

export function bresenham(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = [];
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return points;
}

export function ellipseRect(x0: number, y0: number, x1: number, y1: number, fill: boolean): [number, number][] {
  let a = Math.abs(x1 - x0), b = Math.abs(y1 - y0), b1 = b & 1;
  const points: [number, number][] = [];
  const put = (x: number, y: number) => { points.push([x, y]); };
  let dx = 4 * (1 - a) * b * b, dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  if (x0 > x1) { [x0, x1] = [x1, x0]; }
  if (y0 > y1) { [y0, y1] = [y1, y0]; }
  y0 += Math.floor((b + 1) / 2); y1 = y0 - b1;
  a *= 8 * a; b1 = 8 * b * b;
  do {
    if (!fill || y0 === y1) {
      put(x1, y0); put(x0, y0); put(x0, y1); put(x1, y1);
    } else {
      for (let x = x0; x <= x1; x++) { put(x, y0); put(x, y1); }
    }
    const e2 = 2 * err;
    if (e2 <= dy) { y0++; y1--; dy += a; err += dy; }
    if (e2 >= dx || 2 * err > dy) { x0++; x1--; dx += b1; err += dx; }
  } while (x0 <= x1);
  while (y0 - y1 < b) {
    put(x0 - 1, y0); put(x1 + 1, y0++);
    put(x0 - 1, y1); put(x1 + 1, y1--);
  }
  return points;
}

export function floodFill(grid: DotGrid, x: number, y: number, idx: number): [number, number][] {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return [];
  const target = grid.data[y * grid.width + x]!;
  if (target === idx) return [];
  const stack: [number, number][] = [[x, y]], points: [number, number][] = [];
  while (stack.length) {
    const [sx, sy] = stack.pop()!;
    if (sx < 0 || sy < 0 || sx >= grid.width || sy >= grid.height || grid.data[sy * grid.width + sx] !== target) continue;
    let left = sx;
    while (left > 0 && grid.data[sy * grid.width + left - 1] === target) left--;
    let right = sx;
    while (right + 1 < grid.width && grid.data[sy * grid.width + right + 1] === target) right++;
    for (let i = left; i <= right; i++) { grid.data[sy * grid.width + i] = idx; points.push([i, sy]); }
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= grid.height) continue;
      for (let i = left; i <= right;) {
        while (i <= right && grid.data[ny * grid.width + i] !== target) i++;
        if (i <= right) { stack.push([i, ny]); while (i <= right && grid.data[ny * grid.width + i] === target) i++; }
      }
    }
  }
  return points;
}

export function applyOp(grid: DotGrid, op: DrawOp): { grid: DotGrid; changed: { i: number; j: number; from: number; to: number }[] } {
  const before = new Uint16Array(grid.data);
  const set = (i: number, j: number, v: number) => {
    if (i >= 0 && j >= 0 && i < grid.width && j < grid.height) grid.data[j * grid.width + i] = v;
  };
  if (op.type === "set") for (const [i, j, idx] of op.points) set(i, j, idx);
  else if (op.type === "line") for (const [i, j] of bresenham(op.x0, op.y0, op.x1, op.y1)) set(i, j, op.idx);
  else if (op.type === "rect") {
    const x1 = op.x + op.w - 1, y1 = op.y + op.h - 1;
    for (let j = op.y; j <= y1; j++) for (let i = op.x; i <= x1; i++)
      if (op.fill || i === op.x || i === x1 || j === op.y || j === y1) set(i, j, op.idx);
  } else if (op.type === "ellipse") {
    const pts = ellipseRect(op.x, op.y, op.x + op.w - 1, op.y + op.h - 1, op.fill);
    for (const [i, j] of pts) set(i, j, op.idx);
  } else if (op.type === "fill") floodFill(grid, op.x, op.y, op.idx);
  else if (op.type === "shift") {
    grid.data.fill(0);
    for (let j = 0; j < grid.height; j++) for (let i = 0; i < grid.width; i++) {
      let x = i + op.dx, y = j + op.dy;
      if (op.wrap) { x = (x % grid.width + grid.width) % grid.width; y = (y % grid.height + grid.height) % grid.height; }
      if (x >= 0 && y >= 0 && x < grid.width && y < grid.height) grid.data[y * grid.width + x] = before[j * grid.width + i]!;
    }
  } else {
    const vertical = op.axis === "x";
    for (let j = 0; j < grid.height; j++) for (let i = 0; i < grid.width; i++) {
      const coord = vertical ? i : j, size = vertical ? grid.width : grid.height;
      const requested = vertical ? op.half : op.half;
      const sourceSide = requested === "left" || requested === "top" ? coord < Math.ceil(size / 2) : coord >= Math.floor(size / 2);
      if (!sourceSide) {
        const si = vertical ? size - 1 - i : i, sj = vertical ? j : size - 1 - j;
        grid.data[j * grid.width + i] = before[sj * grid.width + si]!;
      }
    }
  }
  const changed = [];
  for (let k = 0; k < grid.data.length; k++) if (before[k] !== grid.data[k]) changed.push({ i: k % grid.width, j: Math.floor(k / grid.width), from: before[k]!, to: grid.data[k]! });
  return { grid, changed };
}

export function applyOps(grid: DotGrid, ops: DrawOp[]): DotGrid {
  for (const op of ops) applyOp(grid, op);
  return grid;
}

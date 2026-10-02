import { InputError, type DotGrid, type Frame, type Palette, type RGBA32 } from "./types.ts";

export function createPalette(colors: RGBA32[], names?: (string | undefined)[]): Palette {
  const hasTransparent = colors[0] === 0;
  const paletteColors = hasTransparent ? colors.slice() : [0, ...colors];
  const paletteNames = names === undefined
    ? undefined
    : hasTransparent ? names.slice() : [undefined, ...names];
  return paletteNames === undefined
    ? { colors: Uint32Array.from(paletteColors) }
    : { colors: Uint32Array.from(paletteColors), names: paletteNames };
}

export function createGrid(width: number, height: number, palette: Palette): DotGrid {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width > 4096 || height > 4096) {
    throw new InputError("Grid dimensions must be integers from 1 to 4096");
  }
  return { width, height, palette, data: new Uint16Array(width * height) };
}

export function cloneGrid(grid: DotGrid): DotGrid {
  return {
    width: grid.width,
    height: grid.height,
    palette: {
      ...grid.palette,
      colors: new Uint32Array(grid.palette.colors),
      ...(grid.palette.names === undefined ? {} : { names: grid.palette.names.slice() }),
      ...(grid.palette.locked === undefined ? {} : { locked: new Uint8Array(grid.palette.locked) }),
    },
    data: new Uint16Array(grid.data),
  };
}

export function getDot(grid: DotGrid, i: number, j: number): number {
  return grid.data[j * grid.width + i]!;
}

export function setDot(grid: DotGrid, i: number, j: number, index: number): void {
  grid.data[j * grid.width + i] = index;
}

export function gridEquals(a: DotGrid, b: DotGrid): boolean {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

export function diffGrids(a: DotGrid, b: DotGrid): { i: number; j: number; from: number; to: number }[] {
  const changes: { i: number; j: number; from: number; to: number }[] = [];
  if (a.width !== b.width || a.height !== b.height) return changes;
  for (let k = 0; k < a.data.length; k++) {
    if (a.data[k] !== b.data[k]) {
      changes.push({ i: k % a.width, j: Math.floor(k / a.width), from: a.data[k]!, to: b.data[k]! });
    }
  }
  return changes;
}

export function flatten(frame: Frame, width: number, height: number): Uint16Array {
  const data = new Uint16Array(width * height);
  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    for (let i = 0; i < data.length; i++) if (layer.data[i] !== 0) data[i] = layer.data[i]!;
  }
  return data;
}

export function usedIndices(grid: DotGrid): Set<number> {
  const used = new Set<number>();
  for (const index of grid.data) used.add(index);
  return used;
}

export function compactPalette(grid: DotGrid): DotGrid {
  const used = usedIndices(grid);
  used.add(0);
  const indices = [...used].sort((a, b) => a - b);
  const remap = new Map<number, number>();
  indices.forEach((oldIndex, newIndex) => remap.set(oldIndex, newIndex));
  const palette: Palette = {
    colors: Uint32Array.from(indices, (index) => grid.palette.colors[index]!),
    ...(grid.palette.names === undefined
      ? {}
      : { names: indices.map((index) => grid.palette.names![index]) }),
    ...(grid.palette.locked === undefined
      ? {}
      : { locked: Uint8Array.from(indices, (index) => grid.palette.locked![index]!) }),
  };
  return {
    width: grid.width,
    height: grid.height,
    palette,
    data: Uint16Array.from(grid.data, (index) => remap.get(index)!),
  };
}

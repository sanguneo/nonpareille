import { deltaE2, rgba32ToOklab, unpack } from "../core/color.ts";
import type { DotGrid } from "../core/types.ts";

type ColorMode = "truecolor" | "256";
const ESC = "\x1b[";
const cube = [0, 95, 135, 175, 215, 255];
const ansi256: number[][] = [];
for (const r of cube) for (const g of cube) for (const b of cube) ansi256.push([r, g, b]);
for (let i = 0; i < 24; i++) {
  const v = 8 + 10 * i;
  ansi256.push([v, v, v]);
}
const ansiLab = ansi256.map(([r, g, b]) => rgba32ToOklab(((r! << 24) | (g! << 16) | (b! << 8) | 255) >>> 0));

function colorCode(color: number, mode: ColorMode, foreground: boolean): string {
  const [r, g, b] = unpack(color);
  if (mode === "truecolor") return `${foreground ? 38 : 48};2;${r};${g};${b}`;
  const lab = rgba32ToOklab(color);
  let best = 0, distance = Infinity;
  for (let i = 0; i < ansiLab.length; i++) {
    const d = deltaE2(lab, ansiLab[i]!);
    if (d < distance) { distance = d; best = i; }
  }
  return `${foreground ? 38 : 48};5;${best}`;
}

export function toHalfBlock(grid: DotGrid, opts: { color?: ColorMode } = {}): string {
  const mode = opts.color ?? "truecolor";
  let output = "";
  let fg: string | undefined, bg: string | undefined;
  for (let y = 0; y < grid.height; y += 2) {
    fg = undefined; bg = undefined;
    for (let x = 0; x < grid.width; x++) {
      const ti = grid.data[y * grid.width + x]!;
      const bi = y + 1 < grid.height ? grid.data[(y + 1) * grid.width + x]! : 0;
      if (ti && bi) {
        const nextFg = colorCode(grid.palette.colors[ti]!, mode, true);
        const nextBg = colorCode(grid.palette.colors[bi]!, mode, false);
        if (fg !== nextFg) output += `${ESC}${nextFg}m`;
        if (bg !== nextBg) output += `${ESC}${nextBg}m`;
        fg = nextFg; bg = nextBg;
        output += "▀";
      } else if (ti) {
        const nextFg = colorCode(grid.palette.colors[ti]!, mode, true);
        if (fg !== nextFg) output += `${ESC}${nextFg}m`;
        if (bg !== "49") output += `${ESC}49m`;
        fg = nextFg; bg = "49";
        output += "▀";
      } else if (bi) {
        const nextFg = colorCode(grid.palette.colors[bi]!, mode, true);
        if (fg !== nextFg) output += `${ESC}${nextFg}m`;
        if (bg !== "49") output += `${ESC}49m`;
        fg = nextFg; bg = "49";
        output += "▄";
      } else {
        if (fg !== "0" || bg !== "0") output += `${ESC}0m`;
        fg = "0"; bg = "0";
        output += " ";
      }
    }
    output += `${ESC}0m`;
    if (y + 2 < grid.height) output += "\n";
  }
  return output;
}

import { describe, expect, test } from "bun:test";
import { getPixel } from "../src/core/image.ts";
import { renderRGBA } from "../src/core/render.ts";
import { toSVG } from "../src/io/svg.ts";
import type { CanvasSpec, DotGrid } from "../src/core/types.ts";

describe("render", () => {
  test("renders exact output dimensions and margin, gap, and dot colors", () => {
    const canvas: CanvasSpec = {
      width: 3,
      height: 2,
      dotW: 4,
      dotH: 4,
      gap: 1,
      gapColor: 0x112233ff,
      margin: 2,
      background: 0xaabbccff,
    };
    const grid: DotGrid = {
      width: 3,
      height: 2,
      palette: { colors: Uint32Array.of(0, 0xff0000ff, 0x00ff00ff) },
      data: Uint16Array.of(1, 0, 2, 2, 1, 0),
    };
    const image = renderRGBA(grid, canvas);
    expect([image.width, image.height]).toEqual([18, 13]);
    expect(getPixel(image, 0, 0)).toBe(canvas.background);
    expect(getPixel(image, 6, 3)).toBe(canvas.gapColor);
    expect(getPixel(image, 3, 3)).toBe(0xff0000ff);
    expect(getPixel(image, 8, 3)).toBe(canvas.background);
  });

  test("emits one SVG path per used opaque color", () => {
    const canvas: CanvasSpec = {
      width: 3, height: 2, dotW: 4, dotH: 4, gap: 1, gapColor: 0,
      margin: 2, background: 0,
    };
    const grid: DotGrid = {
      width: 3,
      height: 2,
      palette: { colors: Uint32Array.of(0, 0xff0000ff, 0x00ff00ff) },
      data: Uint16Array.of(1, 0, 2, 2, 1, 0),
    };
    const svg = toSVG(grid, canvas);
    expect((svg.match(/<path /g) ?? []).length).toBe(2);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('viewBox="0 0 3 2"');
    expect(svg).toContain('width="18" height="13"');
  });
});

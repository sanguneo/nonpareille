import { outputSize, pixelToDot } from "./geometry.ts";
import { createImage, setPixel } from "./image.ts";
import type { CanvasSpec, DotGrid, RGBA32, RGBAImage } from "./types.ts";

export function renderRGBA(grid: DotGrid, canvas: CanvasSpec): RGBAImage {
  const size = outputSize(canvas);
  const image = createImage(size.width, size.height);
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const pixel = pixelToDot(canvas, x, y);
      let color = canvas.background;
      if (pixel.kind === "gap") {
        color = canvas.gapColor;
      } else if (pixel.kind === "dot") {
        const index = grid.data[pixel.j * grid.width + pixel.i]!;
        color = index === 0 ? canvas.background : grid.palette.colors[index]!;
      }
      setPixel(image, x, y, color);
    }
  }
  return image;
}

import { useEffect, useRef, type PointerEvent } from "react";
import { renderRGBA } from "../../src/core/render.ts";
import type { DotGrid } from "../../src/core/types.ts";
import { cx } from "./cx.ts";

export interface PixelCanvasProps {
  grid: DotGrid;
  /** Integer screen pixels per dot. */
  scale: number;
  /** Show a cream/crumb checkerboard behind transparent dots (default true). */
  checker?: boolean;
  /** Called on pointerdown / pointermove / pointerup with the dot under the pointer. */
  onPointer?: (i: number, j: number, event: PointerEvent<HTMLCanvasElement>) => void;
  className?: string;
  "aria-label"?: string;
}

/**
 * Draws a DotGrid with the engine renderer (renderRGBA at 1:1) and scales it with
 * nearest-neighbour sampling, so every dot is an exact `scale`-pixel square.
 */
export function PixelCanvas({ grid, scale, checker = true, onPointer, className, "aria-label": ariaLabel }: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const step = Math.max(1, Math.floor(scale));
  const width = grid.width * step;
  const height = grid.height * step;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const offscreen = (offscreenRef.current ??= document.createElement("canvas"));
    offscreen.width = grid.width;
    offscreen.height = grid.height;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const image = renderRGBA(grid, {
      width: grid.width, height: grid.height, dotW: 1, dotH: 1, gap: 0, gapColor: 0, margin: 0, background: 0,
    });
    const pixels = offCtx.createImageData(grid.width, grid.height);
    pixels.data.set(image.data);
    offCtx.putImageData(pixels, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, width, height);
  }, [grid, grid.data, grid.palette, step, width, height]);

  const handlePointer = onPointer
    ? (event: PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const i = Math.floor(((event.clientX - rect.left) / rect.width) * grid.width);
        const j = Math.floor(((event.clientY - rect.top) / rect.height) * grid.height);
        if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return;
        onPointer(i, j, event);
      }
    : undefined;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel ?? `${grid.width}x${grid.height} 도트 캔버스`}
      className={cx("pixel_canvas", checker && "pixel_canvas_checker", onPointer && "pixel_canvas_interactive", className)}
      style={checker ? { backgroundSize: `${step * 2}px ${step * 2}px` } : undefined}
      onPointerDown={handlePointer}
      onPointerMove={handlePointer}
      onPointerUp={handlePointer}
    />
  );
}

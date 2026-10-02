import type { ReactNode } from "react";
import { bresenham, type DrawOp } from "../../../src/draw/primitives.ts";
import { pixelPerfect } from "../../../src/draw/stroke.ts";

export type Tool = "pencil" | "line" | "rect" | "ellipse" | "fill" | "eraser" | "eyedropper";

export type Cell = [number, number];

export interface ToolDef {
  id: Tool;
  label: string;
  icon: ReactNode;
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const Icon = ({ children }: { children: ReactNode }) => <svg {...svgProps}>{children}</svg>;

export const TOOLS: readonly ToolDef[] = [
  {
    id: "pencil",
    label: "연필",
    icon: (
      <Icon>
        <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
        <path d="m13.5 6.5 3 3" />
      </Icon>
    ),
  },
  {
    id: "line",
    label: "직선",
    icon: (
      <Icon>
        <path d="M6 18 18 6" />
        <circle cx="5.5" cy="18.5" r="1.5" />
        <circle cx="18.5" cy="5.5" r="1.5" />
      </Icon>
    ),
  },
  {
    id: "rect",
    label: "사각형",
    icon: (
      <Icon>
        <rect x="4" y="5" width="16" height="14" rx="1.5" />
      </Icon>
    ),
  },
  {
    id: "ellipse",
    label: "타원",
    icon: (
      <Icon>
        <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
      </Icon>
    ),
  },
  {
    id: "fill",
    label: "채우기",
    icon: (
      <Icon>
        <path d="m7.5 10.5 6-6 7 7-6 6a2.8 2.8 0 0 1-4 0l-3-3a2.8 2.8 0 0 1 0-4Z" />
        <path d="M5 12.5h11" />
        <path d="M20 15.5s-1.5 1.9-1.5 3.1a1.5 1.5 0 0 0 3 0c0-1.2-1.5-3.1-1.5-3.1Z" />
      </Icon>
    ),
  },
  {
    id: "eraser",
    label: "지우개",
    icon: (
      <Icon>
        <path d="M9 20h11" />
        <path d="m5.5 14.5 8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11.6 18.4a2 2 0 0 1-2.8 0l-3.3-3.3a2 2 0 0 1 0-.6Z" />
        <path d="m10 10 5 5" />
      </Icon>
    ),
  },
  {
    id: "eyedropper",
    label: "스포이트",
    icon: (
      <Icon>
        <path d="m4 20 1-4 9-9 3 3-9 9-4 1Z" />
        <path d="m13 6 2-2a2.1 2.1 0 0 1 3 3l-2 2" />
      </Icon>
    ),
  },
];

export const MirrorIcon = () => (
  <Icon>
    <path d="M12 3v18" strokeDasharray="2 3" />
    <path d="M8 8 4 12l4 4" />
    <path d="m16 8 4 4-4 4" />
  </Icon>
);

export const FilledShapeIcon = () => (
  <Icon>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 12h16v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Icon>
);

export interface GestureOptions {
  tool: Tool;
  /** Palette index to paint with (ignored by the eraser, which paints 0). */
  index: number;
  mirrorX: boolean;
  /** Filled interior for rect / ellipse. */
  fill: boolean;
  width: number;
}

/** Whether the tool follows the pointer (otherwise it is a two-point gesture or a click). */
export const isFreehand = (tool: Tool): boolean => tool === "pencil" || tool === "eraser";

/**
 * Extends a freehand path to `next`, interpolating cells skipped by fast pointer
 * moves with Bresenham so the stroke stays 8-connected. Returns false when the
 * pointer is still on the last cell.
 */
export function extendPath(path: Cell[], next: Cell): boolean {
  const last = path[path.length - 1];
  if (!last) {
    path.push(next);
    return true;
  }
  if (last[0] === next[0] && last[1] === next[1]) return false;
  const segment = bresenham(last[0], last[1], next[0], next[1]);
  for (let k = 1; k < segment.length; k++) path.push(segment[k]!);
  return true;
}

/**
 * Draw ops for the current gesture (plan section 5.8). Freehand strokes go through
 * the pixel-perfect filter; with mirrorX every op is repeated at x' = W - 1 - x.
 */
export function gestureOps(options: GestureOptions, path: readonly Cell[]): DrawOp[] {
  const start = path[0];
  const end = path[path.length - 1];
  if (!start || !end) return [];
  const idx = options.tool === "eraser" ? 0 : options.index;
  const mirror = (x: number) => options.width - 1 - x;

  switch (options.tool) {
    case "pencil":
    case "eraser": {
      const stroke = pixelPerfect([...path]);
      const points: [number, number, number][] = stroke.map(([x, y]) => [x, y, idx]);
      if (options.mirrorX) for (const [x, y] of stroke) points.push([mirror(x), y, idx]);
      return [{ type: "set", points }];
    }
    case "line": {
      const op = { type: "line" as const, x0: start[0], y0: start[1], x1: end[0], y1: end[1], idx };
      return options.mirrorX ? [op, { ...op, x0: mirror(start[0]), x1: mirror(end[0]) }] : [op];
    }
    case "rect":
    case "ellipse": {
      const x = Math.min(start[0], end[0]);
      const y = Math.min(start[1], end[1]);
      const w = Math.abs(end[0] - start[0]) + 1;
      const h = Math.abs(end[1] - start[1]) + 1;
      const op = { type: options.tool, x, y, w, h, idx, fill: options.fill };
      return options.mirrorX ? [op, { ...op, x: options.width - x - w }] : [op];
    }
    case "fill": {
      const op = { type: "fill" as const, x: start[0], y: start[1], idx };
      return options.mirrorX ? [op, { ...op, x: mirror(start[0]) }] : [op];
    }
    case "eyedropper":
      return [];
  }
}

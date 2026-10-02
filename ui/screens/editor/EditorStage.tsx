import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { cloneGrid, diffGrids } from "../../../src/core/grid.ts";
import type { DotGrid } from "../../../src/core/types.ts";
import { applyOps } from "../../../src/draw/primitives.ts";
import { Button, PixelCanvas, cx } from "../../components/index.ts";
import type { DotChange } from "./store.ts";
import { type Cell, extendPath, gestureOps, isFreehand, type Tool } from "./tools.tsx";

export type Zoom = "fit" | number;
export const ZOOM_STEPS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32] as const;
/** Keeps the on-screen canvas element within a size every browser can allocate. */
const MAX_CANVAS_PX = 8192;
/** Grid lines are only legible from this many screen pixels per dot. */
const MIN_GRID_STEP = 4;

export interface EditorStageProps {
  grid: DotGrid;
  tool: Tool;
  index: number;
  mirrorX: boolean;
  fill: boolean;
  zoom: Zoom;
  onZoomChange: (zoom: Zoom) => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  /** A finished gesture; `changes` is the diff against the grid the gesture started on. */
  onCommit: (changes: DotChange[]) => void;
  /** Eyedropper picked a palette index. */
  onPick: (index: number) => void;
}

interface Drag {
  pointerId: number;
  base: DotGrid;
  scratch: DotGrid;
  path: Cell[];
}

/**
 * Canvas region of the editor: zoom bar, scrolling viewport, the PixelCanvas with
 * grid-line and cursor overlays, and pointer gestures. While a gesture is in
 * progress the stage shows a scratch copy of the grid with the pending op applied;
 * on release it reports the diff so the owner can commit it to history.
 */
export function EditorStage({
  grid,
  tool,
  index,
  mirrorX,
  fill,
  zoom,
  onZoomChange,
  showGrid,
  onShowGridChange,
  onCommit,
  onPick,
}: EditorStageProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [preview, setPreview] = useState<DotGrid | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setViewport({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const maxStep = Math.max(1, Math.floor(MAX_CANVAS_PX / Math.max(grid.width, grid.height)));
  const fitStep = viewport
    ? Math.max(1, Math.floor(Math.min(viewport.width / grid.width, viewport.height / grid.height)))
    : 1;
  const step = Math.min(maxStep, zoom === "fit" ? fitStep : zoom);
  const display = preview ?? grid;
  const empty = useMemo(() => !display.data.some((value) => value !== 0), [display]);

  const zoomTo = (next: number | undefined) => {
    if (next !== undefined && next !== step) onZoomChange(next);
  };
  const zoomIn = () => zoomTo(ZOOM_STEPS.find((candidate) => candidate > step));
  const zoomOut = () => zoomTo([...ZOOM_STEPS].reverse().find((candidate) => candidate < step));

  const cellAt = (event: ReactPointerEvent<HTMLDivElement>, clamp: boolean): Cell | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    let i = Math.floor(((event.clientX - rect.left) / rect.width) * grid.width);
    let j = Math.floor(((event.clientY - rect.top) / rect.height) * grid.height);
    if (clamp) {
      i = Math.min(grid.width - 1, Math.max(0, i));
      j = Math.min(grid.height - 1, Math.max(0, j));
    } else if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) {
      return null;
    }
    return [i, j];
  };

  const options = { tool, index, mirrorX, fill, width: grid.width };

  const renderDrag = (drag: Drag) => {
    drag.scratch.data.set(drag.base.data);
    applyOps(drag.scratch, gestureOps(options, drag.path));
    setPreview({ ...drag.scratch });
  };

  const trackHover = (cell: Cell | null) => {
    setHover((previous) => (previous && cell && previous[0] === cell[0] && previous[1] === cell[1] ? previous : cell));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const cell = cellAt(event, false);
    if (!cell) return;
    if (tool === "eyedropper") {
      onPick(grid.data[cell[1] * grid.width + cell[0]]!);
      return;
    }
    if (tool === "fill") {
      const scratch = cloneGrid(grid);
      applyOps(scratch, gestureOps(options, [cell]));
      onCommit(diffGrids(grid, scratch));
      return;
    }
    const drag: Drag = { pointerId: event.pointerId, base: grid, scratch: cloneGrid(grid), path: [cell] };
    dragRef.current = drag;
    event.currentTarget.setPointerCapture(event.pointerId);
    renderDrag(drag);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const cell = cellAt(event, drag !== null);
    trackHover(cell);
    if (!drag || !cell || drag.pointerId !== event.pointerId) return;
    if (isFreehand(tool)) {
      if (!extendPath(drag.path, cell)) return;
    } else {
      const end = drag.path[drag.path.length - 1];
      if (drag.path.length > 1 && end && end[0] === cell[0] && end[1] === cell[1]) return;
      drag.path = [drag.path[0]!, cell];
    }
    renderDrag(drag);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (commit) onCommit(diffGrids(drag.base, drag.scratch));
    setPreview(null);
  };

  const canvasSize = { inlineSize: `${grid.width * step}px`, blockSize: `${grid.height * step}px` };

  return (
    <div className="editor_stage">
      <div className="editor_stage_bar wrap_row">
        <div className="editor_zoom" role="group" aria-label="배율">
          <Button variant="ghost" size="sm" aria-label="축소" title="축소" onClick={zoomOut} disabled={step <= 1}>
            −
          </Button>
          <select
            className="input editor_select"
            aria-label="배율 선택"
            value={zoom === "fit" ? "fit" : String(zoom)}
            onChange={(event) => onZoomChange(event.target.value === "fit" ? "fit" : Number(event.target.value))}
          >
            <option value="fit">맞춤 (×{fitStep})</option>
            {ZOOM_STEPS.map((candidate) => (
              <option key={candidate} value={candidate} disabled={candidate > maxStep}>
                ×{candidate}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" aria-label="확대" title="확대" onClick={zoomIn} disabled={step >= Math.min(maxStep, ZOOM_STEPS[ZOOM_STEPS.length - 1]!)}>
            +
          </Button>
        </div>
        <label className="editor_toggle">
          <input type="checkbox" checked={showGrid} onChange={(event) => onShowGridChange(event.target.checked)} />
          격자
        </label>
        <span className="editor_stage_meta" aria-live="polite">
          {grid.width} × {grid.height} 도트 · ×{step}
        </span>
      </div>

      <div className="editor_stage_frame">
        <div className="editor_viewport" ref={viewportRef} role="region" aria-label="캔버스 보기 영역" tabIndex={0}>
          <div className="editor_viewport_inner">
            <div
              className={cx("editor_canvas_wrap", tool === "eyedropper" && "editor_canvas_wrap_pick")}
              style={canvasSize}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => finishDrag(event, true)}
              onPointerCancel={(event) => finishDrag(event, false)}
              onPointerLeave={() => trackHover(null)}
            >
              <PixelCanvas grid={display} scale={step} aria-label={`${grid.width}x${grid.height} 편집 캔버스`} />
              {showGrid && step >= MIN_GRID_STEP ? (
                <div className="editor_gridlines" style={{ backgroundSize: `${step}px ${step}px` }} aria-hidden="true" />
              ) : null}
              {hover ? (
                <div
                  className="editor_cursor"
                  style={{
                    inlineSize: `${step}px`,
                    blockSize: `${step}px`,
                    insetInlineStart: `${hover[0] * step}px`,
                    insetBlockStart: `${hover[1] * step}px`,
                  }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          </div>
        </div>
        {empty ? (
          <p className="editor_hint" role="note">
            <span>빈 캔버스예요. 팔레트에서 색을 고르고 점을 찍어 보세요.</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import "../styles/editor.css";
import type { RGBA32 } from "../../src/core/types.ts";
import { createDoc, listPalettes, type PalettePreset, updateDoc } from "../api.ts";
import { Button, Card, Field, Pill, cx, showToast } from "../components/index.ts";
import { EditorStage, type Zoom } from "./editor/EditorStage.tsx";
import { copyDotText, exportPNG, exportSVG, exportScalesFor } from "./editor/exporters.ts";
import { PalettePanel, hexOf } from "./editor/PalettePanel.tsx";
import { SizeDialog } from "./editor/SizeDialog.tsx";
import {
  addColor,
  applyPreset,
  commitChanges,
  currentDocument,
  markSaved,
  newCanvas,
  redo,
  rename,
  undo,
  useEditor,
} from "./editor/store.ts";
import { FilledShapeIcon, MirrorIcon, RedoIcon, TOOLS, type Tool, UndoIcon } from "./editor/tools.tsx";

const DEFAULT_NAME = "새 그림";
const DEFAULT_EXPORT_SCALE = 8;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo, except while typing in a form control. */
function useUndoShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.closest("input, textarea, select, dialog") || target.isContentEditable)) return;
      if (event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.code === "KeyY") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

export default function Editor() {
  const editor = useEditor();
  const { grid } = editor;
  const [tool, setTool] = useState<Tool>("pencil");
  const [mirrorX, setMirrorX] = useState(false);
  const [fill, setFill] = useState(false);
  const [primary, setPrimary] = useState(1);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [showGrid, setShowGrid] = useState(true);
  const [exportScale, setExportScale] = useState(DEFAULT_EXPORT_SCALE);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState<PalettePreset[] | null>(null);
  const [presetsFailed, setPresetsFailed] = useState(false);

  useUndoShortcuts();

  useEffect(() => {
    let alive = true;
    listPalettes().then(
      (list) => alive && setPresets(list),
      () => alive && setPresetsFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const colorCount = grid.palette.colors.length;
  const index = Math.min(primary, colorCount - 1);
  const shapeTool = tool === "rect" || tool === "ellipse";
  const exportScales = exportScalesFor(grid);
  const scale = exportScales.includes(exportScale) ? exportScale : (exportScales[exportScales.length - 1] ?? 1);
  const displayName = editor.name.trim() || DEFAULT_NAME;

  const run = (action: () => void | Promise<void>) => {
    Promise.resolve()
      .then(action)
      .catch((error: unknown) => showToast(errorMessage(error), "danger"));
  };

  const onAddColor = (color: RGBA32) => {
    const added = addColor(color);
    if (added === null) {
      showToast("팔레트가 가득 찼어요 (최대 255색).", "danger");
      return;
    }
    setPrimary(added);
  };

  const save = () =>
    run(async () => {
      if (saving) return;
      setSaving(true);
      try {
        const doc = currentDocument();
        const { id } = editor.meta.id ? await updateDoc(editor.meta.id, doc, displayName) : await createDoc(doc, displayName);
        markSaved(id, displayName);
        showToast(`갤러리에 저장했어요: ${displayName}`, "ok");
      } finally {
        setSaving(false);
      }
    });

  const copyText = () =>
    run(async () => {
      const result = await copyDotText(grid, displayName);
      showToast(result === "copied" ? "DotText를 클립보드에 복사했어요." : "클립보드를 쓸 수 없어 .dot.txt 파일로 내려받았어요.", "ok");
    });

  return (
    <section className="screen editor" aria-labelledby="editor-title">
      <header className="editor_bar">
        <div className="editor_bar_primary screen_head">
          <h1 id="editor-title" className="screen_title">
            에디터
          </h1>
          <p className="screen_lede">점을 하나씩 찍고 다듬어 도트 그림을 완성합니다.</p>
        </div>
        <div className="editor_bar_secondary wrap_row">
          <div className="cluster" role="group" aria-label="실행 취소">
            <Button variant="ghost" size="sm" onClick={undo} disabled={!editor.canUndo} title="실행 취소 (Ctrl+Z)">
              <UndoIcon /> 실행 취소
            </Button>
            <Button variant="ghost" size="sm" onClick={redo} disabled={!editor.canRedo} title="다시 실행 (Ctrl+Shift+Z)">
              <RedoIcon /> 다시 실행
            </Button>
          </div>
          <div className="cluster" role="group" aria-label="내보내기">
            <select
              className="input editor_select"
              aria-label="PNG·SVG 배율"
              value={scale}
              onChange={(event) => setExportScale(Number(event.target.value))}
            >
              {exportScales.map((candidate) => (
                <option key={candidate} value={candidate}>
                  ×{candidate} · {grid.width * candidate}px
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={() => run(() => exportPNG(grid, scale, displayName))}>
              PNG 저장
            </Button>
            <Button variant="ghost" size="sm" onClick={() => run(() => exportSVG(grid, scale, displayName))}>
              SVG 저장
            </Button>
            <Button variant="ghost" size="sm" onClick={copyText}>
              DotText 복사
            </Button>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "저장 중…" : editor.meta.id ? "갤러리에 덮어쓰기" : "갤러리에 저장"}
          </Button>
        </div>
      </header>

      <div className="editor_workspace">
        <div className="editor_rail" role="group" aria-label="그리기 도구">
          <div className="editor_rail_group" role="group" aria-label="도구">
            {TOOLS.map((def) => (
              <button
                key={def.id}
                type="button"
                className="editor_tool"
                aria-pressed={tool === def.id}
                title={def.label}
                onClick={() => setTool(def.id)}
              >
                {def.icon}
                <span className="editor_tool_label">{def.label}</span>
              </button>
            ))}
          </div>
          <div className="editor_rail_group" role="group" aria-label="도구 옵션">
            <button
              type="button"
              className="editor_tool"
              aria-pressed={mirrorX}
              title="좌우 대칭: 반대쪽에도 똑같이 그립니다"
              onClick={() => setMirrorX((value) => !value)}
            >
              <MirrorIcon />
              <span className="editor_tool_label">좌우 대칭</span>
            </button>
            <button
              type="button"
              className={cx("editor_tool", !shapeTool && "editor_tool_idle")}
              aria-pressed={fill}
              title="속 채움: 사각형·타원의 안쪽을 채웁니다"
              onClick={() => setFill((value) => !value)}
            >
              <FilledShapeIcon />
              <span className="editor_tool_label">속 채움</span>
            </button>
          </div>
        </div>

        <EditorStage
          grid={grid}
          tool={tool}
          index={index}
          mirrorX={mirrorX}
          fill={fill}
          zoom={zoom}
          onZoomChange={setZoom}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          onCommit={commitChanges}
          onPick={setPrimary}
        />

        <aside className="editor_panel" aria-label="팔레트와 문서 설정">
          <Card
            tight
            title="팔레트"
            description={`${colorCount - 1}색 · 선택: ${index === 0 ? "투명" : hexOf(grid.palette.colors[index] ?? 0)}`}
          >
            <PalettePanel
              palette={grid.palette}
              index={index}
              onSelect={setPrimary}
              onAdd={onAddColor}
              presets={presets}
              presetsFailed={presetsFailed}
              onPreset={applyPreset}
            />
          </Card>

          <Card
            tight
            title="캔버스"
            actions={
              <Button variant="ghost" size="sm" onClick={() => setSizeOpen(true)}>
                새 캔버스…
              </Button>
            }
          >
            <p className="editor_meta">
              <strong>
                {grid.width} × {grid.height}
              </strong>{" "}
              도트 · 내보내기 ×{scale} = {grid.width * scale} × {grid.height * scale}px
            </p>
          </Card>

          <Card tight title="문서">
            <Field label="이름" hint={editor.meta.id ? `갤러리 문서 ${editor.meta.id}` : "아직 갤러리에 저장하지 않았어요."}>
              <input
                type="text"
                value={editor.name}
                placeholder={DEFAULT_NAME}
                maxLength={80}
                autoComplete="off"
                onChange={(event) => rename(event.target.value)}
              />
            </Field>
            <div className="cluster">
              {editor.dirty ? (
                <Pill tone="accent" dot>
                  저장되지 않은 변경
                </Pill>
              ) : editor.meta.id ? (
                <Pill tone="ok" dot>
                  갤러리와 같음
                </Pill>
              ) : (
                <Pill tone="outline" dot>
                  새 문서
                </Pill>
              )}
            </div>
          </Card>
        </aside>
      </div>

      {sizeOpen ? (
        <SizeDialog
          width={grid.width}
          height={grid.height}
          onClose={() => setSizeOpen(false)}
          onCreate={(width, height) => {
            newCanvas(width, height);
            setSizeOpen(false);
            showToast(`${width} × ${height} 새 캔버스를 만들었어요.`, "ok");
          }}
        />
      ) : null}
    </section>
  );
}

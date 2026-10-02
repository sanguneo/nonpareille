import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { DotDocument } from "../../../src/core/types.ts";
import { documentToGrid } from "../../../src/io/project.ts";
import { deleteDoc, getDoc, updateDoc, type DocSummary } from "../../api.ts";
import { Button, Field, Pill, PixelCanvas, cx, showToast } from "../../components/index.ts";
import { openInEditor } from "../../state.ts";
import {
  documentToPng, downloadBlob, errorMessage, formatAbsoluteTime, formatRelativeTime, safeFileName,
  useContentWidth, type Loadable,
} from "./shared.ts";

export interface DetailPanelProps {
  summary: DocSummary;
  /** Render as a bottom-sheet dialog (focus moves to the heading; Escape closes). */
  mobile: boolean;
  onClose: () => void;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
}

/** Selected-document pane of the list-detail layout: large preview plus open / rename / export / delete. */
export function DetailPanel({ summary, mobile, onClose, onRenamed, onDeleted }: DetailPanelProps) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [previewRef, previewWidth] = useContentWidth<HTMLDivElement>();
  const [doc, setDoc] = useState<Loadable<DotDocument>>({ status: "loading" });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(summary.name);
  const [busy, setBusy] = useState<"rename" | "delete" | null>(null);

  useEffect(() => {
    let alive = true;
    getDoc(summary.id).then(
      (value) => alive && setDoc({ status: "ready", value }),
      (error: unknown) => alive && setDoc({ status: "error", message: errorMessage(error) }),
    );
    return () => {
      alive = false;
    };
  }, [summary.id]);

  useEffect(() => {
    if (mobile) headingRef.current?.focus();
  }, [mobile, summary.id]);

  const grid = useMemo(() => (doc.status === "ready" ? documentToGrid(doc.value) : null), [doc]);
  const scale = grid ? Math.max(1, Math.floor(previewWidth / Math.max(grid.width, grid.height))) : 1;
  const ready = doc.status === "ready";

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  const open = () => {
    if (doc.status !== "ready") return;
    openInEditor(doc.value, { id: summary.id, name: summary.name });
  };

  const exportPng = async () => {
    if (doc.status !== "ready") return;
    try {
      downloadBlob(await documentToPng(doc.value), `${safeFileName(summary.name)}.png`);
      showToast("PNG로 내보냈어요", "ok");
    } catch (error) {
      showToast(`내보내지 못했어요: ${errorMessage(error)}`, "danger");
    }
  };

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.trim();
    if (!name || doc.status !== "ready") return;
    setBusy("rename");
    try {
      await updateDoc(summary.id, doc.value, name);
      setRenaming(false);
      onRenamed(name);
      showToast("이름을 바꿨어요", "ok");
    } catch (error) {
      showToast(`이름을 바꾸지 못했어요: ${errorMessage(error)}`, "danger");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`"${summary.name}" 작품을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusy("delete");
    try {
      await deleteDoc(summary.id);
      showToast("삭제했어요", "ok");
      onDeleted();
    } catch (error) {
      showToast(`삭제하지 못했어요: ${errorMessage(error)}`, "danger");
      setBusy(null);
    }
  };

  return (
    <aside
      className={cx("card detail_panel", mobile && "detail_sheet")}
      role={mobile ? "dialog" : undefined}
      aria-modal={mobile ? true : undefined}
      aria-labelledby={titleId}
      onKeyDown={mobile ? onKeyDown : undefined}
    >
      <div className="detail_head">
        <div className="detail_head_text">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="detail_title">
            {summary.name}
          </h2>
          <p className="detail_meta">
            <Pill>
              {summary.width} × {summary.height}
            </Pill>
            <time dateTime={summary.updatedAt} title={formatAbsoluteTime(summary.updatedAt)}>
              {formatRelativeTime(summary.updatedAt)} 수정
            </time>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {mobile ? "닫기" : "선택 해제"}
        </Button>
      </div>

      <div className="detail_preview" ref={previewRef}>
        {grid && previewWidth > 0 ? (
          <PixelCanvas grid={grid} scale={scale} aria-label={`${summary.name} 미리보기, ${grid.width}x${grid.height} 도트`} />
        ) : doc.status === "error" ? (
          <p className="detail_preview_note detail_preview_note_error" role="alert">
            문서를 불러오지 못했어요: {doc.message}
          </p>
        ) : (
          <p className="detail_preview_note" role="status">
            불러오는 중…
          </p>
        )}
      </div>

      {renaming ? (
        <form className="detail_rename" onSubmit={submitRename}>
          <Field label="새 이름">
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} required autoFocus />
          </Field>
          <div className="cluster">
            <Button type="submit" size="sm" disabled={busy !== null || !draft.trim()}>
              저장
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRenaming(false)} disabled={busy === "rename"}>
              취소
            </Button>
          </div>
        </form>
      ) : null}

      <div className="detail_actions">
        <Button block disabled={!ready} onClick={open}>
          에디터에서 열기
        </Button>
        <div className="cluster">
          <Button variant="ghost" size="sm" disabled={!ready || renaming} onClick={() => setRenaming(true)}>
            이름 바꾸기
          </Button>
          <Button variant="ghost" size="sm" disabled={!ready} onClick={exportPng}>
            PNG 내보내기
          </Button>
          <Button variant="ghost" size="sm" className="btn_danger" disabled={busy !== null} onClick={remove}>
            삭제
          </Button>
        </div>
      </div>
    </aside>
  );
}

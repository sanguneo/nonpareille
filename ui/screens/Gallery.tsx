import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { listDocs, thumbUrl, type DocSummary } from "../api.ts";
import { Button, EmptyState, Pill } from "../components/index.ts";
import "../styles/gallery.css";
import { DetailPanel } from "./gallery/DetailPanel.tsx";
import { ProcgenStrip } from "./gallery/ProcgenStrip.tsx";
import {
  MOBILE_QUERY, errorMessage, formatAbsoluteTime, formatRelativeTime, thumbDotSize, useMediaQuery, type Loadable,
} from "./gallery/shared.ts";

const SKELETON_COUNT = 8;

interface DocCardProps {
  doc: DocSummary;
  selected: boolean;
  now: number;
  onSelect: (id: string) => void;
}

function DocCard({ doc, selected, now, onSelect }: DocCardProps) {
  const checker = thumbDotSize(doc.width) * 2;
  return (
    <button type="button" className="doc_card" aria-pressed={selected} data-doc-id={doc.id} onClick={() => onSelect(doc.id)}>
      <span className="doc_thumb_box" style={{ backgroundSize: `${checker}px ${checker}px` }}>
        <img className="doc_thumb" src={thumbUrl(doc.id, doc.updatedAt)} alt="" loading="lazy" decoding="async" />
      </span>
      <span className="doc_card_name">{doc.name}</span>
      <span className="doc_card_meta">
        <span>
          {doc.width} × {doc.height}
        </span>
        <time dateTime={doc.updatedAt} title={formatAbsoluteTime(doc.updatedAt)}>
          {formatRelativeTime(doc.updatedAt, now)}
        </time>
      </span>
    </button>
  );
}

function SkeletonGrid() {
  return (
    <ul className="doc_grid" aria-label="저장한 작품 목록" aria-busy="true">
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <li key={index} className="doc_skeleton" aria-hidden="true">
          <span className="doc_skeleton_thumb" />
          <span className="doc_skeleton_line" />
          <span className="doc_skeleton_line doc_skeleton_line_short" />
        </li>
      ))}
    </ul>
  );
}

/** Saved documents (list-detail recipe): card grid, selected-document pane, and a procedural-generation strip. */
export default function Gallery() {
  const [docs, setDocs] = useState<Loadable<DocSummary[]>>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listTitleRef = useRef<HTMLHeadingElement>(null);
  const mobile = useMediaQuery(MOBILE_QUERY);

  const refresh = useCallback(async () => {
    try {
      setDocs({ status: "ready", value: await listDocs() });
    } catch (error) {
      setDocs({ status: "error", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const list = docs.status === "ready" ? docs.value : [];
  const selected = list.find((doc) => doc.id === selectedId) ?? null;
  const now = Date.now();

  /** Documented return path: focus goes back to the card, or to the list heading when the card is gone. */
  const focusCard = (id: string) => {
    const card = document.querySelector<HTMLElement>(`[data-doc-id="${CSS.escape(id)}"]`);
    (card ?? listTitleRef.current)?.focus();
  };

  const close = () => {
    const id = selectedId;
    setSelectedId(null);
    if (id !== null) focusCard(id);
  };

  const onRenamed = (id: string, name: string) => {
    setDocs((current) =>
      current.status === "ready" ? { status: "ready", value: current.value.map((doc) => (doc.id === id ? { ...doc, name } : doc)) } : current,
    );
    void refresh();
  };

  const onDeleted = (id: string) => {
    setDocs((current) => (current.status === "ready" ? { status: "ready", value: current.value.filter((doc) => doc.id !== id) } : current));
    setSelectedId(null);
    listTitleRef.current?.focus();
  };

  const onSaved = async (id: string) => {
    await refresh();
    setSelectedId(id);
  };

  let content: ReactNode;
  if (docs.status === "loading") {
    content = (
      <>
        <p className="visually_hidden" role="status">
          저장한 작품을 불러오는 중…
        </p>
        <SkeletonGrid />
      </>
    );
  } else if (docs.status === "error") {
    content = (
      <EmptyState
        art={false}
        title="목록을 불러오지 못했어요"
        description={docs.message}
        actions={
          <Button variant="ghost" onClick={() => void refresh()}>
            다시 시도
          </Button>
        }
      />
    );
  } else if (list.length === 0) {
    content = (
      <EmptyState
        title="아직 저장한 작품이 없어요"
        description="에디터에서 첫 도트를 찍어 저장하거나, 위의 절차 생성으로 작은 친구를 하나 만들어 보세요. 저장한 작품은 모두 여기에 모여요."
        actions={
          <a className="btn btn_primary" href="#/editor">
            에디터로 가기
          </a>
        }
      />
    );
  } else {
    content = (
      <div className="list_detail">
        <div className="list_detail_list">
          <ul className="doc_grid" aria-label="저장한 작품 목록">
            {list.map((doc) => (
              <li key={doc.id}>
                <DocCard doc={doc} selected={doc.id === selectedId} now={now} onSelect={setSelectedId} />
              </li>
            ))}
          </ul>
        </div>
        {selected ? (
          <div className="list_detail_detail">
            {mobile ? <div className="detail_backdrop" onClick={close} aria-hidden="true" /> : null}
            <DetailPanel
              key={selected.id}
              summary={selected}
              mobile={mobile}
              onClose={close}
              onRenamed={(name) => onRenamed(selected.id, name)}
              onDeleted={() => onDeleted(selected.id)}
            />
          </div>
        ) : mobile ? null : (
          <div className="list_detail_detail">
            <aside className="card detail_panel detail_placeholder" aria-label="선택한 작품">
              <p className="detail_placeholder_text">작품을 고르면 여기에서 크게 보고, 에디터로 열거나 PNG로 내보낼 수 있어요.</p>
            </aside>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="screen gallery" aria-labelledby="gallery-title">
      <div className="screen_head">
        <h1 id="gallery-title" className="screen_title">
          갤러리
        </h1>
        <p className="screen_lede">저장한 작품을 모아 보고, 골라서 다시 열거나 PNG로 내보내요.</p>
      </div>

      <ProcgenStrip onSaved={onSaved} />

      <section className="stack" aria-labelledby="gallery-list-title">
        <div className="wrap_row">
          <h2 id="gallery-list-title" ref={listTitleRef} tabIndex={-1} className="gallery_list_title">
            저장한 작품
          </h2>
          {docs.status === "ready" ? <Pill tone="outline">{list.length}개</Pill> : null}
          <span className="spacer" />
          <Button variant="ghost" size="sm" disabled={docs.status === "loading"} onClick={() => void refresh()}>
            새로고침
          </Button>
        </div>
        {content}
      </section>
    </section>
  );
}

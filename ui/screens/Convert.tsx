import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type RefObject } from "react";
import { usedIndices } from "../../src/core/grid.ts";
import type { DotDocument, DotGrid } from "../../src/core/types.ts";
import { documentToGrid } from "../../src/io/project.ts";
import {
  createDoc,
  listPalettes,
  type ConvertRequest,
  type ConvertStats,
  type DitherMode,
  type FitMode,
  type OutlineMode,
  type PalettePreset,
  type SampleMode,
  type SnapReport,
  type SnapRequest,
} from "../api.ts";
import { Button, Card, Field, Pill, PixelCanvas, Segmented, cx, showToast } from "../components/index.ts";
import { openInEditor } from "../state.ts";
import { convertAbortable, snapAbortable } from "./convert/api.ts";
import {
  CONFIDENCE_MIN,
  DEBOUNCE_MS,
  DITHER_OPTIONS,
  FIT_OPTIONS,
  K_MAX,
  K_MIN,
  MODE_OPTIONS,
  OUTLINE_OPTIONS,
  PURITY_WARN,
  SAMPLE_OPTIONS,
  SCALE_MAX,
  SIZE_MAX,
  WIDTH_MAX,
  WIDTH_MIN,
  clamp,
  getSession,
  saveSession,
  toConvertRequest,
  toSnapRequest,
  type ConvertOptions,
  type Mode,
  type PaletteChoice,
  type SnapOptions,
} from "./convert/options.ts";
import "../styles/convert.css";

/**
 * Convert screen: image -> dots.
 * "변환" runs the photo/illustration pipeline (/api/convert); "스냅" detects the grid of an
 * AI "fake pixel art" image (/api/snap). Option changes are debounced and the in-flight
 * request is aborted, so the preview always reflects the latest options.
 */

type Plan = { kind: "convert"; request: ConvertRequest } | { kind: "snap"; request: SnapRequest };

type PreviewResult =
  | { mode: "convert"; document: DotDocument; grid: DotGrid; stats: ConvertStats }
  | { mode: "snap"; document: DotDocument; grid: DotGrid; report: SnapReport };

interface SourceInfo {
  url: string;
  width: number;
  height: number;
  /** False when the browser cannot decode the file (the server may still manage). */
  decodable: boolean;
}

const SWATCH_MAX = 32;

const baseName = (name: string): string => name.replace(/\.[^.]+$/, "") || name;
const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`;
const hex = (color: number): string => `#${(color >>> 8).toString(16).padStart(6, "0")}`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function withProvenance(doc: DotDocument, file: File, mode: Mode): DotDocument {
  return { ...doc, meta: { ...doc.meta, source: file.name, tool: `nonpareille ${mode}` } };
}

/* ---------- Hooks ---------- */

/** Content-box width of an element in CSS px (0 until measured), tracked with ResizeObserver. */
function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0]?.contentRect.width ?? 0));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Object URL and natural size of the selected file; revoked when the file changes. */
function useSource(file: File | null): SourceInfo | null {
  const [info, setInfo] = useState<SourceInfo | null>(null);
  useEffect(() => {
    if (!file) {
      setInfo(null);
      return;
    }
    const url = URL.createObjectURL(file);
    let alive = true;
    const probe = new Image();
    probe.onload = () => {
      if (alive) setInfo({ url, width: probe.naturalWidth, height: probe.naturalHeight, decodable: true });
    };
    probe.onerror = () => {
      if (alive) setInfo({ url, width: 0, height: 0, decodable: false });
    };
    probe.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return info;
}

/* ---------- Form controls ---------- */

interface NumberInputProps {
  id?: string;
  min: number;
  max: number;
  value: number;
  onCommit: (value: number) => void;
  "aria-label"?: string;
}

/** Integer input that commits in-range values while typing and clamps the rest on blur. */
function NumberInput({ id, min, max, value, onCommit, "aria-label": ariaLabel }: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={draft ?? String(value)}
      aria-label={ariaLabel}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const next = Number(raw);
        if (raw !== "" && Number.isInteger(next) && next >= min && next <= max) onCommit(next);
      }}
      onBlur={(event) => {
        const next = Number(event.target.value);
        if (event.target.value.trim() !== "" && Number.isFinite(next)) onCommit(clamp(Math.round(next), min, max));
        setDraft(null);
      }}
    />
  );
}

interface OptionalNumberProps {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  "aria-label": string;
}

/** Integer input in 1..SIZE_MAX where empty means "automatic". */
function OptionalNumber({ id, value, onChange, "aria-label": ariaLabel }: OptionalNumberProps) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={1}
      max={SIZE_MAX}
      step={1}
      placeholder="자동"
      value={value ?? ""}
      aria-label={ariaLabel}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === "") {
          onChange(null);
          return;
        }
        const next = Number(raw);
        if (Number.isInteger(next) && next >= 1 && next <= SIZE_MAX) onChange(next);
      }}
    />
  );
}

interface PaletteFieldProps {
  value: PaletteChoice;
  onChange: (value: PaletteChoice) => void;
  presets: PalettePreset[];
  /** Offer "keep sampled colors" (snap mode). */
  allowNone?: boolean;
}

function PaletteField({ value, onChange, presets, allowNone = false }: PaletteFieldProps) {
  const id = useId();
  const selected = value.kind === "preset" ? `preset:${value.name}` : value.kind;
  const names = presets.map((preset) => preset.name);
  // Keep a preset selectable even if the preset list has not loaded (or failed).
  const options = value.kind === "preset" && !names.includes(value.name) ? [...names, value.name] : names;

  const select = (raw: string) => {
    if (raw === "none") onChange({ kind: "none" });
    else if (raw === "auto") onChange({ kind: "auto", k: value.kind === "auto" ? value.k : 16 });
    else onChange({ kind: "preset", name: raw.slice("preset:".length) });
  };

  return (
    <Field label="팔레트" htmlFor={id} hint={value.kind === "auto" ? "이미지에서 K색을 뽑아 씁니다." : undefined}>
      <div className="convert_palette">
        <select id={id} value={selected} onChange={(event) => select(event.target.value)}>
          {allowNone ? <option value="none">원본 색 유지</option> : null}
          <option value="auto">자동 추출 (K색)</option>
          {options.map((name) => {
            const count = presets.find((preset) => preset.name === name)?.colors.length;
            return (
              <option key={name} value={`preset:${name}`}>
                {count === undefined ? name : `${name} · ${count}색`}
              </option>
            );
          })}
        </select>
        {value.kind === "auto" ? (
          <span className="convert_number_slot">
            <NumberInput min={K_MIN} max={K_MAX} value={value.k} onCommit={(k) => onChange({ kind: "auto", k })} aria-label="자동 추출 색 수" />
          </span>
        ) : null}
      </div>
    </Field>
  );
}

interface ConvertFieldsProps {
  value: ConvertOptions;
  onChange: (value: ConvertOptions) => void;
  presets: PalettePreset[];
}

function ConvertFields({ value, onChange, presets }: ConvertFieldsProps) {
  const widthId = useId();
  const fitId = useId();
  const sampleId = useId();
  const ditherId = useId();
  const outlineId = useId();
  const patch = (partial: Partial<ConvertOptions>) => onChange({ ...value, ...partial });

  return (
    <>
      <div className="convert_fields">
        <Field label="가로 도트 수" htmlFor={widthId} hint="세로 도트 수는 원본 비율에 맞춰 자동으로 정해집니다.">
          <div className="convert_range">
            <input
              type="range"
              min={WIDTH_MIN}
              max={WIDTH_MAX}
              step={1}
              value={value.width}
              aria-label="가로 도트 수 슬라이더"
              onChange={(event) => patch({ width: Number(event.target.value) })}
            />
            <span className="convert_number_slot">
              <NumberInput id={widthId} min={WIDTH_MIN} max={WIDTH_MAX} value={value.width} onCommit={(width) => patch({ width })} />
            </span>
          </div>
        </Field>
        <Field label="맞춤" htmlFor={fitId}>
          <select id={fitId} value={value.fit} onChange={(event) => patch({ fit: event.target.value as FitMode })}>
            {FIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="대표색 추출" htmlFor={sampleId}>
          <select id={sampleId} value={value.sample} onChange={(event) => patch({ sample: event.target.value as SampleMode })}>
            {SAMPLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <PaletteField value={value.palette} onChange={(palette) => patch({ palette })} presets={presets} />
        <Field label="디더링" htmlFor={ditherId}>
          <select id={ditherId} value={value.dither} onChange={(event) => patch({ dither: event.target.value as DitherMode })}>
            {DITHER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="외곽선" htmlFor={outlineId}>
          <select id={outlineId} value={value.outline} onChange={(event) => patch({ outline: event.target.value as OutlineMode | "none" })}>
            {OUTLINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="convert_checks" role="group" aria-label="정리">
        <p className="convert_group_title">정리</p>
        <Field label="외곽선 확장 (가는 선 보존)" inline>
          <input type="checkbox" checked={value.outlineExpand} onChange={(event) => patch({ outlineExpand: event.target.checked })} />
        </Field>
        <Field label="고아 픽셀 정리" inline>
          <input type="checkbox" checked={value.orphans} onChange={(event) => patch({ orphans: event.target.checked })} />
        </Field>
      </div>
    </>
  );
}

interface SnapFieldsProps {
  value: SnapOptions;
  onChange: (value: SnapOptions) => void;
  presets: PalettePreset[];
}

function SnapFields({ value, onChange, presets }: SnapFieldsProps) {
  const sizeId = useId();
  const patch = (partial: Partial<SnapOptions>) => onChange({ ...value, ...partial });
  return (
    <div className="convert_fields">
      <Field label="예상 크기 (선택)" htmlFor={sizeId} hint="비워 두면 격자 주기를 자동으로 감지합니다. 둘 다 적으면 그 크기를 우선합니다.">
        <div className="convert_size">
          <OptionalNumber id={sizeId} value={value.expectW} onChange={(expectW) => patch({ expectW })} aria-label="예상 가로 도트 수" />
          <span aria-hidden="true">×</span>
          <OptionalNumber value={value.expectH} onChange={(expectH) => patch({ expectH })} aria-label="예상 세로 도트 수" />
        </div>
      </Field>
      <PaletteField value={value.palette} onChange={(palette) => patch({ palette })} presets={presets} allowNone />
    </div>
  );
}

/* ---------- Preview ---------- */

function SourcePane({ file, source }: { file: File; source: SourceInfo | null }) {
  return (
    <figure className="convert_pane">
      <figcaption className="convert_pane_head">
        <span className="convert_pane_label">원본</span>
        {source?.decodable ? <span>{source.width} × {source.height} px</span> : null}
      </figcaption>
      <div className="convert_pane_frame">
        {source === null ? null : source.decodable ? (
          <img className="convert_pane_img" src={source.url} alt={`원본 이미지 ${file.name}`} />
        ) : (
          <p className="convert_placeholder">브라우저가 표시할 수 없는 형식입니다. 서버 변환은 시도합니다.</p>
        )}
      </div>
    </figure>
  );
}

function ResultPane({ result, busy }: { result: PreviewResult | null; busy: boolean }) {
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const grid = result?.grid;
  const scale = grid ? clamp(Math.floor(frameWidth / Math.max(grid.width, grid.height)), 1, SCALE_MAX) : 1;
  return (
    <figure className="convert_pane">
      <figcaption className="convert_pane_head">
        <span className="convert_pane_label">도트 결과</span>
        {grid ? <span>{grid.width} × {grid.height} 도트 · ×{scale}</span> : null}
      </figcaption>
      <div ref={frameRef} className={cx("convert_pane_frame", busy && "convert_pane_frame_busy")}>
        {grid ? (
          <PixelCanvas grid={grid} scale={scale} aria-label={`${grid.width}x${grid.height} 도트 결과 미리보기`} />
        ) : (
          <p className="convert_placeholder">{busy ? "결과를 계산하고 있어요…" : "결과가 여기에 표시됩니다."}</p>
        )}
      </div>
    </figure>
  );
}

function ResultStats({ result }: { result: PreviewResult }) {
  if (result.mode === "convert") {
    const { width, height, colors } = result.stats;
    return (
      <>
        <Pill>{width} × {height} 도트</Pill>
        <Pill>{colors}색</Pill>
      </>
    );
  }
  const { W, H, confidence, purity } = result.report;
  return (
    <>
      <Pill>{W} × {H} 도트</Pill>
      <Pill tone={confidence < CONFIDENCE_MIN ? "danger" : "ok"}>신뢰도 {percent(confidence)}</Pill>
      <Pill tone={purity < PURITY_WARN ? "accent" : "ok"}>순도 {percent(purity)}</Pill>
    </>
  );
}

function SnapNotes({ report }: { report: SnapReport }) {
  if (report.confidence < CONFIDENCE_MIN) {
    return <p className="convert_note">격자를 찾지 못했습니다. 예상 크기를 적으면 그 크기로 나눕니다.</p>;
  }
  if (report.purity < PURITY_WARN) {
    return <p className="convert_note">셀 순도가 낮습니다. 예상 크기나 팔레트를 바꿔 보세요.</p>;
  }
  return null;
}

function Swatches({ grid }: { grid: DotGrid }) {
  const colors = useMemo(() => {
    const used = usedIndices(grid);
    used.delete(0);
    return [...used].sort((a, b) => a - b).map((index) => grid.palette.colors[index]!);
  }, [grid]);
  if (colors.length === 0) return null;
  const shown = colors.slice(0, SWATCH_MAX);
  return (
    <ul className="convert_swatches" aria-label={`사용된 색 ${colors.length}개`}>
      {shown.map((color, index) => (
        <li key={`${index}-${color}`} className="convert_swatch" style={{ background: hex(color) }} title={hex(color)} />
      ))}
      {colors.length > shown.length ? <li className="convert_note">+{colors.length - shown.length}</li> : null}
    </ul>
  );
}

function DropIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-8 9" />
    </svg>
  );
}

/* ---------- Screen ---------- */

export default function Convert() {
  const initial = getSession();
  const [file, setFile] = useState<File | null>(initial.file);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [convert, setConvert] = useState<ConvertOptions>(initial.convert);
  const [snap, setSnap] = useState<SnapOptions>(initial.snap);
  const [palettes, setPalettes] = useState<PalettePreset[]>([]);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const source = useSource(file);

  useEffect(() => {
    saveSession({ file, mode, convert, snap });
  }, [file, mode, convert, snap]);

  useEffect(() => {
    let alive = true;
    listPalettes().then(
      (list) => {
        if (alive) setPalettes(list);
      },
      () => {
        if (alive) showToast("팔레트 목록을 불러오지 못했습니다.", "danger");
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const plan = useMemo<Plan>(
    () => (mode === "convert" ? { kind: "convert", request: toConvertRequest(convert) } : { kind: "snap", request: toSnapRequest(snap) }),
    [mode, convert, snap],
  );

  // Live preview: debounce, then POST; any change aborts the request in flight.
  useEffect(() => {
    if (!file) {
      setResult(null);
      setError(null);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    const timer = window.setTimeout(() => {
      setBusy(true);
      const pending: Promise<PreviewResult> =
        plan.kind === "convert"
          ? convertAbortable(file, plan.request, signal).then(
              ({ document, stats }): PreviewResult => ({ mode: "convert", document, grid: documentToGrid(document), stats }),
            )
          : snapAbortable(file, plan.request, signal).then(
              ({ document, report }): PreviewResult => ({ mode: "snap", document, grid: documentToGrid(document), report }),
            );
      pending.then(
        (next) => {
          if (signal.aborted) return;
          setResult(next);
          setError(null);
          setBusy(false);
        },
        (reason: unknown) => {
          if (signal.aborted) return;
          setResult(null);
          setError(reason instanceof Error ? reason.message : String(reason));
          setBusy(false);
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [file, plan]);

  const acceptFile = (candidate: File | undefined) => {
    if (!candidate) return;
    if (candidate.type !== "" && !candidate.type.startsWith("image/")) {
      showToast("이미지 파일만 올릴 수 있습니다.", "danger");
      return;
    }
    setFile(candidate);
  };
  const openPicker = () => inputRef.current?.click();
  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0]);
    event.target.value = "";
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  };

  const sendToEditor = () => {
    if (!result || !file) return;
    openInEditor(withProvenance(result.document, file, mode), { name: baseName(file.name) });
  };
  const saveToGallery = async () => {
    if (!result || !file) return;
    setSaving(true);
    try {
      await createDoc(withProvenance(result.document, file, mode), baseName(file.name));
      showToast("갤러리에 저장했습니다.", "ok");
    } catch (reason) {
      showToast(`저장하지 못했습니다: ${reason instanceof Error ? reason.message : String(reason)}`, "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="screen" aria-labelledby="convert-title">
      <div className="screen_head">
        <h1 id="convert-title" className="screen_title">변환</h1>
        <p className="screen_lede">
          사진이나 일러스트를 도트 격자로 바꾸고, AI가 만든 가짜 도트 이미지는 진짜 격자에 맞춰 정리합니다. 옵션을 바꾸면 미리보기가 바로 따라옵니다.
        </p>
      </div>

      <Card title="1. 이미지 고르기" description="사진·일러스트는 변환 모드, AI가 만든 가짜 도트 이미지는 스냅 모드가 어울립니다.">
        <div
          className={cx("convert_dropzone", file && "convert_dropzone_compact", dragging && "convert_dropzone_active")}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input ref={inputRef} type="file" accept="image/*" className="visually_hidden" tabIndex={-1} aria-hidden="true" onChange={onInputChange} />
          {file ? (
            <div className="convert_source">
              {source?.decodable ? (
                <img className="convert_source_thumb" src={source.url} alt="" />
              ) : (
                <span className="convert_source_thumb" aria-hidden="true" />
              )}
              <div className="convert_source_text">
                <p className="convert_source_name">{file.name}</p>
                <p className="convert_source_meta">
                  {source?.decodable ? `${source.width} × ${source.height} px · ` : ""}
                  {formatBytes(file.size)}
                </p>
              </div>
              <div className="cluster convert_source_actions">
                <Button variant="ghost" size="sm" onClick={openPicker}>다른 이미지</Button>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)}>제거</Button>
              </div>
            </div>
          ) : (
            <>
              <DropIcon className="convert_dropzone_icon" />
              <p className="convert_dropzone_title">이미지를 여기에 끌어다 놓으세요</p>
              <Button onClick={openPicker}>파일 선택</Button>
              <p className="convert_dropzone_hint">PNG, JPG, WebP, GIF를 올릴 수 있습니다. 올리면 바로 미리보기를 만듭니다.</p>
            </>
          )}
        </div>
      </Card>

      {file ? (
        <Card
          title="2. 옵션 조정과 미리보기"
          description="옵션을 바꾸면 잠시 뒤 자동으로 다시 계산합니다. 결과가 마음에 들면 에디터로 보내거나 갤러리에 저장하세요."
        >
          <div className="convert_workbench">
            <div className="convert_form convert_stack">
              <Field label="모드" group>
                <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} aria-label="처리 모드" />
              </Field>
              {mode === "convert" ? (
                <ConvertFields value={convert} onChange={setConvert} presets={palettes} />
              ) : (
                <SnapFields value={snap} onChange={setSnap} presets={palettes} />
              )}
            </div>

            <div className="convert_result">
              <div className="convert_result_body">
                <div className="convert_compare">
                  <SourcePane file={file} source={source} />
                  <ResultPane result={result} busy={busy} />
                </div>
                <div className="convert_status cluster" role="status" aria-live="polite">
                  {busy ? (
                    <Pill tone="outline" dot>{mode === "convert" ? "변환 중…" : "격자 분석 중…"}</Pill>
                  ) : null}
                  {result ? <ResultStats result={result} /> : null}
                </div>
                {error ? <p className="convert_error" role="alert">처리하지 못했습니다: {error}</p> : null}
                {result?.mode === "snap" ? <SnapNotes report={result.report} /> : null}
                {result ? <Swatches grid={result.grid} /> : null}
              </div>
              <div className="convert_result_footer convert_actions">
                <Button onClick={sendToEditor} disabled={!result || busy}>에디터로 보내기</Button>
                <Button variant="ghost" onClick={saveToGallery} disabled={!result || busy || saving}>
                  {saving ? "저장 중…" : "갤러리에 저장"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

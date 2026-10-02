import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import type { DotDocument, DotGrid, RGBA32 } from "../../src/core/types.ts";
import { documentToGrid } from "../../src/io/project.ts";
import { PRESETS } from "../../src/palette/presets.ts";
import {
  buildPrompt,
  createDoc,
  startGeneration,
  subscribeJob,
  type GenReport,
  type GenRequest,
  type PromptInfo,
  type PromptRequest,
  type ViewMode,
} from "../api.ts";
import { Button, Card, Field, Pill, PixelCanvas, Segmented, cx, showToast, type SegmentedOption } from "../components/index.ts";
import { openInEditor } from "../state.ts";
import "../styles/generate.css";

/* ---------- Options ---------- */

type SizeChoice = "16" | "32" | "48" | "64" | "custom";
const SIZE_OPTIONS: readonly SegmentedOption<SizeChoice>[] = [
  { value: "16", label: "16" },
  { value: "32", label: "32" },
  { value: "48", label: "48" },
  { value: "64", label: "64" },
  { value: "custom", label: "직접 입력" },
];
const SIZE_MIN = 4;
const SIZE_MAX = 256;

const VIEW_OPTIONS: readonly SegmentedOption<ViewMode>[] = [
  { value: "front", label: "정면" },
  { value: "side", label: "측면" },
  { value: "three-quarter", label: "3/4 시점" },
  { value: "top-down", label: "탑다운" },
];

const PROVIDERS = [
  { id: "codex-image", label: "Codex Image (기본)", hint: "ChatGPT 로그인으로 생성해요. 로그인이 풀려 있으면 오류가 나요." },
  { id: "openai", label: "OpenAI 이미지 API", hint: "서버에 OPENAI_API_KEY 환경 변수가 필요해요." },
  { id: "retro-diffusion", label: "Retro Diffusion", hint: "서버에 RD_API_KEY 환경 변수가 필요해요. 격자 검출 없이 바로 도트로 받아요." },
  { id: "comfyui", label: "ComfyUI (로컬)", hint: "로컬 ComfyUI 서버와 pixel-art-xl LoRA가 필요해요." },
] as const;
type ProviderId = (typeof PROVIDERS)[number]["id"];

const hex = (c: RGBA32): string => `#${(c >>> 8).toString(16).padStart(6, "0")}`;
const PALETTES = Object.entries(PRESETS).map(([name, colors]) => ({ name, colors: colors.map(hex) }));
const DEFAULT_PALETTE = PALETTES[0]?.name ?? "pico8";

/** Job stages in display order; the server's "decoding" stage is shown as part of detecting. */
const STAGES = [
  { id: "prompt", label: "프롬프트 작성" },
  { id: "generating", label: "이미지 생성", hint: "1-3분 걸려요" },
  { id: "detecting", label: "격자 검출" },
  { id: "snapping", label: "격자 스냅" },
  { id: "palette", label: "팔레트 맞추기" },
  { id: "done", label: "완료" },
] as const;
const STAGE_ALIASES: Record<string, (typeof STAGES)[number]["id"]> = { decoding: "detecting" };
const stageIndex = (stage: string): number => STAGES.findIndex((s) => s.id === (STAGE_ALIASES[stage] ?? stage));

/** Largest integer-scaled preview that still fits a 390px phone inside the card and frame padding. */
const PREVIEW_PX = 256;
const DOC_NAME_MAX = 60;

/* ---------- Form ---------- */

interface FormValues {
  subject: string;
  size: SizeChoice;
  width: string;
  height: string;
  palette: string;
  view: ViewMode;
  provider: ProviderId;
}
interface FormErrors {
  subject?: string;
  size?: string;
}
const INITIAL: FormValues = { subject: "", size: "32", width: "32", height: "32", palette: DEFAULT_PALETTE, view: "front", provider: "codex-image" };

const isSize = (n: number): boolean => Number.isInteger(n) && n >= SIZE_MIN && n <= SIZE_MAX;

function readSpec(values: FormValues): { spec: PromptRequest } | { errors: FormErrors } {
  const errors: FormErrors = {};
  const subject = values.subject.trim();
  if (!subject) errors.subject = "주제를 입력해 주세요.";
  const width = values.size === "custom" ? Number(values.width) : Number(values.size);
  const height = values.size === "custom" ? Number(values.height) : Number(values.size);
  if (!isSize(width) || !isSize(height)) errors.size = `가로·세로 모두 ${SIZE_MIN}~${SIZE_MAX} 사이의 정수를 입력해 주세요.`;
  if (errors.subject !== undefined || errors.size !== undefined) return { errors };
  return { spec: { subject, width, height, palette: values.palette, view: values.view } };
}

const docName = (subject: string): string => subject.trim().slice(0, DOC_NAME_MAX);

function messageOf(error: unknown): string {
  if (error instanceof TypeError) return "서버에 연결할 수 없어요. 로컬 서버가 켜져 있는지 확인해 주세요.";
  return error instanceof Error ? error.message : String(error);
}

/* ---------- Job state ---------- */

type Run =
  | { status: "idle" }
  | { status: "running"; request: GenRequest; stage: number }
  | { status: "done"; request: GenRequest; document: DotDocument; grid: DotGrid; report: GenReport; saving?: boolean; savedId?: string }
  | { status: "error"; request: GenRequest; message: string };

const percent = (x: number): string => `${Math.round(x * 100)}%`;

/* ---------- Icons ---------- */

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;
const CheckIcon = () => (
  <svg {...svgProps}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
const ChevronIcon = ({ className }: { className?: string }) => (
  <svg {...svgProps} className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const WarnIcon = () => (
  <svg {...svgProps}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4" />
    <path d="M12 17.5h.01" />
  </svg>
);

/* ---------- Screen ---------- */

export default function Generate() {
  const ids = { subject: useId(), width: useId(), height: useId(), palette: useId(), provider: useId(), live: useId() };
  const [values, setValues] = useState<FormValues>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [preview, setPreview] = useState<{ spec: PromptRequest; info: PromptInfo } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [run, setRun] = useState<Run>({ status: "idle" });
  const runIdRef = useRef(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));
  const palette = PALETTES.find((p) => p.name === values.palette);
  const provider = PROVIDERS.find((p) => p.id === values.provider) ?? PROVIDERS[0];
  const busy = run.status === "running";

  const currentSpec = useMemo(() => {
    const result = readSpec(values);
    return "spec" in result ? JSON.stringify(result.spec) : null;
  }, [values]);
  const previewStale = preview !== null && JSON.stringify(preview.spec) !== currentSpec;

  // Close the SSE subscription when leaving the screen; late events are ignored via runId.
  useEffect(
    () => () => {
      runIdRef.current++;
      unsubscribeRef.current?.();
    },
    [],
  );

  // Move focus to the live card (progress / result / error) so keyboard and screen-reader users follow the job.
  useEffect(() => {
    if (run.status !== "idle") document.getElementById(ids.live)?.focus();
  }, [run.status, ids.live]);

  function validate(): PromptRequest | null {
    const result = readSpec(values);
    if ("errors" in result) {
      setErrors(result.errors);
      document.getElementById(result.errors.subject !== undefined ? ids.subject : ids.width)?.focus();
      return null;
    }
    setErrors({});
    return result.spec;
  }

  async function previewPrompt() {
    const spec = validate();
    if (!spec) return;
    setPreviewBusy(true);
    try {
      setPreview({ spec, info: await buildPrompt(spec) });
    } catch (error) {
      showToast(messageOf(error), "danger");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function launch(request: GenRequest) {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    const runId = ++runIdRef.current;
    setRun({ status: "running", request, stage: 0 });
    let jobId: string;
    try {
      ({ jobId } = await startGeneration(request));
    } catch (error) {
      if (runId === runIdRef.current) setRun({ status: "error", request, message: messageOf(error) });
      return;
    }
    if (runId !== runIdRef.current) return;
    unsubscribeRef.current = subscribeJob(jobId, (event) => {
      if (runId !== runIdRef.current) return;
      if (event.type === "progress") {
        const index = stageIndex(event.stage);
        if (index >= 0) setRun((prev) => (prev.status === "running" ? { ...prev, stage: index } : prev));
      } else if (event.type === "done") {
        const { document, report } = event.result;
        setRun({ status: "done", request, document, grid: documentToGrid(document), report });
      } else {
        setRun({ status: "error", request, message: event.message });
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const spec = validate();
    if (spec) void launch({ ...spec, provider: values.provider });
  }

  /** Re-run with the current form values and a fresh seed, so a seeded provider gives a different image. */
  function regenerate(previous: GenRequest) {
    const spec = validate();
    if (spec) void launch({ ...spec, provider: values.provider, seed: (previous.seed ?? 0) + 1 });
  }

  async function saveToGallery(current: Extract<Run, { status: "done" }>) {
    if (current.saving || current.savedId !== undefined) return;
    const patch = (fields: Partial<Extract<Run, { status: "done" }>>) =>
      setRun((prev) => (prev.status === "done" && prev.document === current.document ? { ...prev, ...fields } : prev));
    patch({ saving: true });
    try {
      const { id } = await createDoc(current.document, docName(current.request.subject));
      patch({ saving: false, savedId: id });
      showToast("갤러리에 저장했어요.", "ok");
    } catch (error) {
      patch({ saving: false });
      showToast(messageOf(error), "danger");
    }
  }

  async function copyPrompt(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("프롬프트를 복사했어요.", "ok");
    } catch {
      showToast("클립보드에 복사하지 못했어요.", "danger");
    }
  }

  return (
    <section className="screen gen" aria-labelledby="generate-title">
      <div className="gen_limiter gen_stack">
        <div className="screen_head">
          <h1 id="generate-title" className="screen_title">생성</h1>
          <p className="screen_lede">주제와 크기, 팔레트를 고르면 AI 이미지를 받아 도트 격자로 다듬어 드려요.</p>
        </div>

        <form className="gen_stack" onSubmit={onSubmit} noValidate>
          <Card title="무엇을 만들까요?" description="영어 프롬프트는 설정값으로 자동으로 만들어져요." aria-label="생성 설정">
            <div className="gen_fields">
              <Field
                label="주제"
                htmlFor={ids.subject}
                hint="영어로 쓰면 더 정확해요. 한국어도 그대로 전달돼요."
                error={errors.subject}
              >
                <textarea
                  id={ids.subject}
                  className="gen_subject"
                  rows={3}
                  value={values.subject}
                  placeholder="예: a small fox knight in a red cape, holding a sword"
                  aria-invalid={errors.subject !== undefined || undefined}
                  onChange={(event) => update("subject", event.target.value)}
                />
              </Field>

              <Field label="도트 크기" group hint="한 변의 도트 수예요. 16~64가 가장 안정적으로 나와요." error={errors.size}>
                <Segmented options={SIZE_OPTIONS} value={values.size} onChange={(size) => update("size", size)} aria-label="도트 크기" />
                {values.size === "custom" ? (
                  <div className="gen_dims">
                    <label className="visually_hidden" htmlFor={ids.width}>가로 도트 수</label>
                    <input
                      id={ids.width}
                      className="gen_dims_input"
                      type="number"
                      inputMode="numeric"
                      min={SIZE_MIN}
                      max={SIZE_MAX}
                      value={values.width}
                      aria-invalid={errors.size !== undefined || undefined}
                      onChange={(event) => update("width", event.target.value)}
                    />
                    <span className="gen_dims_x" aria-hidden="true">×</span>
                    <label className="visually_hidden" htmlFor={ids.height}>세로 도트 수</label>
                    <input
                      id={ids.height}
                      className="gen_dims_input"
                      type="number"
                      inputMode="numeric"
                      min={SIZE_MIN}
                      max={SIZE_MAX}
                      value={values.height}
                      aria-invalid={errors.size !== undefined || undefined}
                      onChange={(event) => update("height", event.target.value)}
                    />
                  </div>
                ) : null}
              </Field>

              <Field label="팔레트" htmlFor={ids.palette} hint={palette ? `${palette.colors.length}색 프리셋` : undefined}>
                <select id={ids.palette} value={values.palette} onChange={(event) => update("palette", event.target.value)}>
                  {PALETTES.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} · {p.colors.length}색
                    </option>
                  ))}
                </select>
                {palette ? (
                  <ul className="gen_swatches" aria-label={`${palette.name} 팔레트 색상`}>
                    {palette.colors.map((color) => (
                      <li key={color} className="gen_swatch" style={{ background: color }} title={color} />
                    ))}
                  </ul>
                ) : null}
              </Field>

              <Field label="시점" group>
                <Segmented options={VIEW_OPTIONS} value={values.view} onChange={(view) => update("view", view)} aria-label="시점" />
              </Field>

              <Field label="생성 모델" htmlFor={ids.provider} hint={provider.hint}>
                <select id={ids.provider} value={values.provider} onChange={(event) => update("provider", event.target.value as ProviderId)}>
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <footer className="gen_actions">
            <Button variant="ghost" onClick={() => void previewPrompt()} disabled={previewBusy || busy}>
              {previewBusy ? "프롬프트 만드는 중…" : "프롬프트 미리보기"}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "생성 중…" : "생성하기"}
            </Button>
          </footer>
        </form>

        {preview ? (
          <details className="card gen_prompt" open>
            <summary className="gen_prompt_summary">
              <span className="card_head_text">
                <h2 className="card_title">프롬프트 미리보기</h2>
                <p className="card_desc">
                  {preview.spec.width} × {preview.spec.height} 도트 · 모델 캔버스 {preview.info.size[0]} × {preview.info.size[1]} · 블록{" "}
                  {preview.info.block}px
                </p>
              </span>
              <ChevronIcon className="gen_prompt_chevron" />
            </summary>
            <div className="gen_prompt_body">
              {previewStale ? <Pill tone="outline">설정이 바뀌었어요 · 다시 미리보기를 눌러 주세요</Pill> : null}
              <pre className="gen_prompt_text">{preview.info.prompt}</pre>
              {preview.info.negative ? <p className="gen_prompt_meta">Negative: {preview.info.negative}</p> : null}
              <div className="gen_prompt_meta">
                <Button size="sm" variant="ghost" onClick={() => void copyPrompt(preview.info.prompt)}>
                  복사
                </Button>
                <span className="gen_key">
                  <span className="gen_key_chip" style={{ background: `#${preview.info.keyColor.toString(16).padStart(6, "0")}` }} aria-hidden="true" />
                  배경 키 색 #{preview.info.keyColor.toString(16).padStart(6, "0")}
                </span>
              </div>
            </div>
          </details>
        ) : null}

        {run.status === "running" ? (
          <Card id={ids.live} tabIndex={-1} className="gen_live" title="생성 중이에요" description="이 화면을 떠나면 진행 상황을 다시 받을 수 없어요.">
            <ol className="gen_stages">
              {STAGES.map((stage, index) => {
                const state = index < run.stage ? "done" : index === run.stage ? "active" : "pending";
                return (
                  <li key={stage.id} className="gen_stage" data-state={state} aria-current={state === "active" ? "step" : undefined}>
                    <span className="gen_stage_mark" aria-hidden="true">
                      {state === "done" ? <CheckIcon /> : index + 1}
                    </span>
                    <span className="gen_stage_text">
                      <span>{stage.label}</span>
                      {"hint" in stage ? <span className="gen_stage_hint">{stage.hint}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="gen_status_line" role="status">
              {STAGES[run.stage]?.label ?? "준비"} 단계를 진행하고 있어요.
            </p>
          </Card>
        ) : null}

        {run.status === "done" ? (
          <Card
            id={ids.live}
            tabIndex={-1}
            className="gen_live"
            title="생성 결과"
            description={`${run.grid.width} × ${run.grid.height} 도트 · ${run.report.attempts}번째 시도`}
          >
            <div className="gen_result">
              <div className="gen_result_body">
                <div className="pixel_frame">
                  <PixelCanvas
                    grid={run.grid}
                    scale={Math.max(1, Math.floor(PREVIEW_PX / Math.max(run.grid.width, run.grid.height)))}
                    aria-label={`생성된 ${run.grid.width}x${run.grid.height} 도트 스프라이트`}
                  />
                </div>
                <dl className="gen_report">
                  <div className="gen_report_item">
                    <dt>격자 확신도</dt>
                    <dd>{percent(run.report.confidence)}</dd>
                  </div>
                  <div className="gen_report_item">
                    <dt>셀 순도</dt>
                    <dd>{percent(run.report.purity)}</dd>
                  </div>
                  <div className="gen_report_item">
                    <dt>격자 주기</dt>
                    <dd>{run.report.period.toFixed(1)}px</dd>
                  </div>
                  <div className="gen_report_item">
                    <dt>팔레트 오차 (ΔE)</dt>
                    <dd>{run.report.paletteResidual.toFixed(3)}</dd>
                  </div>
                </dl>
              </div>
              {run.report.recommendRegenerate ? (
                <p className="gen_warn" role="note">
                  <WarnIcon />
                  <span>격자 확신도나 셀 순도가 낮아요. 결과가 흐릿하면 같은 설정으로 다시 생성하는 걸 권해요.</span>
                </p>
              ) : null}
              <footer className="gen_result_footer">
                <Button
                  onClick={() => openInEditor(run.document, { name: docName(run.request.subject), ...(run.savedId === undefined ? {} : { id: run.savedId }) })}
                >
                  에디터에서 다듬기
                </Button>
                <Button variant="ghost" onClick={() => regenerate(run.request)}>
                  다시 생성
                </Button>
                <Button variant="ghost" onClick={() => void saveToGallery(run)} disabled={run.saving === true || run.savedId !== undefined}>
                  {run.savedId !== undefined ? "갤러리에 저장됨" : run.saving ? "저장하는 중…" : "갤러리에 저장"}
                </Button>
              </footer>
            </div>
          </Card>
        ) : null}

        {run.status === "error" ? (
          <Card
            id={ids.live}
            tabIndex={-1}
            className={cx("gen_live", "gen_error")}
            role="alert"
            title={
              <>
                <WarnIcon />
                생성에 실패했어요
              </>
            }
            description="설정을 확인한 뒤 다시 시도해 주세요. 메시지는 서버가 보낸 그대로예요."
          >
            <p className="gen_error_message">{run.message}</p>
            <div className="cluster">
              <Button onClick={() => void launch(run.request)}>다시 시도</Button>
            </div>
          </Card>
        ) : null}
      </div>
    </section>
  );
}

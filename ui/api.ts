import type { DotDocument } from "../src/core/types.ts";
import type { GenReport } from "../src/gen/generate.ts";
import type { buildImagePrompt } from "../src/gen/prompt.ts";
import { parseDocument, serializeDocument } from "../src/io/project.ts";

/**
 * Typed client for the local Nonpareille server (server/api.ts), same origin.
 * Documents cross the wire as DotDocument JSON (serializeDocument shape) and are
 * parsed back into real typed arrays here so screens only ever see DotDocument.
 */

export class ApiError extends Error {
  override name = "ApiError";
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Preset name | "auto:K" | list of "#rrggbb". */
export type PaletteSpec = string | string[];
export type FitMode = "cover" | "contain" | "stretch";
export type SampleMode = "center" | "mean" | "median" | "mode" | "dominant" | "kcentroid" | "contrast";
export type DitherMode = "none" | "bayer2" | "bayer4" | "bayer8" | "fs" | "jjn" | "stucki" | "atkinson" | "sierra" | "yliluoma";
export type OutlineMode = "black" | "selout";
export type ViewMode = "front" | "side" | "three-quarter" | "top-down" | "isometric";
export type ShadingMode = "flat" | "cel" | "soft";

export interface HealthInfo { ok: boolean; name: string; version: string }
export interface PalettePreset { name: string; colors: string[] }
export interface DocSummary { id: string; name: string; width: number; height: number; updatedAt: string }

export interface ConvertRequest {
  width: number;
  height?: number | "auto";
  fit?: FitMode;
  sample?: SampleMode;
  palette?: PaletteSpec;
  dither?: DitherMode;
  outlineExpand?: boolean;
  orphans?: boolean;
  outline?: OutlineMode;
}
export interface ConvertStats { width: number; height: number; colors: number }

export interface SnapRequest { expect?: [number, number]; palette?: PaletteSpec }
export interface SnapReport { W: number; H: number; confidence: number; purity: number }

export interface ProcgenRequest { mask: string; seed: number; palette?: PaletteSpec; count?: number }

export interface PromptRequest {
  subject: string;
  width: number;
  height: number;
  palette: PaletteSpec;
  view?: ViewMode;
  outline?: "none" | OutlineMode;
  shading?: ShadingMode;
}
export type PromptInfo = ReturnType<typeof buildImagePrompt>;

export interface GenRequest extends PromptRequest {
  provider?: string;
  seed?: number;
  refs?: string[];
}
export type { GenReport };

export type JobEvent =
  | { type: "progress"; stage: string; detail?: Record<string, unknown>; at: number }
  | { type: "done"; result: { document: DotDocument; report: GenReport } }
  | { type: "error"; message: string };

const toWire = (doc: DotDocument): unknown => JSON.parse(serializeDocument(doc));
const fromWire = (raw: unknown): DotDocument => parseDocument(JSON.stringify(raw));

async function readError(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      return (body as { error: string }).error;
    }
  } catch {
    // non-JSON error body; fall through to the status line
  }
  return `${res.status} ${res.statusText}`.trim();
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) window.location.assign("/login");
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return (await res.json()) as T;
}

const jsonInit = (method: "POST" | "PUT", body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function multipart(image: Blob, options: unknown): FormData {
  const form = new FormData();
  form.append("image", image);
  form.append("options", JSON.stringify(options));
  return form;
}

export const health = (): Promise<HealthInfo> => request("/api/health");
export const listPalettes = (): Promise<PalettePreset[]> => request("/api/palettes");
export const listMasks = (): Promise<string[]> => request("/api/masks");

export async function convertImage(image: Blob, options: ConvertRequest): Promise<{ document: DotDocument; stats: ConvertStats }> {
  const body = await request<{ document: unknown; stats: ConvertStats }>("/api/convert", { method: "POST", body: multipart(image, options) });
  return { document: fromWire(body.document), stats: body.stats };
}

export async function snapImage(image: Blob, options: SnapRequest = {}): Promise<{ document: DotDocument; report: SnapReport }> {
  const body = await request<{ document: unknown; report: SnapReport }>("/api/snap", { method: "POST", body: multipart(image, options) });
  return { document: fromWire(body.document), report: body.report };
}

export async function procgen(options: ProcgenRequest): Promise<{ documents: DotDocument[] }> {
  const body = await request<{ documents: unknown[] }>("/api/procgen", jsonInit("POST", options));
  return { documents: body.documents.map(fromWire) };
}

export const buildPrompt = (spec: PromptRequest): Promise<PromptInfo> => request("/api/prompt", jsonInit("POST", spec));

export const startGeneration = (spec: GenRequest): Promise<{ jobId: string }> => request("/api/gen", jsonInit("POST", spec));

/**
 * Subscribe to a generation job's SSE stream. The subscription closes itself after
 * `done` or `error`; the returned function closes it early.
 */
export function subscribeJob(jobId: string, onEvent: (event: JobEvent) => void): () => void {
  const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);
  let finished = false;
  const finish = (event: JobEvent) => {
    if (finished) return;
    finished = true;
    source.close();
    onEvent(event);
  };
  const data = <T,>(event: Event): T => JSON.parse(String((event as MessageEvent).data)) as T;

  source.addEventListener("progress", (event) => {
    if (finished) return;
    onEvent({ type: "progress", ...data<{ stage: string; detail?: Record<string, unknown>; at: number }>(event) });
  });
  source.addEventListener("done", (event) => {
    try {
      const { result } = data<{ result: { document: unknown; report: GenReport } }>(event);
      finish({ type: "done", result: { document: fromWire(result.document), report: result.report } });
    } catch (error) {
      finish({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  });
  source.addEventListener("error", (event) => {
    if (event instanceof MessageEvent) {
      finish({ type: "error", message: data<{ message: string }>(event).message });
    } else if (source.readyState === EventSource.CLOSED) {
      finish({ type: "error", message: "서버와의 연결이 끊어졌습니다." });
    }
    // otherwise EventSource is reconnecting; the server replays missed events.
  });

  return () => {
    finished = true;
    source.close();
  };
}

export const listDocs = (): Promise<DocSummary[]> => request("/api/docs");

export async function getDoc(id: string): Promise<DotDocument> {
  return fromWire(await request<unknown>(`/api/docs/${encodeURIComponent(id)}`));
}

export const createDoc = (document: DotDocument, name?: string): Promise<{ id: string }> =>
  request("/api/docs", jsonInit("POST", { document: toWire(document), ...(name === undefined ? {} : { name }) }));

export const updateDoc = (id: string, document: DotDocument, name?: string): Promise<{ id: string }> =>
  request(`/api/docs/${encodeURIComponent(id)}`, jsonInit("PUT", { document: toWire(document), ...(name === undefined ? {} : { name }) }));

export const deleteDoc = (id: string): Promise<{ ok: true }> =>
  request(`/api/docs/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Thumbnail URL; pass `updatedAt` so a re-saved document is not served from cache. */
export const thumbUrl = (id: string, updatedAt?: string): string =>
  `/api/docs/${encodeURIComponent(id)}/thumb.png${updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : ""}`;

import type { DotDocument } from "../../../src/core/types.ts";
import { parseDocument } from "../../../src/io/project.ts";
import { ApiError, type ConvertRequest, type ConvertStats, type SnapReport, type SnapRequest } from "../../api.ts";

/**
 * Abortable variants of convertImage / snapImage (ui/api.ts) for the live preview:
 * the screen cancels the in-flight request whenever the options change.
 * Same wire shapes as server/api.ts; documents are parsed back with parseDocument.
 */

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

async function postImage<T>(path: string, image: Blob, options: unknown, signal: AbortSignal): Promise<T> {
  const form = new FormData();
  form.append("image", image);
  form.append("options", JSON.stringify(options));
  const res = await fetch(path, { method: "POST", body: form, signal });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return (await res.json()) as T;
}

const fromWire = (raw: unknown): DotDocument => parseDocument(JSON.stringify(raw));

export async function convertAbortable(
  image: Blob,
  options: ConvertRequest,
  signal: AbortSignal,
): Promise<{ document: DotDocument; stats: ConvertStats }> {
  const body = await postImage<{ document: unknown; stats: ConvertStats }>("/api/convert", image, options, signal);
  return { document: fromWire(body.document), stats: body.stats };
}

export async function snapAbortable(
  image: Blob,
  options: SnapRequest,
  signal: AbortSignal,
): Promise<{ document: DotDocument; report: SnapReport }> {
  const body = await postImage<{ document: unknown; report: SnapReport }>("/api/snap", image, options, signal);
  return { document: fromWire(body.document), report: body.report };
}

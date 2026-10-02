import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { renderRGBA } from "../../../src/core/render.ts";
import type { DotDocument } from "../../../src/core/types.ts";
import { documentToGrid } from "../../../src/io/project.ts";

/** Async resource state shared by the gallery screens. */
export type Loadable<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error"; message: string };

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Matches the shell's tab-bar breakpoint (app.css); the detail pane becomes a sheet below it. */
export const MOBILE_QUERY = "(max-width: 720px)";

/* ---------- Time ---------- */

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];
const relativeFormat = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });
const absoluteFormat = new Intl.DateTimeFormat("ko", { dateStyle: "medium", timeStyle: "short" });

/** Korean relative time ("방금", "3분 전", "어제", "2주 전"); "날짜 없음" for unparsable input. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "날짜 없음";
  const seconds = Math.round((time - now) / 1000);
  if (Math.abs(seconds) < 45) return "방금";
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return relativeFormat.format(seconds, "second");
}

export function formatAbsoluteTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "날짜 없음" : absoluteFormat.format(time);
}

/* ---------- Thumbnails / export ---------- */

/** server/store.ts renders thumbnails at max(1, floor(128 / width)) px per dot; used to size the checkerboard. */
export const thumbDotSize = (width: number): number => Math.max(1, Math.floor(128 / width));

/** Same scale as the server's /api/render default. */
export const EXPORT_SCALE = 8;

/**
 * Pixels come from the engine renderer (exact palette colors); the browser encodes the PNG,
 * because src/io/png-encode.ts deflates through node:zlib and cannot run client-side.
 */
export function documentToPng(doc: DotDocument): Promise<Blob> {
  const image = renderRGBA(documentToGrid(doc), { ...doc.canvas, dotW: EXPORT_SCALE, dotH: EXPORT_SCALE, gap: 0 });
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("캔버스를 만들 수 없어요"));
  const pixels = ctx.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  ctx.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG 인코딩에 실패했어요"))), "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const safeFileName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "nonpareille";

/* ---------- Hooks ---------- */

export function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(
    () => (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Content-box width of the element the ref is attached to: measured before first paint, then kept fresh on resize. */
export function useContentWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const style = getComputedStyle(node);
      const next = Math.floor(node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      setWidth((previous) => (previous === next ? previous : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

import { useSyncExternalStore } from "react";
import { cx } from "./cx.ts";

export type ToastTone = "info" | "ok" | "danger";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

let items: readonly ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: number): void {
  if (!items.some((item) => item.id === id)) return;
  items = items.filter((item) => item.id !== id);
  emit();
}

/** Show a transient message. Errors use `danger` and are announced assertively. */
export function showToast(message: string, tone: ToastTone = "info", durationMs = 4000): number {
  const id = nextId++;
  items = [...items, { id, message, tone }];
  emit();
  if (durationMs > 0) window.setTimeout(() => dismissToast(id), durationMs);
  return id;
}

/** Mount once near the app root. */
export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => items, () => items);
  return (
    <div className="toast_host">
      {list.map((item) => (
        <div
          key={item.id}
          className={cx("toast", item.tone === "ok" && "toast_ok", item.tone === "danger" && "toast_danger")}
          role={item.tone === "danger" ? "alert" : "status"}
        >
          <span>{item.message}</span>
          <button type="button" className="toast_close" aria-label="닫기" onClick={() => dismissToast(item.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

import { useSyncExternalStore } from "react";
import type { DotDocument } from "../src/core/types.ts";

/**
 * Tiny shared store for the document being edited.
 * Generate / Convert / Gallery hand a document to the Editor with `openInEditor`.
 */
export interface DocumentMeta {
  /** Saved document id (from /api/docs) when the document came from the gallery. */
  id?: string;
  name?: string;
}

let currentDocument: DotDocument | null = null;
let currentMeta: DocumentMeta = {};
const listeners = new Set<() => void>();

export function getCurrentDocument(): DotDocument | null {
  return currentDocument;
}

export function getCurrentMeta(): DocumentMeta {
  return currentMeta;
}

export function setCurrentDocument(doc: DotDocument | null, meta: DocumentMeta = {}): void {
  currentDocument = doc;
  currentMeta = doc === null ? {} : meta;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding: re-renders when the current document changes. */
export function useCurrentDocument(): DotDocument | null {
  return useSyncExternalStore(subscribe, getCurrentDocument, getCurrentDocument);
}

/** Store the document and navigate to the editor screen. */
export function openInEditor(doc: DotDocument, meta: DocumentMeta = {}): void {
  setCurrentDocument(doc, meta);
  window.location.hash = "#/editor";
}

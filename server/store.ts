import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { documentToGrid, parseDocument, serializeDocument } from "../src/io/project.ts";
import { renderRGBA } from "../src/core/render.ts";
import { encodeRGBAPNG } from "../src/io/png-encode.ts";
import { InputError } from "../src/core/types.ts";
import type { DotDocument } from "../src/core/types.ts";

export function defaultStoreDir(): string {
  return process.env.NONPAREILLE_DATA_DIR ?? join(homedir(), ".nonpareille", "docs");
}

export function createStore(rootDir: string) {
  async function ensureDir(): Promise<void> {
    await mkdir(rootDir, { recursive: true });
  }

  function validateId(id: string): void {
    if (!/^[a-z0-9]{1,32}$/.test(id)) throw new InputError(`Invalid document id: ${id}`);
  }

  function path(id: string, ext: string): string {
    validateId(id);
    return join(rootDir, `${id}.${ext}`);
  }

  return {
    async list(): Promise<{ id: string; name: string; width: number; height: number; updatedAt: string }[]> {
      await ensureDir();
      const entries = await readdir(rootDir, { withFileTypes: true });
      const items = await Promise.all(entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".meta.json"))
        .map(async (entry) => {
          const id = entry.name.slice(0, -".meta.json".length);
          if (!/^[a-z0-9]{1,32}$/.test(id)) return null;
          const [metaText, docText] = await Promise.all([
            readFile(path(id, "meta.json"), "utf8"),
            readFile(path(id, "dot.json"), "utf8"),
          ]);
          const meta = JSON.parse(metaText) as { name?: string; updatedAt?: string };
          const doc = parseDocument(docText);
          return { id, name: meta.name ?? id, width: doc.canvas.width, height: doc.canvas.height, updatedAt: meta.updatedAt ?? "" };
        }));
      return items.filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(id: string): Promise<DotDocument | null> {
      validateId(id);
      try {
        return parseDocument(await readFile(path(id, "dot.json"), "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async put(doc: DotDocument, meta: { id?: string; name?: string }): Promise<{ id: string }> {
      await ensureDir();
      let id = meta.id;
      if (id !== undefined) validateId(id);
      else {
        const bytes = new Uint8Array(10);
        crypto.getRandomValues(bytes);
        id = Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
      }
      const grid = documentToGrid(doc);
      const scale = Math.max(1, Math.floor(128 / grid.width));
      const canvas = { ...doc.canvas, dotW: scale, dotH: scale, gap: 0, margin: 0, gapColor: 0, background: 0 };
      const thumbnail = encodeRGBAPNG(renderRGBA(grid, canvas));
      const updatedAt = new Date().toISOString();
      await Promise.all([
        writeFile(path(id, "dot.json"), serializeDocument(doc), "utf8"),
        writeFile(path(id, "png"), thumbnail),
        writeFile(path(id, "meta.json"), JSON.stringify({ name: meta.name ?? id, updatedAt }), "utf8"),
      ]);
      return { id };
    },
    async thumbnail(id: string): Promise<Uint8Array | null> {
      validateId(id);
      try {
        return new Uint8Array(await readFile(path(id, "png")));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async remove(id: string): Promise<boolean> {
      validateId(id);
      const results = await Promise.all(["dot.json", "png", "meta.json"].map(async (ext) => {
        try {
          await rm(path(id, ext));
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw error;
        }
      }));
      return results.some(Boolean);
    },
  };
}

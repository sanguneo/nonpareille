import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { createGrid } from "../src/core/grid.ts";
import { InputError } from "../src/core/types.ts";
import { gridToDocument } from "../src/io/project.ts";
import { createStore } from "../server/store.ts";

test("store put/list/get/remove roundtrip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nonpareille-store-"));
  try {
    const store = createStore(dir);
    const grid = createGrid(2, 2, { colors: new Uint32Array([0, 0xff0000ff]) });
    grid.data.set([0, 1, 1, 0]);
    const doc = gridToDocument(grid);
    const { id } = await store.put(doc, { name: "sample" });
    expect(await store.list()).toEqual([{ id, name: "sample", width: 2, height: 2, updatedAt: expect.any(String) }]);
    expect(await store.get(id)).toEqual(doc);
    expect((await store.thumbnail(id))?.[0]).toBe(0x89);
    expect(await store.remove(id)).toBe(true);
    expect(await store.get(id)).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("store rejects path traversal ids", async () => {
  const store = createStore(tmpdir());
  await expect(store.get("../x")).rejects.toBeInstanceOf(InputError);
});

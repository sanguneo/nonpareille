import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/api.ts";
import { createFakeProvider } from "../server/fake-provider.ts";
import { createJobs } from "../server/jobs.ts";
import { createStore } from "../server/store.ts";
import { encodeRGBAPNG } from "../src/io/png-encode.ts";

let server: ReturnType<typeof Bun.serve>;
let base: string;
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "nonpareille-server-"));
  const app = createApp({ store: createStore(dir), jobs: createJobs(), providerFactory: () => createFakeProvider() });
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, routes: app.routes, fetch: app.fetch });
  base = server.url.href.replace(/\/$/, "");
});

afterAll(() => {
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

function gradientPng(): Uint8Array {
  const width = 64, height = 64, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([x * 4, y * 4, 128, 255], 4 * (y * width + x));
  return encodeRGBAPNG({ width, height, data });
}

function convertForm(): FormData {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(gradientPng())], { type: "image/png" }), "in.png");
  form.append("options", JSON.stringify({ width: 32, palette: "pico8" }));
  return form;
}

describe("server api", () => {
  test("health", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, name: "nonpareille" });
  });

  test("convert returns a 32-wide document and a png", async () => {
    const res = await fetch(`${base}/api/convert`, { method: "POST", body: convertForm() });
    const body = await res.json() as { document: { canvas: { width: number } }; stats: { width: number } };
    expect(body.document.canvas.width).toBe(32);
    expect(body.stats.width).toBe(32);
    const png = await fetch(`${base}/api/convert?format=png`, { method: "POST", body: convertForm() });
    expect(png.headers.get("content-type")).toBe("image/png");
  });

  test("procgen png", async () => {
    const res = await fetch(`${base}/api/procgen?format=png`, {
      method: "POST", body: JSON.stringify({ mask: "spaceship", seed: 42 }),
    });
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  test("gen job streams progress and a 32x32 document", async () => {
    const start = await fetch(`${base}/api/gen`, {
      method: "POST", body: JSON.stringify({ subject: "slime", width: 32, height: 32, palette: "pico8", seed: 3 }),
    });
    const { jobId } = await start.json() as { jobId: string };
    const text = await (await fetch(`${base}/api/jobs/${jobId}/events`)).text();
    const events = text.trim().split("\n\n").map((block) => {
      const [eventLine, dataLine] = block.split("\n");
      return { event: eventLine!.slice(7), data: JSON.parse(dataLine!.slice(6)) as Record<string, unknown> };
    });
    const stages = events.filter((e) => e.event === "progress").map((e) => e.data.stage);
    expect(stages).toContain("generating");
    expect(stages).toContain("done");
    const done = events.at(-1)!;
    expect(done.event).toBe("done");
    const result = done.data.result as { document: { canvas: { width: number; height: number } } };
    expect(result.document.canvas).toMatchObject({ width: 32, height: 32 });
  });

  test("docs create, list, get, delete", async () => {
    const converted = await (await fetch(`${base}/api/convert`, { method: "POST", body: convertForm() })).json() as { document: unknown };
    const created = await fetch(`${base}/api/docs`, {
      method: "POST", body: JSON.stringify({ document: converted.document, name: "gradient" }),
    });
    const { id } = await created.json() as { id: string };
    const list = await (await fetch(`${base}/api/docs`)).json() as { id: string; name: string }[];
    expect(list.find((d) => d.id === id)?.name).toBe("gradient");
    const got = await (await fetch(`${base}/api/docs/${id}`)).json();
    expect(got).toEqual(converted.document);
    expect((await fetch(`${base}/api/docs/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await fetch(`${base}/api/docs/${id}`)).status).toBe(404);
  });
});

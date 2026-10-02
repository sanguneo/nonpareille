import { z } from "zod";
import pkg from "../package.json" with { type: "json" };
import { convertWithReport, type ConvertOptions } from "../src/convert/pipeline.ts";
import { snapImage, type SnapOptions } from "../src/convert/snap.ts";
import { usedIndices } from "../src/core/grid.ts";
import { renderRGBA } from "../src/core/render.ts";
import { InputError, ProviderError, type DotDocument, type DotGrid, type Palette, type RGBA32 } from "../src/core/types.ts";
import { generateSprite } from "../src/gen/bollinger.ts";
import { generate } from "../src/gen/generate.ts";
import { MASKS } from "../src/gen/masks.ts";
import { buildImagePrompt, type GenSpec } from "../src/gen/prompt.ts";
import { getProvider } from "../src/gen/providers/index.ts";
import type { ImageProvider } from "../src/gen/providers/types.ts";
import { decodeImage } from "../src/io/decode.ts";
import { encodeRGBAPNG } from "../src/io/png-encode.ts";
import { documentToGrid, gridToDocument, parseDocument, serializeDocument } from "../src/io/project.ts";
import { toSVG } from "../src/io/svg.ts";
import { getPreset, PRESETS } from "../src/palette/presets.ts";
import { toHalfBlock } from "../src/text/halfblock.ts";
import type { createJobs } from "./jobs.ts";
import type { createStore } from "./store.ts";

type Req = Request & { params: Record<string, string> };
type Handler = (req: Req) => Response | Promise<Response>;

const MODEL_FOR_PROVIDER: Record<string, GenSpec["model"]> = {
  "codex-image": "codex-image",
  openai: "openai",
  "retro-diffusion": "retro-diffusion",
  comfyui: "sdxl-pixel-art-xl",
};

const hex = (c: RGBA32) => `#${(c >>> 8).toString(16).padStart(6, "0")}`;

const paletteSpec = z.union([z.string(), z.array(z.string())]);

/** Preset name | "auto:K" | list of "#rrggbb" (array or comma-separated string). */
function resolvePalette(spec: z.infer<typeof paletteSpec>): { kind: "fixed"; colors: RGBA32[] } | { kind: "auto"; k: number } {
  if (typeof spec === "string" && spec.startsWith("auto:")) {
    const k = Number(spec.slice(5));
    if (!Number.isInteger(k) || k < 1 || k > 256) throw new InputError(`Invalid automatic palette size: ${spec}`);
    return { kind: "auto", k };
  }
  if (typeof spec === "string" && !spec.includes("#")) {
    return { kind: "fixed", colors: Array.from(getPreset(spec).colors).filter((c) => (c & 255) !== 0) };
  }
  const list = Array.isArray(spec) ? spec : spec.split(",");
  return {
    kind: "fixed",
    colors: list.map((s) => {
      const m = /^\s*#?([0-9a-f]{6})\s*$/i.exec(s);
      if (!m) throw new InputError(`Invalid palette color: ${s}`);
      return (Number.parseInt(m[1]!, 16) * 0x100 + 0xff) >>> 0;
    }),
  };
}

function docJSON(doc: DotDocument): unknown {
  return JSON.parse(serializeDocument(doc));
}

function readDocument(raw: unknown): DotDocument {
  try {
    return parseDocument(JSON.stringify(raw));
  } catch (error) {
    throw new InputError(`Invalid document: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function errorResponse(error: unknown): Response {
  if (error instanceof InputError || error instanceof z.ZodError || error instanceof SyntaxError) {
    return json({ error: error instanceof z.ZodError ? z.prettifyError(error) : error.message }, 400);
  }
  if (error instanceof ProviderError) return json({ error: error.message }, 502);
  return json({ error: error instanceof Error ? error.message : String(error) }, 500);
}

function intParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  const value = raw === null ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 64) throw new InputError(`${name} must be an integer in 1..64`);
  return value;
}

function pngResponse(grid: DotGrid, scale: number, gap = 0): Response {
  const canvas = { width: grid.width, height: grid.height, dotW: scale, dotH: scale, gap, gapColor: 0, margin: 0, background: 0 };
  return new Response(new Uint8Array(encodeRGBAPNG(renderRGBA(grid, canvas))), { headers: { "Content-Type": "image/png" } });
}

async function readMultipart<T>(req: Request, schema: z.ZodType<T>): Promise<{ bytes: Uint8Array; options: T }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new InputError("expected multipart/form-data body");
  }
  const image = form.get("image");
  if (!(image instanceof Blob)) throw new InputError('multipart field "image" (file) is required');
  const text = form.get("options");
  const options = schema.parse(typeof text === "string" && text.trim() ? JSON.parse(text) : {});
  return { bytes: new Uint8Array(await image.arrayBuffer()), options };
}

async function decodeUpload(bytes: Uint8Array) {
  try {
    return await decodeImage(bytes);
  } catch (error) {
    throw new InputError(`Could not decode image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const convertSchema = z.object({
  width: z.number().int().min(1).max(4096),
  height: z.union([z.number().int().min(1).max(4096), z.literal("auto")]).optional(),
  fit: z.enum(["cover", "contain", "stretch"]).default("cover"),
  sample: z.enum(["center", "mean", "median", "mode", "dominant", "kcentroid", "contrast"]).default("kcentroid"),
  palette: paletteSpec.optional(),
  dither: z.enum(["none", "bayer2", "bayer4", "bayer8", "fs", "jjn", "stucki", "atkinson", "sierra", "yliluoma"]).default("none"),
  outlineExpand: z.boolean().optional(),
  orphans: z.boolean().optional(),
  outline: z.enum(["black", "selout"]).optional(),
});

const snapSchema = z.object({
  expect: z.tuple([z.number().int().min(1).max(4096), z.number().int().min(1).max(4096)]).optional(),
  palette: paletteSpec.optional(),
});

const procgenSchema = z.object({
  mask: z.string(),
  seed: z.number().int(),
  palette: paletteSpec.optional(),
  count: z.number().int().min(1).max(64).default(1),
});

const renderSchema = z.object({
  document: z.unknown(),
  scale: z.number().int().min(1).max(64).optional(),
  gap: z.number().int().min(0).max(64).optional(),
  format: z.enum(["png", "svg", "ansi"]),
});

const specSchema = z.object({
  subject: z.string().min(1),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  palette: paletteSpec,
  view: z.enum(["front", "side", "three-quarter", "top-down", "isometric"]).default("front"),
  outline: z.enum(["none", "black", "selout"]).default("none"),
  shading: z.enum(["flat", "cel", "soft"]).default("cel"),
});

const genSchema = specSchema.extend({
  provider: z.string().default("codex-image"),
  refs: z.array(z.string()).optional(),
  seed: z.number().int().optional(),
});

const docBodySchema = z.object({ document: z.unknown(), name: z.string().optional() });

function buildSpec(body: z.infer<typeof specSchema>, model: GenSpec["model"]): { spec: GenSpec; colors: RGBA32[] } {
  const palette = resolvePalette(body.palette);
  const colors = palette.kind === "fixed" ? palette.colors.filter((c) => (c & 255) !== 0) : [];
  return {
    colors,
    spec: {
      subject: body.subject, width: body.width, height: body.height, view: body.view,
      palette: palette.kind === "auto" ? { K: palette.k } : { K: colors.length },
      outline: body.outline, shading: body.shading, lightDir: "top-left", background: "key", model,
    },
  };
}

export function createApp(opts: {
  store: ReturnType<typeof createStore>;
  jobs: ReturnType<typeof createJobs>;
  providerFactory?: (id: string) => ImageProvider;
}) {
  const { store, jobs } = opts;
  const providerFactory = opts.providerFactory ?? ((id: string) => getProvider(id));
  const wrap = (handler: Handler): Handler => async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      return errorResponse(error);
    }
  };
  const body = async (req: Request): Promise<unknown> => {
    try {
      return await req.json();
    } catch {
      throw new InputError("expected a JSON body");
    }
  };
  const notFound = () => json({ error: "Not found" }, 404);

  const routes: Record<string, Partial<Record<"GET" | "POST" | "PUT" | "DELETE", Handler>>> = {
    "/api/health": { GET: () => json({ ok: true, name: "nonpareille", version: pkg.version }) },
    "/api/palettes": {
      GET: () => json(Object.entries(PRESETS).map(([name, colors]) => ({ name, colors: colors.map(hex) }))),
    },
    "/api/masks": { GET: () => json(Object.keys(MASKS)) },

    "/api/convert": {
      POST: async (req) => {
        const url = new URL(req.url);
        const { bytes, options } = await readMultipart(req, convertSchema);
        const o: ConvertOptions = {
          width: options.width,
          height: options.height ?? "auto",
          fit: options.fit,
          sample: options.sample,
          palette: options.palette === undefined ? { kind: "none" } : resolvePalette(options.palette),
          dither: options.dither,
          ...(options.outlineExpand ? { outlineExpand: true } : {}),
          ...(options.orphans ? { orphans: true } : {}),
          ...(options.outline ? { outline: options.outline } : {}),
        };
        const { grid } = convertWithReport(await decodeUpload(bytes), o);
        if (url.searchParams.get("format") === "png") return pngResponse(grid, intParam(url, "scale", 8));
        const used = usedIndices(grid);
        used.delete(0);
        return json({ document: docJSON(gridToDocument(grid)), stats: { width: grid.width, height: grid.height, colors: used.size } });
      },
    },

    "/api/snap": {
      POST: async (req) => {
        const url = new URL(req.url);
        const { bytes, options } = await readMultipart(req, snapSchema);
        const o: SnapOptions & { expect?: [number, number] } = {
          ...(options.expect ? { expect: options.expect } : {}),
          ...(options.palette === undefined ? {} : { palette: resolvePalette(options.palette) }),
        };
        const { grid, purity, confidence } = snapImage(await decodeUpload(bytes), o);
        if (url.searchParams.get("format") === "png") return pngResponse(grid, intParam(url, "scale", 8));
        return json({ document: docJSON(gridToDocument(grid)), report: { W: grid.width, H: grid.height, confidence, purity } });
      },
    },

    "/api/procgen": {
      POST: async (req) => {
        const url = new URL(req.url);
        const b = procgenSchema.parse(await body(req));
        const mask = MASKS[b.mask as keyof typeof MASKS];
        if (!mask) throw new InputError(`unknown mask "${b.mask}"; expected one of ${Object.keys(MASKS).join(", ")}`);
        let palette: Palette | undefined;
        if (b.palette !== undefined) {
          const resolved = resolvePalette(b.palette);
          if (resolved.kind !== "fixed") throw new InputError("procgen palette must be a preset or a color list");
          palette = { colors: Uint32Array.from([0, ...resolved.colors]) };
        }
        const sprites = Array.from({ length: b.count }, (_, i) =>
          generateSprite(mask, { seed: b.seed + i, ...(palette ? { palette } : {}) }));
        if (url.searchParams.get("format") === "png") return pngResponse(sprites[0]!, intParam(url, "scale", 8));
        return json({ documents: sprites.map((grid) => docJSON({ ...gridToDocument(grid), meta: { seed: b.seed, tool: "nonpareille procgen" } })) });
      },
    },

    "/api/render": {
      POST: async (req) => {
        const b = renderSchema.parse(await body(req));
        const doc = readDocument(b.document);
        const grid = documentToGrid(doc);
        const scale = b.scale ?? 8;
        const canvas = { ...doc.canvas, dotW: scale, dotH: scale, gap: b.gap ?? 0 };
        if (b.format === "png") return pngResponse(grid, scale, canvas.gap);
        if (b.format === "svg") return new Response(toSVG(grid, canvas), { headers: { "Content-Type": "image/svg+xml" } });
        return new Response(toHalfBlock(grid), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
    },

    "/api/prompt": {
      POST: async (req) => {
        const { spec, colors } = buildSpec(specSchema.parse(await body(req)), "codex-image");
        return json(buildImagePrompt(spec, colors));
      },
    },

    "/api/gen": {
      POST: async (req) => {
        const b = genSchema.parse(await body(req));
        const model = MODEL_FOR_PROVIDER[b.provider];
        if (!model) throw new InputError(`unknown provider "${b.provider}"; expected one of ${Object.keys(MODEL_FOR_PROVIDER).join(", ")}`);
        const { spec, colors } = buildSpec(b, model);
        if (b.seed !== undefined) spec.seed = b.seed;
        if (b.refs?.length) spec.styleRef = b.refs;
        const provider = providerFactory(b.provider);
        const { id } = jobs.start(async (progress) => {
          const { grid, report } = await generate(spec, provider, { paletteColors: colors, onProgress: progress });
          const doc = gridToDocument(grid);
          doc.meta = { source: b.provider, prompt: buildImagePrompt(spec, colors).prompt, tool: "nonpareille gen",
            ...(spec.seed !== undefined ? { seed: spec.seed } : {}) };
          return { document: docJSON(doc), report };
        });
        return json({ jobId: id }, 202);
      },
    },
    "/api/jobs/:id": {
      GET: (req) => {
        const job = jobs.get(req.params.id ?? "");
        return job ? json(job) : notFound();
      },
    },
    "/api/jobs/:id/events": {
      GET: (req) => {
        const id = req.params.id ?? "";
        return jobs.get(id) ? jobs.sseResponse(id, req) : notFound();
      },
    },

    "/api/docs": {
      GET: async () => json(await store.list()),
      POST: async (req) => {
        const b = docBodySchema.parse(await body(req));
        const result = await store.put(readDocument(b.document), b.name === undefined ? {} : { name: b.name });
        return json(result, 201);
      },
    },
    "/api/docs/:id": {
      GET: async (req) => {
        const doc = await store.get(req.params.id ?? "");
        return doc ? json(docJSON(doc)) : notFound();
      },
      PUT: async (req) => {
        const id = req.params.id ?? "";
        const b = docBodySchema.parse(await body(req));
        return json(await store.put(readDocument(b.document), { id, ...(b.name === undefined ? {} : { name: b.name }) }));
      },
      DELETE: async (req) => ((await store.remove(req.params.id ?? "")) ? json({ ok: true }) : notFound()),
    },
    "/api/docs/:id/thumb.png": {
      GET: async (req) => {
        const png = await store.thumbnail(req.params.id ?? "");
        return png ? new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } }) : notFound();
      },
    },
  };

  for (const methods of Object.values(routes)) {
    for (const method of Object.keys(methods) as (keyof typeof methods)[]) methods[method] = wrap(methods[method]!);
  }

  return {
    routes,
    fetch: (_req: Request): Response => notFound(),
  };
}

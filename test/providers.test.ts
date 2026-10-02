import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderError } from "../src/core/types.ts";
import { buildCodexArgs, createCodexImageProvider } from "../src/gen/providers/codex-image.ts";

// 1x1 PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function fakeSkill(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dot-fake-skill-"));
  mkdirSync(join(dir, "scripts"));
  writeFileSync(join(dir, "scripts", "gen.mjs"), script);
  return dir;
}

describe("codex-image provider", () => {
  test("buildCodexArgs produces the documented argv", () => {
    expect(buildCodexArgs("g.mjs", "p.txt", "o.png", [64, 32], ["a.png", "b.png"])).toEqual([
      "bun", "g.mjs", "--prompt-file", "p.txt", "--out", "o.png",
      "--size", "64x32", "--quality", "high", "--ref", "a.png", "--ref", "b.png",
    ]);
  });

  test("returns bytes of the PNG named in stdout JSON", async () => {
    const dir = fakeSkill(`
import { writeFileSync } from "node:fs";
const a = process.argv;
const out = a[a.indexOf("--out") + 1];
writeFileSync(out, Buffer.from("${PNG_B64}", "base64"));
console.log(JSON.stringify({ path: out, model: "fake" }));
`);
    const p = createCodexImageProvider({ skillDir: dir });
    const r = await p.generate({ prompt: "hi", size: [8, 8] });
    expect(r.png).toEqual(new Uint8Array(Buffer.from(PNG_B64, "base64")));
    expect(r.meta.model).toBe("fake");
  });

  test("non-zero exit raises ProviderError with stderr", async () => {
    const dir = fakeSkill(`console.error("auth expired"); process.exit(1);`);
    const p = createCodexImageProvider({ skillDir: dir });
    const err = await p.generate({ prompt: "hi", size: [8, 8] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as Error).message).toContain("auth expired");
  });

  test("missing gen.mjs raises ProviderError mentioning the env var", async () => {
    const p = createCodexImageProvider({ skillDir: join(tmpdir(), "dot-nonexistent-skill") });
    const err = await p.generate({ prompt: "hi", size: [8, 8] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as Error).message).toContain("NONPAREILLE_CODEX_IMAGE_SKILL_DIR");
  });
});

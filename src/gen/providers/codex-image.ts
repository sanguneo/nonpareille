import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderError } from "../../core/types.ts";
import type { ImageGenRequest, ImageGenResult, ImageProvider } from "./types.ts";

export interface CodexImageOptions {
  skillDir?: string;
  timeoutMs?: number;
}

export function buildCodexArgs(
  genScript: string,
  promptFile: string,
  outFile: string,
  size: [number, number],
  refs: string[] = [],
): string[] {
  const args = [
    "bun",
    genScript,
    "--prompt-file",
    promptFile,
    "--out",
    outFile,
    "--size",
    `${size[0]}x${size[1]}`,
    "--quality",
    "high",
  ];
  for (const r of refs) args.push("--ref", r);
  return args;
}

export function createCodexImageProvider(opts: CodexImageOptions = {}): ImageProvider {
  const timeoutMs = opts.timeoutMs ?? 300000;
  return {
    id: "codex-image",
    async generate(req: ImageGenRequest): Promise<ImageGenResult> {
      const skillDir =
        opts.skillDir ??
        process.env.NONPAREILLE_CODEX_IMAGE_SKILL_DIR ??
        join(homedir(), ".agents/skills/codex-image");
      const script = join(skillDir, "scripts", "gen.mjs");
      if (!existsSync(script)) {
        throw new ProviderError(
          `codex-image: ${script} not found; set NONPAREILLE_CODEX_IMAGE_SKILL_DIR to the codex-image skill directory`,
        );
      }
      const dir = await mkdtemp(join(tmpdir(), "dot-codex-"));
      try {
        const promptFile = join(dir, "prompt.txt");
        const outFile = join(dir, "out.png");
        await writeFile(promptFile, req.prompt, "utf8");
        const argv = buildCodexArgs(script, promptFile, outFile, req.size, req.refs);
        const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, timeoutMs);
        const [stdout, stderr, code] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        clearTimeout(timer);
        if (timedOut) throw new ProviderError(`codex-image: timed out after ${timeoutMs}ms\n${stderr}`);
        if (code !== 0) throw new ProviderError(`codex-image: exit ${code}\n${stderr.trim()}`);
        let meta: Record<string, unknown>;
        try {
          meta = JSON.parse(stdout) as Record<string, unknown>;
        } catch {
          throw new ProviderError(`codex-image: unparseable stdout: ${stdout.slice(0, 200)}`);
        }
        const path = typeof meta.path === "string" ? meta.path : outFile;
        let png: Uint8Array;
        try {
          png = new Uint8Array(await readFile(path));
        } catch (e) {
          throw new ProviderError(`codex-image: cannot read output ${path}: ${(e as Error).message}`);
        }
        return { png, meta };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

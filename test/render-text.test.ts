import { expect, test } from "bun:test";
import { run } from "../cli/commands/render.ts";

test("render ansi writes truecolor half-block text to stdout", async () => {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    expect(await run(["test/fixtures/heart.dot.txt", "--format", "ansi"])).toBe(0);
  } finally {
    process.stdout.write = originalWrite;
  }
  expect(output).toContain("\x1b[38;2;");
  expect(output).toContain("▀");
});

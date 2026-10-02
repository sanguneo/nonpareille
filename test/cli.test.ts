import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decode } from "fast-png";
import { main } from "../cli/main.ts";

test("nonpareille render scales heart.dot.txt to 128x128 png", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dot-cli-"));
  const out = join(dir, "sub", "heart.png");
  expect(await main(["render", "test/fixtures/heart.dot.txt", "--scale", "8", "-o", out])).toBe(0);
  const png = decode(readFileSync(out));
  expect(png.width).toBe(128);
  expect(png.height).toBe(128);
});

test("nonpareille new writes an empty document that renders", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dot-cli-"));
  const doc = join(dir, "a.dot.json");
  expect(await main(["new", "--size", "4x3", "--palette", "#ff0000", "-o", doc])).toBe(0);
  const out = join(dir, "a.svg");
  expect(await main(["render", doc, "--scale", "2", "-o", out])).toBe(0);
  expect(readFileSync(out, "utf8").startsWith("<svg")).toBe(true);
});

import { expect, test } from "bun:test";
import { parseArgs } from "../cli/args.ts";

test("boolean flag followed by a short flag does not swallow it", () => {
  const a = parseArgs(["in.png", "--json", "-o", "out.png"]);
  expect(a.positional).toEqual(["in.png"]);
  expect(a.flags.get("json")).toBe(true);
  expect(a.flags.get("out")).toBe("out.png");
});

test("single-letter flags and negative values", () => {
  const a = parseArgs(["extract", "-k", "4", "--dx", "-1"]);
  expect(a.flags.get("k")).toBe("4");
  expect(a.flags.get("dx")).toBe("-1");
});

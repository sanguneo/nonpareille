import { expect, test } from "bun:test";
import { main } from "../cli/main.ts";

test("cli --help exits 0", async () => {
  expect(await main(["--help"])).toBe(0);
});

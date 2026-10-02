#!/usr/bin/env bun
import { InputError, ProviderError } from "../src/core/types.ts";
import { commands } from "./registry.ts";

function printHelp(): void {
  const names = Object.keys(commands).sort();
  const lines = ["dot - dot (pixel-art) image engine", "", "usage: dot <command> [options]", "", "commands:"];
  for (const n of names) lines.push(`  ${n}`);
  lines.push("", "Run `dot <command> --help` for command options.");
  console.log(lines.join("\n"));
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return 0;
  }
  const load = commands[cmd];
  if (!load) {
    console.error(`unknown command: ${cmd}`);
    printHelp();
    return 2;
  }
  const mod = await load();
  if (rest.includes("--help") || rest.includes("-h")) {
    console.log(`dot ${cmd} - ${mod.summary}\n\n${mod.usage}`);
    return 0;
  }
  try {
    return await mod.run(rest);
  } catch (e) {
    if (e instanceof InputError) {
      console.error(`error: ${e.message}`);
      return 2;
    }
    if (e instanceof ProviderError) {
      console.error(`provider error: ${e.message}`);
      return 3;
    }
    throw e;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}

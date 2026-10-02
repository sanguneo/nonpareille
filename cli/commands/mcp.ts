import { runStdio } from "../../mcp/server.ts";
import type { CommandModule } from "./types.ts";

export const summary = "run the stdio MCP server for agent direct drawing";
export const usage = "usage: dot mcp   (speaks MCP over stdin/stdout until stdin closes)";

export async function run(_argv: string[]): Promise<number> {
  await runStdio();
  return 0;
}

const mod: CommandModule = { summary, usage, run };
export default mod;

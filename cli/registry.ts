import type { CommandModule } from "./commands/types.ts";

/**
 * Command registry. Each entry lazily imports cli/commands/<name>.ts.
 * Adding a command = adding ONE line here plus its module file.
 */
export const commands: Record<string, () => Promise<CommandModule>> = {
  new: () => import("./commands/new.ts"),
  render: () => import("./commands/render.ts"),
};

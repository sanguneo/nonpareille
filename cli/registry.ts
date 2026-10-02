import type { CommandModule } from "./commands/types.ts";

/**
 * Command registry. Each entry lazily imports cli/commands/<name>.ts.
 * Adding a command = adding ONE line here plus its module file.
 */
export const commands: Record<string, () => Promise<CommandModule>> = {
  bom: () => import("./commands/bom.ts"),
  convert: () => import("./commands/convert.ts"),
  "detect-grid": () => import("./commands/detect-grid.ts"),
  gen: () => import("./commands/gen.ts"),
  mcp: () => import("./commands/mcp.ts"),
  mosaic: () => import("./commands/mosaic.ts"),
  new: () => import("./commands/new.ts"),
  palette: () => import("./commands/palette.ts"),
  procgen: () => import("./commands/procgen.ts"),
  prompt: () => import("./commands/prompt.ts"),
  render: () => import("./commands/render.ts"),
  sheet: () => import("./commands/sheet.ts"),
  snap: () => import("./commands/snap.ts"),
};

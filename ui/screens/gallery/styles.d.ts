// Side-effect CSS imports (Bun bundles them into the page stylesheet); TS 5.6+ requires a matching module declaration.
// Belongs in ui/env.d.ts next to the asset declarations once the shell adopts it.
declare module "*.css" {}

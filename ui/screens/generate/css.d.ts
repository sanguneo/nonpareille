// Side-effect CSS imports (Bun bundles them into the page stylesheet).
// TypeScript 7 checks that side-effect imports resolve, so stylesheets need an ambient module.
declare module "*.css" {}

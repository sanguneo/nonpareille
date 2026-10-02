// Asset imports are rewritten to hashed URLs by Bun's bundler (HTML imports).
declare module "*.png" {
  const url: string;
  export default url;
}
declare module "*.webp" {
  const url: string;
  export default url;
}
declare module "*.svg" {
  const url: string;
  export default url;
}

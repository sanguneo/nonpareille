// Runs representative nonpareille CLI commands into out/examples/. Exits non-zero on any failure.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encode } from "fast-png";

const root = join(import.meta.dir, "..");
const out = join(root, "out", "examples");
const main = join(root, "cli", "main.ts");
mkdirSync(out, { recursive: true });

// Synthetic 16x16 pixel art upscaled 8x (128x128): a checker of four colors.
const colors = [[29, 43, 83], [255, 0, 77], [255, 236, 39], [0, 228, 54]] as const;
const W = 128, data = new Uint8Array(W * W * 4);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  const c = colors[((x >> 3) + (y >> 3) * 2 + ((x >> 5) ^ (y >> 5))) & 3]!;
  data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
}
const synth = join(out, "synthetic.png");
writeFileSync(synth, encode({ width: W, height: W, data, channels: 4 }));

const steps: string[][] = [
  ["new", "--size", "16x16", "--palette", "#1d2b53,#ff004d,#ffec27", "-o", join(out, "blank.dot.json")],
  ["render", join(out, "blank.dot.json"), "--scale", "8", "--gap", "1", "-o", join(out, "blank.png")],
  ["convert", synth, "--dots", "32", "--palette", "pico8", "--dither", "bayer4", "-o", join(out, "converted.png")],
  ["snap", synth, "--scale", "4", "-o", join(out, "snapped.png")],
  ["procgen", "--mask", "spaceship", "--seed", "42", "--count", "16", "--sheet", "--cols", "8", "-o", join(out, "ships.png")],
  ["palette", "ramp", "--base", "#b13e53", "-n", "5", "-o", join(out, "ramp.hex")],
  ["render", join(out, "blank.dot.json"), "--format", "ansi", "-o", join(out, "blank.ansi.txt")],
];

let failed = 0;
for (const args of steps) {
  const p = Bun.spawnSync(["bun", main, ...args], { stdout: "pipe", stderr: "pipe" });
  const ok = p.exitCode === 0;
  console.log(`${ok ? "ok  " : "FAIL"} dot ${args.join(" ")}`);
  if (!ok) {
    failed++;
    process.stderr.write(p.stderr.toString() + p.stdout.toString());
  }
}
console.log(failed ? `${failed} step(s) failed` : `all ${steps.length} steps passed -> ${out}`);
process.exit(failed ? 1 : 0);

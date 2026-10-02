import { pack } from "../core/color.ts";
import { InputError, ProviderError, type RGBA32, type RGBAImage } from "../core/types.ts";
import { decodePNG } from "./decode.ts";
import { getPreset } from "../palette/presets.ts";

type PaletteFormat = "hex" | "gpl" | "pal";

function fromHex(value: string): RGBA32 {
  if (!/^[\da-f]{6}$/i.test(value)) throw new InputError(`Invalid palette color: ${value}`);
  return (Number.parseInt(value, 16) * 0x100 + 0xff) >>> 0;
}

function toHex(color: RGBA32): string {
  return (color >>> 8).toString(16).padStart(8, "0").slice(-6).toUpperCase();
}

export function parsePaletteFile(text: string, format: PaletteFormat): RGBA32[] {
  const lines = text.replace(/\r/g, "").split("\n");
  if (format === "hex") {
    return lines.map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"))
      .map(fromHex);
  }
  if (format === "gpl") {
    if (lines[0]?.trim() !== "GIMP Palette") throw new InputError("Invalid GIMP palette header");
    return lines.slice(1).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("Name:") && !line.startsWith("Columns:"))
      .map((line) => {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)(?:\s+.*)?$/.exec(line);
        if (!match) throw new InputError(`Invalid GIMP palette color: ${line}`);
        return pack(Number(match[1]), Number(match[2]), Number(match[3]), 255);
      });
  }
  if (lines[0]?.trim() !== "JASC-PAL" || lines[1]?.trim() !== "0100") throw new InputError("Invalid JASC-PAL header");
  const count = Number(lines[2]?.trim());
  if (!Number.isInteger(count) || count < 0) throw new InputError("Invalid JASC-PAL color count");
  const colors = lines.slice(3).filter((line) => line.trim() !== "").map((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) throw new InputError(`Invalid JASC-PAL color: ${line}`);
    return pack(Number(match[1]), Number(match[2]), Number(match[3]), 255);
  });
  if (colors.length !== count) throw new InputError("JASC-PAL color count does not match data");
  return colors;
}

export function formatPaletteFile(colors: RGBA32[], format: PaletteFormat): string {
  const rgb = colors.map((color) => {
    const hex = toHex(color);
    return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  });
  if (format === "hex") return colors.map(toHex).join("\n") + "\n";
  if (format === "gpl") return `GIMP Palette\nName: Palette\nColumns: 0\n#\n${rgb.map((c) => `${c[0]} ${c[1]} ${c[2]}`).join("\n")}\n`;
  return `JASC-PAL\n0100\n${colors.length}\n${rgb.map((c) => `${c[0]} ${c[1]} ${c[2]}`).join("\n")}\n`;
}

export function paletteFromPNG(img: RGBAImage): RGBA32[] {
  const colors: RGBA32[] = [];
  const seen = new Set<RGBA32>();
  for (let i = 0; i < img.width * img.height; i++) {
    const p = i * 4;
    if (img.data[p + 3] !== 255) continue;
    const color = pack(img.data[p]!, img.data[p + 1]!, img.data[p + 2]!, 255);
    if (!seen.has(color)) { seen.add(color); colors.push(color); }
  }
  return colors;
}

export async function fetchLospec(slug: string): Promise<RGBA32[]> {
  try {
    const response = await fetch(`https://lospec.com/palette-list/${encodeURIComponent(slug)}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("colors" in body) || !Array.isArray(body.colors)) {
      throw new Error("Invalid Lospec response");
    }
    return body.colors.map((color: unknown) => {
      if (typeof color !== "string") throw new Error("Invalid Lospec color");
      return fromHex(color);
    });
  } catch (error) {
    throw new ProviderError(`Failed to fetch Lospec palette "${slug}": ${String(error)}`);
  }
}

export async function loadPaletteSpec(spec: string): Promise<{ kind: "fixed"; colors: RGBA32[] } | { kind: "auto"; k: number }> {
  if (spec.startsWith("auto:")) {
    const k = Number(spec.slice(5));
    if (!Number.isInteger(k) || k < 1) throw new InputError(`Invalid automatic palette size: ${spec}`);
    return { kind: "auto", k };
  }
  if (spec.startsWith("lospec:")) return { kind: "fixed", colors: await fetchLospec(spec.slice(7)) };
  try {
    const preset = getPreset(spec);
    if (preset) return { kind: "fixed", colors: Array.from(preset.colors) };
  } catch { /* unknown names are file paths */ }
  const lower = spec.toLowerCase();
  if (lower.endsWith(".png")) return { kind: "fixed", colors: paletteFromPNG(decodePNG(new Uint8Array(await Bun.file(spec).arrayBuffer()))) };
  const format = lower.endsWith(".hex") ? "hex" : lower.endsWith(".gpl") ? "gpl" : lower.endsWith(".pal") ? "pal" : undefined;
  if (!format) throw new InputError(`Unknown palette spec: ${spec}`);
  return { kind: "fixed", colors: parsePaletteFile(await Bun.file(spec).text(), format) };
}

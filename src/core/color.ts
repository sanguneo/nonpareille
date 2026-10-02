import type { RGBA32 } from "./types.ts";

export function pack(r: number, g: number, b: number, a: number): RGBA32 {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

export function unpack(c: RGBA32): [number, number, number, number] {
  return [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255];
}

export const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

export function srgbToLinear(v8: number): number {
  return SRGB_TO_LINEAR[Math.max(0, Math.min(255, Math.round(v8)))]!;
}

export function linearToSrgb8(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
}

export function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lp = Math.cbrt(l), mp = Math.cbrt(m), sp = Math.cbrt(s);
  return [
    0.2104542553 * lp + 0.793617785 * mp - 0.0040720468 * sp,
    1.9779984951 * lp - 2.428592205 * mp + 0.4505937099 * sp,
    0.0259040371 * lp + 0.7827717662 * mp - 0.808675766 * sp,
  ];
}

export function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const lp = L + 0.3963377774 * a + 0.2158037573 * b;
  const mp = L - 0.1055613458 * a - 0.0638541728 * b;
  const sp = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lp ** 3, m = mp ** 3, s = sp ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function rgbToOklab(r8: number, g8: number, b8: number): [number, number, number] {
  return linearRgbToOklab(srgbToLinear(r8), srgbToLinear(g8), srgbToLinear(b8));
}

export function oklabToRgb8(L: number, a: number, b: number): [number, number, number] {
  const [r, g, bl] = oklabToLinearRgb(L, a, b);
  return [linearToSrgb8(r), linearToSrgb8(g), linearToSrgb8(bl)];
}

export function oklabToOklch(L: number, a: number, b: number): [number, number, number] {
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
}

export function oklchToOklab(L: number, C: number, h: number): [number, number, number] {
  const rad = h * Math.PI / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

export function deltaE2(lab1: readonly number[], lab2: readonly number[]): number {
  return (lab1[0]! - lab2[0]!) ** 2 + (lab1[1]! - lab2[1]!) ** 2 + (lab1[2]! - lab2[2]!) ** 2;
}

export function deltaE(lab1: readonly number[], lab2: readonly number[]): number {
  return Math.sqrt(deltaE2(lab1, lab2));
}

export function rgba32ToOklab(c: RGBA32): [number, number, number] {
  const [r, g, b] = unpack(c);
  return rgbToOklab(r, g, b);
}

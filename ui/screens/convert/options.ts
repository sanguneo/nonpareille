import type { ConvertRequest, DitherMode, FitMode, OutlineMode, SampleMode, SnapRequest } from "../../api.ts";

/** Option model for the convert screen, its Korean labels, and the request builders. */

export type Mode = "convert" | "snap";

export type PaletteChoice = { kind: "none" } | { kind: "auto"; k: number } | { kind: "preset"; name: string };

export interface ConvertOptions {
  width: number;
  fit: FitMode;
  sample: SampleMode;
  palette: PaletteChoice;
  dither: DitherMode;
  outlineExpand: boolean;
  orphans: boolean;
  outline: OutlineMode | "none";
}

export interface SnapOptions {
  /** Expected dot size; null = detect automatically. */
  expectW: number | null;
  expectH: number | null;
  palette: PaletteChoice;
}

export const DEBOUNCE_MS = 250;
export const WIDTH_MIN = 8;
export const WIDTH_MAX = 128;
export const K_MIN = 2;
export const K_MAX = 64;
export const SIZE_MAX = 4096;
/** Largest preview magnification (plan 5.1: display scale x1..x16). */
export const SCALE_MAX = 16;
/** Below this grid-detection confidence the server treats the image as having no grid (plan 5.4). */
export const CONFIDENCE_MIN = 0.15;
/** Cell purity under this value is flagged in the report (plan 5.3). */
export const PURITY_WARN = 0.7;

export const DEFAULT_CONVERT: ConvertOptions = {
  width: 64,
  fit: "cover",
  sample: "kcentroid",
  palette: { kind: "auto", k: 16 },
  dither: "none",
  outlineExpand: false,
  orphans: false,
  outline: "none",
};

export const DEFAULT_SNAP: SnapOptions = { expectW: null, expectH: null, palette: { kind: "none" } };

export interface Choice<T extends string> {
  value: T;
  label: string;
}

export const MODE_OPTIONS: readonly Choice<Mode>[] = [
  { value: "convert", label: "변환 (사진·일러스트)" },
  { value: "snap", label: "스냅 (AI 가짜 도트)" },
];

export const FIT_OPTIONS: readonly Choice<FitMode>[] = [
  { value: "cover", label: "채우기 (가장자리 잘라냄)" },
  { value: "contain", label: "맞추기 (여백은 투명)" },
  { value: "stretch", label: "늘리기 (비율 무시)" },
];

export const SAMPLE_OPTIONS: readonly Choice<SampleMode>[] = [
  { value: "kcentroid", label: "k-중심 (경계 보존, 기본)" },
  { value: "mean", label: "평균 (부드러운 사진)" },
  { value: "median", label: "중앙값 (노이즈 억제)" },
  { value: "mode", label: "최빈값 (도트 이미지)" },
  { value: "dominant", label: "우세색" },
  { value: "contrast", label: "대비 보존 (가는 선)" },
  { value: "center", label: "셀 중심 1픽셀" },
];

export const DITHER_OPTIONS: readonly Choice<DitherMode>[] = [
  { value: "none", label: "없음" },
  { value: "bayer2", label: "Bayer 2×2" },
  { value: "bayer4", label: "Bayer 4×4" },
  { value: "bayer8", label: "Bayer 8×8" },
  { value: "fs", label: "Floyd–Steinberg" },
  { value: "jjn", label: "Jarvis–Judice–Ninke" },
  { value: "stucki", label: "Stucki" },
  { value: "atkinson", label: "Atkinson" },
  { value: "sierra", label: "Sierra" },
  { value: "yliluoma", label: "Yliluoma" },
];

export const OUTLINE_OPTIONS: readonly Choice<OutlineMode | "none">[] = [
  { value: "none", label: "없음" },
  { value: "black", label: "검정 (가장 어두운 색)" },
  { value: "selout", label: "선택적 (몸통색을 어둡게)" },
];

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Palette spec for the server: preset name | "auto:K" | undefined (keep sampled colors). */
export function paletteSpec(choice: PaletteChoice): string | undefined {
  if (choice.kind === "preset") return choice.name;
  if (choice.kind === "auto") return `auto:${choice.k}`;
  return undefined;
}

export function toConvertRequest(o: ConvertOptions): ConvertRequest {
  const palette = paletteSpec(o.palette);
  return {
    width: o.width,
    fit: o.fit,
    sample: o.sample,
    dither: o.dither,
    ...(palette === undefined ? {} : { palette }),
    ...(o.outlineExpand ? { outlineExpand: true } : {}),
    ...(o.orphans ? { orphans: true } : {}),
    ...(o.outline === "none" ? {} : { outline: o.outline }),
  };
}

export function toSnapRequest(o: SnapOptions): SnapRequest {
  const palette = paletteSpec(o.palette);
  const hasExpect = o.expectW !== null && o.expectH !== null;
  return {
    ...(hasExpect ? { expect: [o.expectW as number, o.expectH as number] as [number, number] } : {}),
    ...(palette === undefined ? {} : { palette }),
  };
}

/* ---------- Session (survives leaving for the editor and coming back) ---------- */

export interface Session {
  file: File | null;
  mode: Mode;
  convert: ConvertOptions;
  snap: SnapOptions;
}

let session: Session = { file: null, mode: "convert", convert: DEFAULT_CONVERT, snap: DEFAULT_SNAP };

export const getSession = (): Session => session;

export function saveSession(next: Session): void {
  session = next;
}

import { type CSSProperties, useId, useState } from "react";
import type { Palette, RGBA32 } from "../../../src/core/types.ts";
import type { PalettePreset } from "../../api.ts";
import { Button, Field, cx } from "../../components/index.ts";

/** "#rrggbb" of a packed color (alpha dropped, as the server's /api/palettes does). */
export const hexOf = (color: RGBA32): string => `#${(color >>> 8).toString(16).padStart(6, "0")}`;

/** Packed opaque color from "#rrggbb". */
export const rgbaOf = (hex: string): RGBA32 => (Number.parseInt(hex.slice(1, 7), 16) * 0x100 + 0xff) >>> 0;

export interface PalettePanelProps {
  palette: Palette;
  /** Selected (primary) palette index. */
  index: number;
  onSelect: (index: number) => void;
  onAdd: (color: RGBA32) => void;
  /** Presets from /api/palettes; null while loading or when the request failed. */
  presets: PalettePreset[] | null;
  presetsFailed: boolean;
  onPreset: (colors: RGBA32[]) => void;
}

export function PalettePanel({ palette, index, onSelect, onAdd, presets, presetsFailed, onPreset }: PalettePanelProps) {
  const presetId = useId();
  const [draft, setDraft] = useState(() => hexOf(palette.colors[index] ?? 0));

  return (
    <div className="editor_palette">
      <div className="editor_swatches" role="group" aria-label="팔레트 색">
        {Array.from(palette.colors, (color, i) => {
          const name = palette.names?.[i];
          const label = i === 0 ? "투명" : `${i}번 ${name ?? hexOf(color)}`;
          return (
            <button
              key={i}
              type="button"
              className={cx("editor_swatch", i === 0 && "editor_swatch_clear")}
              style={i === 0 ? undefined : ({ "--swatch": hexOf(color) } as CSSProperties)}
              aria-pressed={i === index}
              aria-label={label}
              title={label}
              onClick={() => onSelect(i)}
            />
          );
        })}
      </div>

      <div className="editor_palette_add wrap_row">
        <input
          type="color"
          className="editor_color_input"
          value={draft}
          aria-label="추가할 색"
          onChange={(event) => setDraft(event.target.value)}
        />
        <code className="editor_hex">{draft}</code>
        <Button variant="ghost" size="sm" onClick={() => onAdd(rgbaOf(draft))}>
          색 추가
        </Button>
      </div>

      <Field
        label="프리셋"
        htmlFor={presetId}
        hint="프리셋을 고르면 그림의 색이 가장 가까운 프리셋 색으로 바뀝니다. 되돌릴 수 있어요."
        error={presetsFailed ? "프리셋 목록을 불러오지 못했어요. 서버 연결을 확인해 주세요." : undefined}
      >
        <select
          id={presetId}
          value=""
          disabled={presets === null}
          onChange={(event) => {
            const preset = presets?.find((candidate) => candidate.name === event.target.value);
            if (preset) onPreset(preset.colors.map(rgbaOf));
          }}
        >
          <option value="">{presets === null ? (presetsFailed ? "사용할 수 없음" : "불러오는 중…") : "프리셋 선택…"}</option>
          {presets?.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name} · {preset.colors.length}색
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

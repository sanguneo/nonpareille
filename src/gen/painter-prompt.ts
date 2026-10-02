export interface PainterPromptSpec {
  width: number;
  height: number;
  keys: { key: string; hex: string; name?: string }[];
}

export function buildPainterPrompt(spec: PainterPromptSpec): string {
  const palette = spec.keys.map(({ key, hex, name }) =>
    `${key}: ${hex}${name === undefined ? "" : ` (${name})`}`,
  ).join("\n");
  return `You are drawing pixel art on a ${spec.width}x${spec.height} dot canvas.
Coordinates start at the top-left; x increases to the right and y increases downward. Valid coordinates are x=0..${spec.width - 1}, y=0..${spec.height - 1}.
Palette keys:
${palette}
Draw in this order: silhouette first, then outline, base colors, two levels of shading, and highlights. For a bilaterally symmetric subject, draw one half and use mirror.
Output DotText only: include @size, @palette, and @grid sections, with exactly ${spec.height} rows of ${spec.width} keys. Use only the listed palette keys; . is reserved for transparency.`;
}

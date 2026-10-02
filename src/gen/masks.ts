/**
 * Mask presets for zfedoran/pixel-sprite-generator (MIT), ported from
 * David Bollinger's pixelrobots/pixelspaceships mask conventions.
 * Values: -1 border, 0 empty, 1 optional body, 2 optional border/body.
 */
export const MASKS: Record<
  "spaceship" | "dragon" | "robot",
  { data: number[]; width: number; height: number; mirrorX: boolean; mirrorY: boolean }
> = {
  spaceship: {
    width: 6, height: 12, mirrorX: true, mirrorY: false,
    data: [
      0, 0, 0, 1, 0, 0,
      0, 0, 1, 1, 1, 0,
      0, 0, 1, 2, 1, 0,
      0, 1, 1, 2, 1, 1,
      0, 1, 2, 1, 2, 1,
      1, 1, 1, 1, 1, 1,
      1, 2, 1, 1, 2, 1,
      1, 1, 1, 2, 1, 1,
      0, 1, 1, 1, 1, 0,
      0, 0, 1, 1, 1, 0,
      0, 0, 1, 2, 1, 0,
      0, 0, 1, 1, 1, 0,
    ],
  },
  dragon: {
    width: 12, height: 12, mirrorX: true, mirrorY: false,
    data: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0,
      0, 0, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0,
      0, 1, 1, 2, 1, 1, 1, 1, 0, 0, 0, 0,
      1, 1, 2, 1, 1, 1, 2, 1, 1, 0, 0, 0,
      1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 0, 0,
      1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 0,
      0, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 0, 1, 1, 1, 2, 1, 1, 2, 1, 0, 0,
      0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0,
      0, 0, 1, 1, 2, 1, 1, 2, 1, 0, 0, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0,
    ],
  },
  robot: {
    width: 4, height: 11, mirrorX: true, mirrorY: false,
    data: [
      0, 1, 1, 0,
      1, 1, 1, 1,
      1, 2, 2, 1,
      1, 1, 1, 1,
      0, 1, 1, 0,
      1, 1, 1, 1,
      1, 2, 2, 1,
      1, 1, 1, 1,
      0, 1, 1, 0,
      0, 1, 1, 0,
      1, 1, 1, 1,
    ],
  },
};

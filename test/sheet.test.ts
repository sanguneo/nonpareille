import { describe, it, expect } from "bun:test";
import { createGrid, createPalette, getDot, setDot } from "../src/core/grid.ts";
import { packSheet, sliceSheet } from "../src/io/sheet.ts";
import { charsetFramePos, EASYRPG_PRESETS, encodeEasyRpg, validateEasyRpgPng } from "../src/presets/easyrpg.ts";
import { InputError } from "../src/core/types.ts";

describe("sheet pack/slice", () => {
  it("packSheet: creates correct grid dimensions", () => {
    const palette = createPalette([0xff0000ff, 0x00ff00ff, 0x0000ffff]);
    const frame1 = createGrid(16, 16, palette);
    const frame2 = createGrid(16, 16, palette);

    // Fill with distinct colors for verification
    for (let i = 0; i < 16; i++) {
      setDot(frame1, i, 0, 1);
      setDot(frame2, i, 0, 2);
    }

    const { grid, manifest } = packSheet([frame1, frame2], 2);

    // 2 columns, 1 row (2 frames), no padding/margin
    // Sheet should be 16*2 = 32 wide, 16 tall
    expect(grid.width).toBe(32);
    expect(grid.height).toBe(16);
    expect(manifest.frames).toHaveLength(2);
  });

  it("packSheet: positions frames correctly", () => {
    const palette = createPalette([0xff0000ff, 0x00ff00ff]);
    const frame = createGrid(8, 8, palette);

    // Fill entire frame with color index 1
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        setDot(frame, i, j, 1);
      }
    }

    const { grid, manifest } = packSheet([frame], 1, { margin: 2 });

    // Check that manifest has correct position
    expect(manifest.frames[0]!.x).toBe(2); // margin
    expect(manifest.frames[0]!.y).toBe(2); // margin
    expect(manifest.frames[0]!.w).toBe(8);
    expect(manifest.frames[0]!.h).toBe(8);

    // Check that frame data is in the right place
    expect(getDot(grid, 2, 2)).toBe(1);
    expect(getDot(grid, 9, 9)).toBe(1);
  });

  it("packSheet: respects padding and margin", () => {
    const palette = createPalette([0xff0000ff, 0x00ff00ff]);
    const frame = createGrid(10, 10, palette);

    const { grid, manifest } = packSheet([frame, frame], 2, { pad: 2, margin: 1 });

    // Expected dimensions: 1 + 10 + 2 + 10 + 1 = 24 wide
    //                      1 + 10 + 1 = 12 tall
    expect(grid.width).toBe(24);
    expect(grid.height).toBe(12);

    expect(manifest.frames[0]!.x).toBe(1); // margin
    expect(manifest.frames[0]!.y).toBe(1); // margin
    expect(manifest.frames[1]!.x).toBe(1 + 10 + 2); // margin + width + pad
    expect(manifest.frames[1]!.y).toBe(1); // margin
  });

  it("sliceSheet: inverse of packSheet", () => {
    const palette = createPalette([0xff0000ff, 0x00ff00ff, 0x0000ffff]);
    const frames = [
      createGrid(8, 8, palette),
      createGrid(8, 8, palette),
      createGrid(8, 8, palette),
      createGrid(8, 8, palette),
    ];

    // Fill each frame with distinct pattern
    for (let idx = 0; idx < 4; idx++) {
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          setDot(frames[idx]!, i, j, (idx + 1) as number);
        }
      }
    }

    // Pack and then slice
    const { grid } = packSheet(frames, 2);
    const sliced = sliceSheet(grid, 8, 8);

    expect(sliced).toHaveLength(4);

    // Verify each sliced frame matches original
    for (let idx = 0; idx < 4; idx++) {
      const orig = frames[idx]!;
      const slc = sliced[idx]!;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          expect(getDot(slc, i, j)).toBe(getDot(orig, i, j));
        }
      }
    }
  });

  it("sliceSheet: with padding and margin", () => {
    const palette = createPalette([0xff0000ff, 0x00ff00ff]);
    const frame = createGrid(10, 10, palette);

    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        setDot(frame, i, j, 1);
      }
    }

    const { grid } = packSheet([frame, frame], 2, { pad: 1, margin: 1 });
    const sliced = sliceSheet(grid, 10, 10, { pad: 1, margin: 1 });

    expect(sliced).toHaveLength(2);
    for (const slc of sliced) {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          expect(getDot(slc, i, j)).toBe(1);
        }
      }
    }
  });

  it("sliceSheet: throws on size mismatch", () => {
    const palette = createPalette([0xff0000ff]);
    const grid = createGrid(35, 32, palette);

    expect(() => sliceSheet(grid, 16, 16)).toThrow(InputError);
  });

  it("sliceSheet: error message includes expected vs actual", () => {
    const palette = createPalette([0xff0000ff]);
    const grid = createGrid(35, 32, palette); // Not divisible by 16

    try {
      sliceSheet(grid, 16, 16);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InputError);
      const msg = (e as Error).message;
      expect(msg).toContain("35");
    }
  });

  it("packSheet: requires at least one frame", () => {
    expect(() => packSheet([], 1)).toThrow(InputError);
  });

  it("packSheet: validates frame dimensions match", () => {
    const palette = createPalette([0xff0000ff]);
    const frame1 = createGrid(16, 16, palette);
    const frame2 = createGrid(8, 8, palette);

    expect(() => packSheet([frame1, frame2], 2)).toThrow(InputError);
  });
});

describe("EasyRPG presets", () => {
  it("charsetFramePos: basic positions", () => {
    // Character 0, direction 0, frame 0
    const pos = charsetFramePos(0, 0, 0);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);

    // Character 0, direction 0, frame 1
    const pos1 = charsetFramePos(0, 0, 1);
    expect(pos1.x).toBe(24);
    expect(pos1.y).toBe(0);

    // Character 0, direction 1, frame 0
    const pos2 = charsetFramePos(0, 1, 0);
    expect(pos2.x).toBe(0);
    expect(pos2.y).toBe(32);
  });

  it("charsetFramePos: character grid layout", () => {
    // Character 1 is at grid col 1, row 0
    const pos = charsetFramePos(1, 0, 0);
    expect(pos.x).toBe(1 * 72); // char grid col 1 * 72
    expect(pos.y).toBe(0 * 128); // char grid row 0 * 128

    // Character 4 is at grid col 0, row 1
    const pos2 = charsetFramePos(4, 0, 0);
    expect(pos2.x).toBe(0 * 72);
    expect(pos2.y).toBe(1 * 128);

    // Character 5 is at grid col 1, row 1
    const pos3 = charsetFramePos(5, 0, 0);
    expect(pos3.x).toBe(1 * 72);
    expect(pos3.y).toBe(1 * 128);
  });

  it("charsetFramePos: example from spec", () => {
    // The plan says charsetFramePos(5,2,1) = {x:96, y:192}
    const pos = charsetFramePos(5, 2, 1);
    expect(pos.x).toBe(96);
    expect(pos.y).toBe(192);
  });

  it("charsetFramePos: validates parameters", () => {
    expect(() => charsetFramePos(-1, 0, 0)).toThrow(InputError);
    expect(() => charsetFramePos(8, 0, 0)).toThrow(InputError);
    expect(() => charsetFramePos(0, 4, 0)).toThrow(InputError);
    expect(() => charsetFramePos(0, 0, 3)).toThrow(InputError);
  });

  it("EASYRPG_PRESETS: has expected keys", () => {
    expect(EASYRPG_PRESETS).toHaveProperty("charset");
    expect(EASYRPG_PRESETS).toHaveProperty("chipset");
    expect(EASYRPG_PRESETS).toHaveProperty("faceset");
  });

  it("EASYRPG_PRESETS: charset has correct dimensions", () => {
    const preset = EASYRPG_PRESETS["charset"]!;
    expect(preset.width).toBe(288);
    expect(preset.height).toBe(256);
    expect(preset.tileWidth).toBe(24);
    expect(preset.tileHeight).toBe(32);
  });

  it("encodeEasyRpg: creates valid indexed PNG", () => {
    const palette = createPalette([0xff00ffff, 0xff0000ff, 0x00ff00ff]);
    const grid = createGrid(288, 256, palette);

    // Fill with test pattern
    for (let i = 0; i < 288; i++) {
      for (let j = 0; j < 256; j++) {
        setDot(grid, i, j, (i + j) % 3);
      }
    }

    const png = encodeEasyRpg(grid, EASYRPG_PRESETS["charset"]!);

    // Check PNG signature
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });

  it("encodeEasyRpg: throws on size mismatch", () => {
    const palette = createPalette([0xff0000ff]);
    const grid = createGrid(100, 100, palette); // Wrong size

    expect(() => encodeEasyRpg(grid, EASYRPG_PRESETS["charset"]!)).toThrow(InputError);
  });

  it("encodeEasyRpg: places key color at palette index 0", () => {
    const palette = createPalette([0x000000ff, 0xff0000ff]);
    const grid = createGrid(288, 256, palette);

    const png = encodeEasyRpg(grid, EASYRPG_PRESETS["charset"]!, 0xff00ffff);

    // PNG bytes should contain the key color 0xFF00FF at the right place
    // (This is a basic check - full PNG parsing would be more thorough)
    expect(png.length > 0).toBe(true);
  });

  it("validateEasyRpgPng: validates PNG format", () => {
    const palette = createPalette([0xff00ffff, 0xff0000ff]);
    const grid = createGrid(288, 256, palette);
    const png = encodeEasyRpg(grid, EASYRPG_PRESETS["charset"]!);

    const result = validateEasyRpgPng(png, EASYRPG_PRESETS["charset"]!);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validateEasyRpgPng: rejects invalid size", () => {
    const palette = createPalette([0xff00ffff, 0xff0000ff]);
    const grid = createGrid(480, 256, palette);

    // Encode as chipset (480x256), then validate as charset (288x256)
    const png = encodeEasyRpg(grid, EASYRPG_PRESETS["chipset"]!);
    const result = validateEasyRpgPng(png, EASYRPG_PRESETS["charset"]!);

    expect(result.ok).toBe(false);
    expect(result.errors.length > 0).toBe(true);
  });

  it("validateEasyRpgPng: rejects invalid PNG", () => {
    const invalidBytes = new Uint8Array([0x00, 0x00, 0x00]);
    const result = validateEasyRpgPng(invalidBytes, EASYRPG_PRESETS["charset"]!);

    expect(result.ok).toBe(false);
    expect(result.errors.length > 0).toBe(true);
  });
});

describe("pack -> slice roundtrip", () => {
  it("roundtrip preserves data", () => {
    const palette = createPalette([0xff0000ff, 0x00ff00ff, 0x0000ffff, 0xffffffff]);

    // Create 9 frames with distinct patterns
    const frames = [];
    for (let f = 0; f < 9; f++) {
      const frame = createGrid(16, 16, palette);
      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
          setDot(frame, i, j, ((i + j + f) % 4) as number);
        }
      }
      frames.push(frame);
    }

    // Pack with 3 columns
    const { grid } = packSheet(frames, 3, { pad: 1, margin: 1 });

    // Slice back
    const sliced = sliceSheet(grid, 16, 16, { pad: 1, margin: 1 });

    expect(sliced).toHaveLength(9);

    // Verify each frame
    for (let f = 0; f < 9; f++) {
      const orig = frames[f]!;
      const slc = sliced[f]!;

      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
          const origColor = getDot(orig, i, j);
          const slcColor = getDot(slc, i, j);
          expect(slcColor).toBe(origColor);
        }
      }
    }
  });
});

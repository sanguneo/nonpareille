import { describe, expect, test } from "bun:test";
import { encode } from "fast-png";
import { decodeImage, decodePNG } from "../src/io/decode.ts";

describe("decodePNG", () => {
  test("decodes RGBA8 pixels", () => {
    const pixels = new Uint8Array([12, 34, 56, 78, 90, 123, 200, 255]);
    const png = encode({ width: 2, height: 1, data: pixels, channels: 4 });
    expect(decodePNG(png)).toEqual({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray(pixels),
    });
  });

  test("expands grayscale PNG to opaque RGBA8", () => {
    const png = encode({ width: 2, height: 1, data: new Uint8Array([0, 173]), channels: 1 });
    expect(decodePNG(png).data).toEqual(new Uint8ClampedArray([0, 0, 0, 255, 173, 173, 173, 255]));
  });

  test("expands palette PNG to RGBA8", () => {
    const png = encode({
      width: 2,
      height: 1,
      data: new Uint8Array([0, 1]),
      channels: 1,
      palette: [[10, 20, 30], [200, 150, 100]],
      transparency: new Uint16Array([255, 64]),
    });
    expect(decodePNG(png).data).toEqual(new Uint8ClampedArray([
      10, 20, 30, 255, 200, 150, 100, 255,
    ]));
  });
});

test("decodes JPEG through Bun.Image when available", async () => {
  const source = encode({
    width: 2,
    height: 2,
    data: new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]),
    channels: 4,
  });
  const jpeg = await new Bun.Image(source).jpeg().bytes();
  const result = await decodeImage(jpeg);
  expect([result.width, result.height]).toEqual([2, 2]);
});

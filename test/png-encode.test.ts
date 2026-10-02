import { describe, expect, test } from "bun:test";
import { decode } from "fast-png";
import { crc32, encodeIndexedPNG, encodeRGBAPNG } from "../src/io/png-encode.ts";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function findChunk(png: Uint8Array, type: string): Uint8Array | undefined {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8;
  while (o < png.length) {
    const len = v.getUint32(o);
    const t = String.fromCharCode(...png.subarray(o + 4, o + 8));
    if (t === type) return png.subarray(o + 8, o + 8 + len);
    o += 12 + len;
  }
  return undefined;
}

function unpack(data: ArrayLike<number>, w: number, h: number, bd: number): number[] {
  const rowBytes = Math.ceil((w * bd) / 8);
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const byte = data[y * rowBytes + Math.floor((x * bd) / 8)] as number;
      const shift = 8 - bd - ((x * bd) % 8);
      out.push((byte >> shift) & ((1 << bd) - 1));
    }
  }
  return out;
}

describe("png-encode", () => {
  test("crc32 matches known vector", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(crc32(bytes)).toBe(0xcbf43926);
  });

  for (const [bd, K] of [[1, 2], [2, 4], [4, 16], [8, 200]] as const) {
    test(`indexed roundtrip at bit depth ${bd}`, () => {
      const r = rng(bd);
      const w = 13;
      const h = 7;
      const palette = new Uint32Array(K);
      for (let i = 0; i < K; i++) palette[i] = (((r() * 0x1000000) << 8) | 0xff) >>> 0;
      const indices = new Uint8Array(w * h);
      for (let i = 0; i < indices.length; i++) indices[i] = Math.floor(r() * K);
      const png = encodeIndexedPNG({ width: w, height: h, indices, palette });
      const dec = decode(png);
      expect(dec.depth).toBe(bd);
      expect(Array.from(dec.palette!.map((c) => [c[0], c[1], c[2]]))).toEqual(
        Array.from(palette, (c) => [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255]),
      );
      expect(unpack(dec.data, w, h, bd)).toEqual(Array.from(indices));
    });
  }

  test("tRNS trims trailing opaque and is a single 00 when only index 0 is transparent", () => {
    const palette = Uint32Array.from([0x00000000, 0xff0000ff, 0x00ff00ff]);
    const png = encodeIndexedPNG({ width: 2, height: 2, indices: Uint8Array.from([0, 1, 2, 0]), palette });
    expect(Array.from(findChunk(png, "tRNS")!)).toEqual([0]);
  });

  test("tRNS omitted when all opaque", () => {
    const palette = Uint32Array.from([0xff0000ff, 0x00ff00ff]);
    const png = encodeIndexedPNG({ width: 1, height: 1, indices: Uint8Array.from([1]), palette });
    expect(findChunk(png, "tRNS")).toBeUndefined();
  });

  test("RGBA roundtrip on seeded 17x9 image", () => {
    const r = rng(42);
    const data = new Uint8ClampedArray(17 * 9 * 4);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(r() * 256);
    const dec = decode(encodeRGBAPNG({ width: 17, height: 9, data }));
    expect(dec.channels).toBe(4);
    expect(Array.from(dec.data)).toEqual(Array.from(data));
  });
});

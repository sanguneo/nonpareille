import { zlibSync } from "fflate";
import type { RGBAImage } from "../core/types.ts";
import { InputError } from "../core/types.ts";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

function ihdr(width: number, height: number, bitDepth: number, colorType: number): Uint8Array {
  const d = new Uint8Array(13);
  const v = new DataView(d.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  d[8] = bitDepth;
  d[9] = colorType;
  return d;
}

function assemble(parts: Uint8Array[]): Uint8Array {
  const total = SIGNATURE.length + parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  out.set(SIGNATURE, 0);
  let o = SIGNATURE.length;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function checkSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new InputError(`invalid image size ${width}x${height}`);
  }
}

export function encodeIndexedPNG(
  input: {
    width: number;
    height: number;
    indices: Uint16Array | Uint8Array;
    palette: Uint32Array;
  },
  opts?: { bitDepth?: 1 | 2 | 4 | 8 },
): Uint8Array {
  const { width, height, indices, palette } = input;
  checkSize(width, height);
  const K = palette.length;
  if (K < 1 || K > 256) throw new InputError(`palette size ${K} out of range 1..256`);
  if (indices.length !== width * height) {
    throw new InputError(`indices length ${indices.length} != ${width}*${height}`);
  }
  const auto = K <= 2 ? 1 : K <= 4 ? 2 : K <= 16 ? 4 : 8;
  const bd = opts?.bitDepth ?? auto;
  if (bd < auto) throw new InputError(`bitDepth ${bd} too small for palette of ${K} colors`);

  const rowBytes = Math.ceil((width * bd) / 8);
  const raw = new Uint8Array((rowBytes + 1) * height);
  const perByte = 8 / bd;
  for (let y = 0; y < height; y++) {
    const base = y * (rowBytes + 1) + 1; // filter byte 0 already
    for (let x = 0; x < width; x++) {
      const idx = indices[y * width + x] as number;
      if (idx >= K) throw new InputError(`index ${idx} >= palette size ${K}`);
      const shift = 8 - bd * ((x % perByte) + 1);
      const p = base + Math.floor(x / perByte);
      raw[p] = (raw[p] as number) | (idx << shift);
    }
  }

  const plte = new Uint8Array(3 * K);
  const alphas = new Uint8Array(K);
  for (let i = 0; i < K; i++) {
    const c = palette[i] as number;
    plte[3 * i] = (c >>> 24) & 0xff;
    plte[3 * i + 1] = (c >>> 16) & 0xff;
    plte[3 * i + 2] = (c >>> 8) & 0xff;
    alphas[i] = c & 0xff;
  }
  let n = K;
  while (n > 0 && alphas[n - 1] === 255) n--;

  const parts = [chunk("IHDR", ihdr(width, height, bd, 3)), chunk("PLTE", plte)];
  if (n > 0) parts.push(chunk("tRNS", alphas.subarray(0, n)));
  parts.push(chunk("IDAT", zlibSync(raw, { level: 9 })));
  parts.push(chunk("IEND", new Uint8Array(0)));
  return assemble(parts);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function encodeRGBAPNG(img: RGBAImage): Uint8Array {
  const { width, height, data } = img;
  checkSize(width, height);
  if (data.length !== 4 * width * height) {
    throw new InputError(`data length ${data.length} != 4*${width}*${height}`);
  }
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = data[row + i] as number;
      const a = i >= 4 ? (data[row + i - 4] as number) : 0;
      const b = y > 0 ? (data[row - stride + i] as number) : 0;
      const c = y > 0 && i >= 4 ? (data[row - stride + i - 4] as number) : 0;
      cand[0]![i] = x;
      cand[1]![i] = (x - a) & 0xff;
      cand[2]![i] = (x - b) & 0xff;
      cand[3]![i] = (x - ((a + b) >> 1)) & 0xff;
      cand[4]![i] = (x - paeth(a, b, c)) & 0xff;
    }
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const arr = cand[f]!;
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const v = arr[i] as number;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    const o = y * (stride + 1);
    raw[o] = best;
    raw.set(cand[best]!, o + 1);
  }
  return assemble([
    chunk("IHDR", ihdr(width, height, 8, 6)),
    chunk("IDAT", zlibSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

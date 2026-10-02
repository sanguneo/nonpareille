import type { Histogram } from "./histogram.ts";

interface Box { ids: number[]; sse: number; variance: number[]; axis: number }
function summarize(ids: number[], hist: Histogram): Box {
  const total = ids.reduce((s, i) => s + hist.weights[i]!, 0);
  const mean = [0, 0, 0];
  for (const i of ids) for (let d = 0; d < 3; d++) mean[d]! += hist.lab[i * 3 + d]! * hist.weights[i]!;
  for (let d = 0; d < 3; d++) mean[d] = mean[d]! / total;
  const variance = [0, 0, 0];
  for (const i of ids) for (let d = 0; d < 3; d++) variance[d]! += hist.weights[i]! * (hist.lab[i * 3 + d]! - mean[d]!) ** 2 / total;
  const axis = variance.indexOf(Math.max(...variance));
  return { ids, variance, axis, sse: total * variance.reduce((a, b) => a + b, 0) };
}

export function medianCut(hist: Histogram, K: number): Float32Array {
  if (K < 1 || !Number.isInteger(K)) throw new RangeError("K must be a positive integer");
  if (!hist.colors.length) return new Float32Array(K * 3);
  const boxes = [summarize(Array.from({ length: hist.colors.length }, (_, i) => i), hist)];
  while (boxes.length < K) {
    let bi = -1;
    for (let i = 0; i < boxes.length; i++) if (boxes[i]!.ids.length > 1 &&
        (bi < 0 || boxes[i]!.sse > boxes[bi]!.sse)) bi = i;
    if (bi < 0) break;
    const box = boxes.splice(bi, 1)[0]!;
    const axis = box.axis;
    const sorted = box.ids.slice().sort((a, b) =>
      hist.lab[a * 3 + axis]! - hist.lab[b * 3 + axis]! || a - b);
    const half = sorted.reduce((s, i) => s + hist.weights[i]!, 0) / 2;
    let cumulative = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      cumulative += hist.weights[sorted[i]!]!;
      if (cumulative >= half) { cut = i + 1; break; }
    }
    boxes.push(summarize(sorted.slice(0, cut), hist), summarize(sorted.slice(cut), hist));
  }
  const out = new Float32Array(K * 3);
  boxes.forEach((box, k) => {
    const total = box.ids.reduce((s, i) => s + hist.weights[i]!, 0);
    for (const i of box.ids) for (let d = 0; d < 3; d++) {
      const index = k * 3 + d;
      out[index] = out[index]! + hist.lab[i * 3 + d]! * hist.weights[i]! / total;
    }
  });
  return out;
}

export function pixelPerfect(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points.slice();
  const result: [number, number][] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = result[result.length - 1]!;
    const [x, y] = points[i]!;
    const [cx, cy] = points[i + 1]!;
    if (Math.abs(ax - cx) === 1 && Math.abs(ay - cy) === 1 &&
        Math.abs(ax - x) + Math.abs(ay - y) === 1 &&
        Math.abs(cx - x) + Math.abs(cy - y) === 1) continue;
    result.push(points[i]!);
  }
  result.push(points[points.length - 1]!);
  return result;
}

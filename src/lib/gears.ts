// Shared by the department mark and the events page, so every gear on the site has the same teeth.

// A gear outline: `teeth` tapered teeth of height `depth` around a circle of radius `root`, the
// first tooth starting `phase` degrees round from the right.
export function gearPath(cx: number, cy: number, root: number, depth: number, teeth: number, phase: number): string {
  const step = 360 / teeth;
  const point = (degrees: number, radius: number) => {
    const angle = (degrees * Math.PI) / 180;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  };
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const start = phase + i * step;
    points.push(point(start, root), point(start + step * 0.18, root + depth), point(start + step * 0.42, root + depth), point(start + step * 0.6, root));
  }
  return `M${points.join("L")}Z`;
}

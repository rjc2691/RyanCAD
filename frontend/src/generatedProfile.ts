/** One derived profile supplies both the viewport outline and reference-card drawing. */
export function generatedProfileDrawing(profile: any) {
  if (!profile?.loops?.length || !profile.origin || !profile.u || !profile.normal) return null;
  const [nx, ny, nz] = profile.normal, [ux, uy, uz] = profile.u;
  const v = [ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux];
  const loops: number[][][] = profile.loops.map((loop: number[][]) => loop.map(point => {
    const p = point.map((value, i) => value - profile.origin[i]);
    return [p.reduce((sum, value, i) => sum + value * profile.u[i], 0), p.reduce((sum, value, i) => sum + value * v[i], 0)];
  }));
  const points = loops.flat();
  if (!points.length || points.some(p => p.some(value => !Number.isFinite(value)))) return null;
  const low = [0, 1].map(i => Math.min(...points.map(p => p[i])));
  const high = [0, 1].map(i => Math.max(...points.map(p => p[i])));
  const width = high[0] - low[0], height = high[1] - low[1];
  if (Math.max(width, height) < 1e-9) return null;
  const scale = Math.min(96 / Math.max(width, 1e-9), 64 / Math.max(height, 1e-9));
  const project = (point: number[]) => [56 + (point[0] - (high[0] + low[0]) / 2) * scale, 40 - (point[1] - (high[1] + low[1]) / 2) * scale];
  return loops.map(loop => loop.map((point, index) => `${index ? "L" : "M"}${project(point).map(value => value.toFixed(3)).join(" ")}`).join(" ") + " Z").join(" ");
}

import * as THREE from "three";
import {
  formatMeasurement,
  type Candidate,
  type FaceMeasure,
  type RankedCandidate,
  type Rect,
  type ScoreContext,
  type Vec3,
} from "./MeasurementService.ts";

export interface MeasurementSurface extends FaceMeasure {
  occurrence: string;
  /** Native face tessellation in component coordinates, including holes. */
  triangles: [Vec3, Vec3, Vec3][];
}
export interface SurfacePlacement {
  candidate: Candidate;
  face: MeasurementSurface;
  label: string;
  score: number;
  signals: Record<string, number>;
  /** SVG affine projection of the actual face basis; never a billboard. */
  matrix: [number, number, number, number, number, number];
  rect: Rect;
  width: number;
  hover: boolean;
}
export interface SurfaceContext extends ScoreContext {
  facing: (face: MeasurementSurface) => number;
  visiblePoint: (occurrence: string, point: Vec3) => boolean;
}
const vector = (p: number[]) => new THREE.Vector3().fromArray(p);
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
const triangleCache = new WeakMap<
  MeasurementSurface,
  {
    triangle: THREE.Triangle;
    min: Vec3;
    max: Vec3;
  }[]
>();

export function onSurface(face: MeasurementSurface, point: Vec3): boolean {
  const p = vector(point),
    tolerance = Math.max(1e-5, Math.hypot(...face.bounds.size) * 1e-6);
  if (
    Math.abs(p.clone().sub(vector(face.center)).dot(vector(face.normal))) >
    tolerance
  )
    return false;
  if (
    point.some(
      (v, i) =>
        v < face.bounds.min[i] - tolerance ||
        v > face.bounds.max[i] + tolerance,
    )
  )
    return false;
  let triangles = triangleCache.get(face);
  if (!triangles) {
    triangles = face.triangles.map(([a, b, c]) => ({
      triangle: new THREE.Triangle(vector(a), vector(b), vector(c)),
      min: a.map((v, i) => Math.min(v, b[i], c[i])) as Vec3,
      max: a.map((v, i) => Math.max(v, b[i], c[i])) as Vec3,
    }));
    triangleCache.set(face, triangles);
  }
  const closest = new THREE.Vector3();
  return triangles.some(({ triangle, min, max }) => {
    if (point.some((v, i) => v < min[i] - tolerance || v > max[i] + tolerance))
      return false;
    return (
      triangle.closestPointToPoint(p, closest).distanceToSquared(p) <
      tolerance ** 2
    );
  });
}

/** Placement is independent of DOM/Three scene state. The adapter supplies
 * projection and occlusion; the attention service still ranks every candidate.
 * Surface suitability, local free space and camera legibility score alternatives.
 */
export function placeSurfaceMeasurements(
  ranked: RankedCandidate[],
  faces: MeasurementSurface[],
  context: SurfaceContext,
  maxCount = context.selected ? 8 : 5,
): SurfacePlacement[] {
  const placed: SurfacePlacement[] = [],
    groups = new Set<string>();
  const faceCounts = new Map<string, number>();
  for (const item of ranked.slice(0, 48)) {
    if (placed.length >= maxCount) break;
    const c = item.candidate;
    if (item.score < 25 || !Number.isFinite(item.score) || groups.has(c.group))
      continue;
    const label = formatMeasurement(c, context.units),
      width = label.length * 8.4 + 10;
    let best: SurfacePlacement | undefined;
    for (const face of faces) {
      if (face.occurrence !== c.occurrence || face.type !== "PLANE") continue;
      const key = `${face.occurrence}:${face.id}`;
      if ((faceCounts.get(key) || 0) >= 4 || context.facing(face) < 0.16)
        continue;
      if (
        c.kind === "area"
          ? c.entity !== `face:${face.id}`
          : ![c.a, c.b, c.anchor].every((p) => onSurface(face, p))
      )
        continue;
      const n = vector(face.normal).normalize();
      let u = vector(c.b).sub(vector(c.a));
      if (u.lengthSq() < 1e-10)
        u = new THREE.Vector3(1, 0, 0).projectOnPlane(n);
      if (u.lengthSq() < 1e-10)
        u = new THREE.Vector3(0, 1, 0).projectOnPlane(n);
      u.normalize();
      const anchor = vector(c.anchor),
        a = context.project(c.occurrence, c.anchor);
      let ux = context.project(
        c.occurrence,
        anchor.clone().add(u).toArray() as Vec3,
      );
      if (ux.x < a.x || (Math.abs(ux.x - a.x) < 0.01 && ux.y > a.y)) u.negate();
      const v = n.clone().cross(u).normalize();
      ux = context.project(
        c.occurrence,
        anchor.clone().add(u).toArray() as Vec3,
      );
      const vy = context.project(
        c.occurrence,
        anchor.clone().add(v).toArray() as Vec3,
      );
      const dx = ux.x - a.x,
        dy = ux.y - a.y,
        ex = vy.x - a.x,
        ey = vy.y - a.y;
      const aa = dx * dx + dy * dy,
        bb = dx * ex + dy * ey,
        cc = ex * ex + ey * ey;
      // Normalize by the plane's largest projected scale, not by the edge.
      // End-on edges therefore compress their text instead of stretching its height.
      const scale =
        1 / Math.sqrt((aa + cc + Math.sqrt((aa - cc) ** 2 + 4 * bb * bb)) / 2);
      if (!Number.isFinite(scale)) continue;
      // Nominal glyph size stays bounded while its two axes retain the
      // face's skew and foreshortening. No counter-rotation towards the camera.
      const offsets = c.kind === "area" ? [0] : [14, 23, 34];
      for (const fraction of [0.5, 0.3, 0.7])
        for (const sign of [1, -1])
          for (const offset of offsets) {
            const center =
              c.kind === "area" || c.kind === "curve"
                ? anchor.clone()
                : vector(c.a).lerp(vector(c.b), fraction);
            center.addScaledVector(v, sign * offset * scale);
            const samples: Vec3[] = [];
            for (const x of [-width / 2, -width / 4, 0, width / 4, width / 2])
              for (const y of [-10, 0, 10])
                samples.push(
                  center
                    .clone()
                    .addScaledVector(u, x * scale)
                    .addScaledVector(v, y * scale)
                    .toArray() as Vec3,
                );
            if (!samples.every((p) => onSurface(face, p))) continue;
            const projected = samples.map((p) =>
              context.project(c.occurrence, p),
            );
            if (projected.some((p) => !p.visible)) continue;
            const xs = projected.map((p) => p.x),
              ys = projected.map((p) => p.y);
            const rect = {
              x: Math.min(...xs) - 3,
              y: Math.min(...ys) - 3,
              width: Math.max(...xs) - Math.min(...xs) + 6,
              height: Math.max(...ys) - Math.min(...ys) + 6,
            };
            if (
              Math.max(...ys) - Math.min(...ys) < 4 ||
              width * Math.sqrt(aa) * scale < 23 ||
              context.reserved.some((r) => overlap(rect, r)) ||
              placed.some((p) => overlap(rect, p.rect))
            )
              continue;
            const origin = context.project(
                c.occurrence,
                center.toArray() as Vec3,
              ),
              px = context.project(
                c.occurrence,
                center.clone().addScaledVector(u, scale).toArray() as Vec3,
              ),
              py = context.project(
                c.occurrence,
                center.clone().addScaledVector(v, -scale).toArray() as Vec3,
              );
            // Hide the complete label if any of its corners or center is occluded.
            if (
              ![
                samples[0],
                samples[2],
                samples[7],
                samples[12],
                samples[14],
              ].every((p) => context.visiblePoint(c.occurrence, p))
            )
              continue;
            const focusedFace = [context.selected, context.hovered].some(
              (f) => f?.occurrence === c.occurrence && f.face?.id === face.id,
            );
            const surfaceScore =
              context.facing(face) * 12 +
              (focusedFace ? 8 : 0) -
              offset * 0.1 -
              Math.abs(fraction - 0.5) * 8;
            const next: SurfacePlacement = {
              candidate: c,
              face,
              label,
              score: item.score + surfaceScore,
              signals: { ...item.signals, surface: surfaceScore },
              width,
              rect,
              matrix: [
                px.x - origin.x,
                px.y - origin.y,
                py.x - origin.x,
                py.y - origin.y,
                origin.x,
                origin.y,
              ],
              hover:
                context.hovered?.occurrence === c.occurrence &&
                context.hovered.entity === c.entity,
            };
            if (!best || next.score > best.score) best = next;
            // Further offsets only cost more once this face has a valid fit.
            break;
          }
    }
    if (best) {
      placed.push(best);
      groups.add(c.group);
      const key = `${best.face.occurrence}:${best.face.id}`;
      faceCounts.set(key, (faceCounts.get(key) || 0) + 1);
    }
  }
  return placed;
}

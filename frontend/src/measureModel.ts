import type { Selection, State } from "./types";
import { referenceLabel } from "./geometryLabels.ts";

/** Ephemeral samples in design coordinates, never associative constraints. */
export interface MeasurePoint {
  point: number[];
  selection: Selection;
  label: string;
  detail?: { name: string; value: number; power: 1 | 2 };
}
export function measurePoint(
  selection: Selection | null,
  state: State,
): MeasurePoint | null {
  if (!selection) return null;
  if (selection.worldOrigin)
    return { selection, point: [0, 0, 0], label: "World origin" };
  const local = selection.vertex?.point || selection.point;
  const occurrence = state.occurrences.find(
    (o) => o.id === selection.occurrence,
  );
  if (
    !local ||
    local.length !== 3 ||
    !local.every(Number.isFinite) ||
    !occurrence
  )
    return null;
  const point = occurrence.matrix
    .slice(0, 3)
    .map((row) => row[3] + local.reduce((sum, v, i) => sum + row[i] * v, 0));
  if (!point.every(Number.isFinite)) return null;
  const edge = selection.edge,
    face = selection.face;
  const detail =
    !selection.vertex && edge && Number.isFinite(edge.length)
      ? { name: "Edge length", value: edge.length, power: 1 as const }
      : face && Number.isFinite(face.area)
        ? { name: "Face area", value: face.area, power: 2 as const }
        : undefined;
  return { selection, point, label: referenceLabel(selection, state), detail };
}
export function measureVector(a: number[], b: number[]) {
  const delta = b.map((v, i) => v - a[i]),
    distance = Math.hypot(...delta);
  return {
    delta,
    distance,
    direction: distance > 1e-12 ? delta.map((v) => v / distance) : null,
  };
}
export function captureMeasurePoint(
  points: MeasurePoint[],
  next: MeasurePoint,
  add = false,
  replace: number | null = null,
): MeasurePoint[] {
  if (replace !== null && replace >= 0 && replace < points.length)
    return points.map((p, i) => (i === replace ? next : p));
  if (add) {
    const index = points.findIndex(
      (p) =>
        p.selection.occurrence === next.selection.occurrence &&
        Math.hypot(...p.point.map((v, i) => v - next.point[i])) < 1e-7,
    );
    return index < 0 ? [...points, next] : points.filter((_, i) => i !== index);
  }
  return points.length >= 2 ? [next] : [...points, next];
}
export const pointLetter = (i: number) =>
  i < 26 ? String.fromCharCode(65 + i) : String(i + 1);

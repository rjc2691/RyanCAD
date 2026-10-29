import * as THREE from "three";
import { explodedLayout } from "./explodedView.ts";
import type { Geometry, Occurrence } from "./types";
export interface SectionSettings {
  axis: "X" | "Y" | "Z";
  offset: number;
  flipped: boolean;
  reference?: { label: string; origin: number[]; normal: number[] };
}
export function updateSectionPlane(
  settings: SectionSettings,
  plane = new THREE.Plane(),
) {
  const index = "XYZ".indexOf(settings.axis),
    sign = settings.flipped ? -1 : 1;
  if (settings.reference) {
    plane.normal.fromArray(settings.reference.normal).normalize();
    plane.constant =
      -plane.normal.dot(
        new THREE.Vector3().fromArray(settings.reference.origin),
      ) - settings.offset;
    if (settings.flipped) plane.negate();
  } else {
    plane.normal.set(0, 0, 0).setComponent(index, sign);
    plane.constant = -sign * settings.offset;
  }
  return plane;
}
export function sectionKeeps(
  point: { x: number; y: number; z: number },
  plane?: THREE.Plane,
) {
  return plane
    ? plane.normal.x * point.x +
        plane.normal.y * point.y +
        plane.normal.z * point.z +
        plane.constant >=
        -1e-6
    : point.y >= -1e-6;
}
export function sectionRange(
  settings: SectionSettings,
  occurrences: Occurrence[],
  geometry: Record<string, Geometry>,
  explode: number,
) {
  const { collection } = explodedLayout(
    occurrences.filter((o) => o.visible),
    geometry,
    explode,
  );
  const index = "XYZ".indexOf(settings.axis);
  if (settings.reference && !collection.isEmpty()) {
    const normal = new THREE.Vector3()
      .fromArray(settings.reference.normal)
      .normalize();
    const origin = new THREE.Vector3().fromArray(settings.reference.origin);
    const projected = [];
    for (const x of [collection.min.x, collection.max.x])
      for (const y of [collection.min.y, collection.max.y])
        for (const z of [collection.min.z, collection.max.z])
          projected.push(new THREE.Vector3(x, y, z).sub(origin).dot(normal));
    const lo = Math.min(...projected),
      hi = Math.max(...projected),
      padding = Math.max((hi - lo) * 0.05, 1);
    return { min: lo - padding, max: hi + padding, center: (lo + hi) / 2 };
  }
  let min = collection.isEmpty() ? -50 : collection.min.getComponent(index),
    max = collection.isEmpty() ? 50 : collection.max.getComponent(index);
  const center = (min + max) / 2,
    pad = Math.max((max - min) * 0.05, 1);
  return { min: min - pad, max: max + pad, center };
}

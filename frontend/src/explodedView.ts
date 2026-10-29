import * as THREE from "three";
import type { Geometry, Occurrence } from "./types";

/** Bounds are conservative world-axis-aligned boxes of transformed local bounds. */
export function explodedLayout(
  occurrences: Occurrence[],
  geometry: Record<string, Geometry>,
  percent: number,
) {
  const collection = new THREE.Box3().makeEmpty();
  const entries = new Map<
    string,
    { bounds: THREE.Box3; center: THREE.Vector3; offset: THREE.Vector3 }
  >();
  for (const occurrence of occurrences) {
    const bounds = geometry[occurrence.definition]?.bounds;
    if (
      occurrence.kind === "assembly" ||
      occurrence.suppressed ||
      !bounds ||
      ![...bounds.min, ...bounds.max].every(Number.isFinite)
    )
      continue;
    const transform = new THREE.Matrix4().set(
      ...(occurrence.matrix.flat() as Parameters<THREE.Matrix4["set"]>),
    );
    const box = new THREE.Box3(
      new THREE.Vector3().fromArray(bounds.min),
      new THREE.Vector3().fromArray(bounds.max),
    ).applyMatrix4(transform);
    if (box.isEmpty()) continue;
    collection.union(box);
    entries.set(occurrence.id, {
      bounds: box,
      center: box.getCenter(new THREE.Vector3()),
      offset: new THREE.Vector3(),
    });
  }
  const center = collection.isEmpty()
    ? new THREE.Vector3()
    : collection.getCenter(new THREE.Vector3());
  for (const entry of entries.values())
    entry.offset
      .copy(entry.center)
      .sub(center)
      .multiplyScalar(percent / 100);
  return { collection, center, entries };
}

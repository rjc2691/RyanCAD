import * as THREE from "three";
import { sketchBasis, type SketchFrame } from "./sketchModel.ts";

/** Bounds of the viewport projected onto the sketch plane in sketch coordinates. */
export function sketchPlaneBounds(camera: THREE.Camera, frame: SketchFrame) {
  const { origin, u, v, normal } = sketchBasis(frame);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
  const ray = new THREE.Raycaster(),
    points: THREE.Vector3[] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1]) {
      ray.setFromCamera(new THREE.Vector2(x, y), camera);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return null;
      points.push(p.sub(origin));
    }
  const us = points.map((p) => p.dot(u)),
    vs = points.map((p) => p.dot(v));
  return {
    minU: Math.min(...us),
    maxU: Math.max(...us),
    minV: Math.min(...vs),
    maxV: Math.max(...vs),
  };
}

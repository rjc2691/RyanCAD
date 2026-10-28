import * as THREE from "three";
import { sketchBasis, type SketchFrame } from "./sketchModel.ts";

// A radial tanh mapping makes the sensitivity approach zero smoothly at 70°.
export function sketchOrbitOffset(
  offset: THREE.Vector3,
  frame: SketchFrame,
  dx: number,
  dy: number,
): THREE.Vector3 {
  const { u, v, normal } = sketchBasis(frame),
    distance = offset.length();
  if (distance < 1e-9) return normal.clone();
  const n = Math.max(offset.dot(normal), 1e-9),
    x = offset.dot(u) / n,
    y = offset.dot(v) / n;
  const limit = Math.tan((70 * Math.PI) / 180),
    radius = Math.hypot(x, y);
  const raw = radius
    ? Math.atanh(Math.min(radius / limit, 0.999999)) / radius
    : 1 / limit;
  const a = x * raw + dx,
    b = y * raw + dy,
    r = Math.hypot(a, b);
  const scale = r ? (limit * Math.tanh(r)) / r : limit;
  return normal
    .clone()
    .addScaledVector(u, a * scale)
    .addScaledVector(v, b * scale)
    .normalize()
    .multiplyScalar(distance);
}

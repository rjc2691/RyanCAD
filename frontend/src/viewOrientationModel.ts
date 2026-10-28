import * as THREE from "three";
/** Unit world directions expressed in the current camera frame. Translation/zoom do not affect them. */
export const projectedAxes = (orientation: THREE.Quaternion) =>
  [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ].map((v) => v.applyQuaternion(orientation.clone().invert()));

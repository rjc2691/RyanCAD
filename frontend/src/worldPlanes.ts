import * as THREE from "three";
import { wideLines } from "./viewportHighlights";
import { HOVER_COLOR, SELECTION_COLOR } from "./viewportOperationDisplay";
export type WorldPlane = "XY" | "XZ" | "YZ";
export const worldPlaneAxes = (plane: WorldPlane) => ({
  u: new THREE.Vector3(
    ...((plane === "YZ" ? [0, 1, 0] : [1, 0, 0]) as [number, number, number]),
  ),
  v: new THREE.Vector3(
    ...((plane === "XY" ? [0, 1, 0] : [0, 0, 1]) as [number, number, number]),
  ),
});
export function createWorldPlanes() {
  const root = new THREE.Group();
  for (const plane of ["XY", "XZ", "YZ"] as WorldPlane[]) {
    const group = new THREE.Group();
    const { u, v } = worldPlaneAxes(plane),
      normal = new THREE.Vector3().crossVectors(u, v);
    group.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(u, v, normal),
    );
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16).translate(18, 18, 0),
      new THREE.MeshBasicMaterial({
        color: "#7d96b0",
        opacity: 0.045,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    face.userData.worldPlane = plane;
    face.userData.normal = normal;
    const border = wideLines(
      [
        10, 10, 0, 26, 10, 0, 26, 10, 0, 26, 26, 0, 26, 26, 0, 10, 26, 0, 10,
        26, 0, 10, 10, 0,
      ],
      "#7d96b0",
      1,
      [],
    );
    border.material.depthTest = true;
    border.renderOrder = 1;
    const quadrant = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0),
      new THREE.MeshBasicMaterial({
        color: HOVER_COLOR,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    quadrant.visible = false;
    group.add(face, border, quadrant);
    group.userData.worldPlane = plane;
    root.add(group);
  }
  return root;
}
export function styleWorldPlanes(
  root: THREE.Group,
  hovered: WorldPlane | null,
  selected?: WorldPlane,
  picking = false,
  reach = 10000,
) {
  for (const group of root.children) {
    const hover = group.userData.worldPlane === hovered,
      active = group.userData.worldPlane === selected;
    const face = group.children[0] as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshBasicMaterial
      >,
      border = group.children[1] as any;
    const color = hover ? HOVER_COLOR : active ? SELECTION_COLOR : "#7d96b0";
    face.material.color.set(color);
    face.material.opacity = hover ? 0.12 : active ? 0.2 : 0.045;
    border.material.color.set(color);
    border.material.opacity = hover || active ? 1 : 0.35;
    border.material.linewidth = hover ? 2.5 : active ? 3.5 : 1;
    const quadrant = group.children[2];
    quadrant.visible = picking && hover;
    quadrant.scale.set(reach, reach, 1);
  }
}

import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Selection } from "./types";
import type { OperationDraft, PickSlot } from "./operations/operationModel";
import {
  selectionKey,
  displaySelectionMembers,
  referenceMembers,
} from "./operations/groupedSelection.ts";
import { SELECTION_COLOR, HOVER_COLOR } from "./viewportOperationDisplay.ts";

export function wideLines(
  positions: ArrayLike<number>,
  color: string,
  width: number,
  clip: THREE.Plane[],
) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(Array.from(positions));
  const material = new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: width,
    clippingPlanes: clip,
    depthWrite: false,
    transparent: true,
  });
  material.toneMapped = false;
  const line = new LineSegments2(geometry, material);
  line.userData.overlay = true;
  line.renderOrder = 3;
  return line;
}
export function disposeHighlightMaterial(material: any) {
  if (!material) return;
  if (material.userData.ownedMap) {
    material.map?.dispose();
    material.userData.ownedMap = false;
  }
  material.dispose();
}
export function disposeOverlay(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((object: any) => {
      object.geometry?.dispose();
      disposeHighlightMaterial(object.material);
    });
  }
}
function outline(
  positions: ArrayLike<number>,
  role: "selected" | "hover",
  clip: THREE.Plane[],
  face = false,
) {
  if (role === "hover") {
    const line = wideLines(positions, HOVER_COLOR, face ? 2.5 : 3.5, clip);
    line.renderOrder = 11;
    return line;
  }
  const group = new THREE.Group();
  group.userData.overlay = true;
  for (const [color, width, order] of [
    ["#0a121d", face ? 8 : 12, 8],
    [SELECTION_COLOR, face ? 4.5 : 8, 9],
    ["#edfcff", face ? 1 : 2, 10],
  ] as const) {
    const line = wideLines(positions, color, width, clip);
    line.material.depthTest = false;
    line.renderOrder = order;
    group.add(line);
  }
  return group;
}
function vertexMap(role: "selected" | "hover") {
  const data = new Uint8Array(32 * 32 * 4),
    color = new THREE.Color(role === "hover" ? HOVER_COLOR : SELECTION_COLOR);
  // Use exact display colors (the texture and material bypass scene tone mapping).
  const rgb = color
    .getHexString()
    .match(/../g)!
    .map((v) => parseInt(v, 16));
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const u = (x - 15.5) / 16,
        v = (y - 15.5) / 16,
        r = Math.hypot(u, v),
        d = Math.abs(u) + Math.abs(v),
        i = (y * 32 + x) * 4;
      if (role === "selected" ? r > 0.94 : d > 0.94) continue;
      const fill =
        role === "selected"
          ? r < 0.2
            ? [237, 252, 255]
            : r > 0.5 && r < 0.8
              ? rgb
              : [10, 18, 29]
          : d < 0.72
            ? rgb
            : [10, 18, 29];
      data.set([...fill, 255], i);
    }
  const map = new THREE.DataTexture(data, 32, 32);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}
/** Hover is a click target; selection is retained intent. Buffers are never borrowed. */
export function highlight(
  selection: Selection,
  asset: any,
  clip: THREE.Plane[],
  role: "selected" | "hover",
  faceFill = true,
): THREE.Object3D | null {
  if (selection.vertex) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(
        ...(selection.vertex.point as [number, number, number]),
      ),
    ]);
    const material = new THREE.PointsMaterial({
      color: "#ffffff",
      map: vertexMap(role),
      size: role === "selected" ? 19 : 12,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      alphaTest: 0.01,
      clippingPlanes: clip,
    });
    material.toneMapped = false;
    material.userData.ownedMap = true;
    const points = new THREE.Points(geometry, material);
    points.userData.overlay = true;
    points.renderOrder = role === "hover" ? 11 : 6;
    return points;
  }
  if (selection.edge) {
    const e = selection.edge,
      positions = asset.edges
        .getAttribute("position")
        .array.slice(
          e.segment_start * 6,
          (e.segment_start + e.segment_count) * 6,
        );
    return outline(positions, role, clip);
  }
  if (selection.face && asset.geometry.index) {
    const f = selection.face,
      indices = asset.geometry.index.array.slice(
        f.triangle_start * 3,
        (f.triangle_start + f.triangle_count) * 3,
      ),
      source = asset.geometry.getAttribute("position"),
      positions = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      positions[i * 3] = source.getX(indices[i]);
      positions[i * 3 + 1] = source.getY(indices[i]);
      positions[i * 3 + 2] = source.getZ(indices[i]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const boundary = new THREE.EdgesGeometry(geometry, 45),
      lines = outline(
        boundary.getAttribute("position").array,
        role,
        clip,
        true,
      );
    boundary.dispose();
    if (!faceFill) {
      geometry.dispose();
      return lines;
    }
    const material = new THREE.MeshBasicMaterial({
      color: role === "hover" ? HOVER_COLOR : SELECTION_COLOR,
      transparent: true,
      opacity: role === "selected" ? 0.23 : 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      clippingPlanes: clip,
    });
    material.toneMapped = false;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.overlay = true;
    mesh.renderOrder = role === "hover" ? 7 : 4;
    const group = new THREE.Group();
    group.userData.overlay = true;
    group.add(mesh, lines);
    return group;
  }
  if (role === "hover")
    return outline(asset.edges.getAttribute("position").array, role, clip);
  return null;
}
export function hoverIntent(
  item: Selection,
  selected: Selection | null,
  draft: OperationDraft | undefined,
  pick: PickSlot | undefined,
  shift: boolean,
) {
  const kind = item.vertex
    ? "vertex"
    : item.edge
      ? "edge"
      : item.face
        ? "face"
        : "component";
  const members = [
    ...displaySelectionMembers(selected, draft),
    ...(draft
      ? [
          ...referenceMembers(draft, "path"),
          ...referenceMembers(draft, "profile"),
        ].map((r) => r.selection)
      : []),
  ];
  const included = members.some((s) => selectionKey(s) === selectionKey(item));
  if (pick === "path" && !item.edge) return "Tool Path needs an edge";
  if (pick === "plane")
    return item.face?.type === "PLANE"
      ? "Click uses this face as the support plane"
      : "Choose a planar support face";
  if (pick === "target") return "Click chooses this body to modify";
  if (pick === "origin") return `Click uses this ${kind} as Tool Origin`;
  if (pick === "profile" && draft?.profile === "body")
    return "Click uses this component as Tool Profile";
  if (
    pick === "profile" &&
    draft &&
    ["fillet", "chamfer"].includes(draft.profile) &&
    !item.edge
  )
    return "Choose an edge to round or bevel";
  if (shift) return `Shift-click ${included ? "removes" : "adds"} this ${kind}`;
  if (draft)
    return item.vertex
      ? "Click sets Tool Origin"
      : item.edge
        ? "Click replaces Tool Path"
        : item.face
          ? "Click replaces Tool Profile"
          : "Click uses this component as a reference";
  return `Click selects this ${kind}`;
}

import { displaySelectionMembers } from "./operations/groupedSelection.ts";
import * as THREE from "three";
import type { Geometry, Occurrence, Selection } from "./types";
import type { OperationDraft } from "./operations/operationModel";

export const SELECTION_COLOR = "#2455a4";
export const COMPONENT_SELECTION_COLOR = "#f3a64f";
export const HOVER_COLOR = "#8be9ff";

export type DisplayAsset = {
  geometry: THREE.BufferGeometry;
  edges: THREE.BufferGeometry;
};
export interface DisplayedPreview {
  token: string;
  context: string;
  root: THREE.Group;
  assets: Map<string, DisplayAsset>;
  components: Record<string, Geometry>;
  section: boolean;
  occurrences?: Occurrence[];
}
export function operationDisplayContext(draft?: OperationDraft) {
  if (!draft) return "";
  return draft.result === "new" &&
    !["fillet", "chamfer"].includes(draft.profile)
    ? "new"
    : `part:${draft.target?.definition || ""}`;
}
export function disposePreview(display: DisplayedPreview | null) {
  if (!display) return;
  display.root.removeFromParent();
  display.root.traverse((object: any) => object.material?.dispose());
  for (const asset of display.assets.values()) {
    asset.geometry.dispose();
    asset.edges.dispose();
  }
  display.root.clear();
}

export function viewportDisplayContext(props: {
  operationDraft?: OperationDraft;
  placementTarget?: Selection | null;
}) {
  return props.placementTarget
    ? `move:${props.placementTarget.occurrence}`
    : operationDisplayContext(props.operationDraft);
}
/** Presentation never changes native picking geometry, and never fades the edited part. */
export function syncOperationAppearance(
  parts: THREE.Group,
  display: DisplayedPreview | null,
  props: {
    geometry: Record<string, Geometry>;
    occurrences: Occurrence[];
    selected: Selection | null;
    operationDraft?: OperationDraft;
    placementTarget?: Selection | null;
    section: boolean;
    sketch?: unknown;
    editingGroup?: string;
  },
) {
  const draft = props.operationDraft,
    context = viewportDisplayContext(props);
  const shown =
    display && display.context === context && !!(draft || props.placementTarget)
      ? display
      : null;
  const baseOccurrences = new Map(props.occurrences.map((o) => [o.id, o]));
  const proposed = new Map((shown?.occurrences || []).map((o) => [o.id, o]));
  const moved = new Set<string>();
  for (const group of parts.children) {
    const o = group.userData.occurrence as Occurrence,
      base = baseOccurrences.get(o?.id);
    if (!base) continue;
    const candidate = props.placementTarget ? proposed.get(o.id) : undefined;
    if (candidate || group.userData.placementPreview) {
      group.matrix.set(
        ...((candidate || base).matrix.flat() as Parameters<
          THREE.Matrix4["set"]
        >),
      );
      group.matrixWorldNeedsUpdate = true;
      group.userData.placementPreview = !!candidate;
    }
    if (
      candidate &&
      JSON.stringify(candidate.matrix) !== JSON.stringify(base.matrix)
    )
      moved.add(o.id);
  }
  const focus = draft?.target?.definition;
  const colors = new Map(props.occurrences.map((o) => [o.id, o.color]));
  const replaced = new Set<string>();
  if (shown) {
    const changedClip = shown.section !== props.section;
    shown.section = props.section;
    const clip = props.section
      ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]
      : [];
    for (const group of shown.root.children) {
      const o = group.userData.occurrence as Occurrence;
      const source = parts.children.find(
        (g) => g.userData.occurrence?.id === o.id,
      );
      if (source) {
        group.matrix.copy(source.matrix);
        group.matrixWorldNeedsUpdate = true;
      }
      group.visible =
        props.geometry[o.definition]?.geometry_key !==
        shown.components[o.definition]?.geometry_key;
      if (group.visible) replaced.add(o.id);
      group.traverse((object: any) => {
        const material = object.material;
        if (!material) return;
        if (object.isMesh) {
          material.opacity = 1;
          material.transparent = false;
          material.depthWrite = true;
          material.color.set(colors.get(o.id) || o.color || "#92b7c9");
          material.emissive.set("#5c3614");
          material.emissiveIntensity = 0.12;
        }
        if (changedClip) {
          material.clippingPlanes = clip;
          material.needsUpdate = true;
        }
      });
    }
  }
  for (const group of parts.children) {
    const o = group.userData.occurrence as Occurrence;
    const surface = group.userData.surface as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const wire = group.userData.wire as THREE.LineSegments<
      THREE.BufferGeometry,
      THREE.LineBasicMaterial
    >;
    if (!o || !surface || !wire) continue;
    const selected = displaySelectionMembers(
      props.selected,
      props.operationDraft,
    ).some(
      (s) =>
        s.occurrence === o.id ||
        (!s.face &&
          !s.edge &&
          !s.vertex &&
          o.id.startsWith(s.occurrence + "/")),
    );
    const moveFocus =
      !!props.placementTarget &&
      (moved.has(o.id) ||
        o.id === props.placementTarget.occurrence ||
        o.id.startsWith(props.placementTarget.occurrence + "/"));
    const muted = props.sketch
      ? true
      : draft
        ? o.definition !== focus
        : props.placementTarget
          ? !moveFocus
          : !!props.editingGroup && !o.id.startsWith(props.editingGroup + "/");
    const material = surface.material;
    material.color.set(colors.get(o.id) || o.color);
    if (material.transparent !== muted) material.needsUpdate = true;
    material.opacity = muted ? 0.2 : 1;
    material.transparent = muted;
    material.forceSinglePass = true;
    material.colorWrite = !replaced.has(o.id);
    // Context surfaces reveal the edited part through them and never occlude it
    // through depth writes. Native meshes remain available for reference picking.
    material.depthWrite = material.colorWrite && !muted;
    material.emissive.set("#5c3614");
    material.emissiveIntensity = muted
      ? 0
      : draft?.target?.definition === o.definition
        ? 0.12
        : selected
          ? 0.18
          : 0;
    wire.visible = !replaced.has(o.id);
    wire.material.color.set(
      selected
        ? COMPONENT_SELECTION_COLOR
        : muted
          ? "#657583"
          : draft
            ? "#bc8d56"
            : "#182330",
    );
    wire.material.opacity = selected ? 0.95 : muted ? 0.3 : 0.8;
    wire.material.depthWrite = false;
    const highlights = group.userData.selectionLayer as THREE.Group | undefined;
    if (highlights)
      for (const child of highlights.children)
        child.visible = child.userData.wholeOutline
          ? !replaced.has(o.id)
          : true;
  }
}

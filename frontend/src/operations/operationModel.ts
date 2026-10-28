import { referenceLabel } from "../geometryLabels.ts";
import * as THREE from "three";
import type { Selection, State } from "../types";
import {
  followsPathOrigin,
  selectionMembers,
  referenceMembers,
  toggleReferences,
  orderedPath,
  pathComponentProblem,
} from "./groupedSelection.ts";

export type PickSlot =
  | "origin"
  | "profile"
  | "plane"
  | "path"
  | "travelTarget"
  | "sketch"
  | "place"
  | null;
export type Profile =
  | "rectangle"
  | "circle"
  | "polygon"
  | "face"
  | "sketch"
  | "body"
  | "fillet"
  | "chamfer";
export type Motion =
  | "linear"
  | "sweep"
  | "revolve"
  | "helix"
  | "none"
  | "mirror"
  | "pattern";
export interface OperationReference {
  sketch?: string;
  selection: Selection;
  anchor: "center" | "start" | "mid" | "end";
  label: string;
}
export interface OperationDraft {
  name: string;
  profile: Profile;
  motion: Motion;
  result: "new" | "auto" | "add" | "cut" | "intersect";
  target: Selection | null;
  origin: "coordinates" | "reference";
  originPinned?: boolean;
  reference: OperationReference | null;
  profileReference: OperationReference | null;
  pathReference: OperationReference | null;
  travelTarget?: OperationReference | null;
  pathReferences?: OperationReference[];
  profileReferences?: OperationReference[];
  plane: "XY" | "XZ" | "YZ" | "face" | "perpendicular" | "axial";
  direction: "normal" | "X" | "Y" | "Z" | "edge";
  extent: "distance" | "through" | "symmetric";
  pathMeasure?: "distance" | "percent";
  reverse: boolean;
  keepBodyPlacement: boolean;
  sketch: string;
  sketchOccurrence: string;
  points: number[][];
  values: Record<string, string>;
}
export const OPERATION_TOOLS = new Set([
  "tool",
  "box",
  "cylinder",
  "rectangle",
  "circle",
  "sketch",
  "extrude",
  "revolve",
  "holes",
  "fillet",
  "chamfer",
  "boolean",
  "sweep",
  "emboss",
  "helix",
  "mirror",
  "pattern",
]);
export const isFinish = (d: OperationDraft) =>
  ["fillet", "chamfer"].includes(d.profile);
export function operationPathPickProblem(
  d: OperationDraft,
  pick: PickSlot,
  s: Selection | null,
): string | null {
  if (!s) return null;
  const pathPicking = pick === "path" || (pick === "profile" && isFinish(d));
  const implicitEdge = !pick && !!s.edge && !s.vertex;
  return pathPicking || implicitEdge || (!pick && isFinish(d))
    ? pathComponentProblem(d, s)
    : null;
}
/** A freshly drawn world profile already includes the previous origin offsets. */
export function withSketchProfile(
  d: OperationDraft,
  state: State,
  id: string,
  drawn = false,
): OperationDraft {
  const f = state.document.features[id];
  if (!f) return d;
  const occurrence =
    f.owner === "root"
      ? ""
      : state.occurrences.find((o) => o.definition === f.owner && !o.suppressed)
          ?.id || "";
  const chosen: OperationReference = {
    selection: { definition: f.owner, occurrence },
    sketch: id,
    anchor: "center",
    label: f.name,
  };
  return {
    ...d,
    profile: "sketch",
    sketch: id,
    sketchOccurrence: occurrence,
    profileReference: null,
    profileReferences: [chosen],
    ...(isFinish(d) || d.profile === "body"
      ? {
          motion: "linear" as const,
          direction: "normal" as const,
          pathReference: null,
          pathReferences: [],
        }
      : {}),
    ...(drawn
      ? {
          reference: chosen,
          origin: "reference" as const,
          originPinned: false,
          values: { ...d.values, offset_u: "0", offset_v: "0", offset_n: "0" },
        }
      : !d.originPinned
        ? { reference: chosen, origin: "reference" as const }
        : {}),
  };
}
export const pathMeasure = (d: OperationDraft) =>
  d.pathMeasure || (d.motion === "sweep" ? "percent" : "distance");
export function operationPathLength(
  d: OperationDraft,
  state: State,
): number | null {
  try {
    const refs = referenceMembers(d, "path");
    if (!refs.length) return null;
    if (refs.length > 1) orderedPath(refs, state);
    let total = 0;
    for (const ref of refs) {
      const edge = ref.selection.edge;
      if (!edge) return null;
      if (typeof edge.length === "number") total += edge.length;
      else {
        const points = (edge.samples || [edge.start, edge.end]).map(
          (p: number[]) => new THREE.Vector3().fromArray(p),
        );
        total += points
          .slice(1)
          .reduce(
            (n: number, p: THREE.Vector3, i: number) =>
              n + p.distanceTo(points[i]),
            0,
          );
      }
    }
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}
export function trimDisplayPath(points: THREE.Vector3[], fraction: number) {
  if (points.length < 2 || fraction >= 1) return points;
  const total = points
      .slice(1)
      .reduce((n, p, i) => n + p.distanceTo(points[i]), 0),
    end = total * Math.max(0, fraction),
    out = [points[0]];
  let remaining = end;
  for (let i = 1; i < points.length; i++) {
    const length = points[i].distanceTo(points[i - 1]);
    if (remaining >= length) {
      out.push(points[i]);
      remaining -= length;
    } else {
      out.push(
        points[i - 1].clone().lerp(points[i], length ? remaining / length : 0),
      );
      break;
    }
  }
  return out;
}
export function reference(
  selection: Selection,
  state: State,
  anchor?: OperationReference["anchor"],
): OperationReference {
  return {
    selection: {
      ...selection,
      geometryKey: state.geometry[selection.definition]?.geometry_key,
    },
    anchor:
      anchor ||
      (selection.vertex
        ? selection.vertex.anchor
        : selection.edge
          ? "mid"
          : "center"),
    label: referenceLabel(selection, state),
  };
}
export function initialOperation(
  selection: Selection | null,
  state: State,
  preset = "tool",
): OperationDraft {
  const initialMembers = selectionMembers(selection);
  selection = initialMembers[0] || null;
  const planar =
    selection &&
    state.document.components[selection.definition]?.kind === "planar";
  if (
    planar &&
    selection &&
    state.geometry[selection.definition]?.thickness_preview
  )
    selection = {
      occurrence: selection.occurrence,
      definition: selection.definition,
    };
  const profile =
    planar && selection
      ? state.document.components[selection.definition].feature_ids
          .filter((id) =>
            ["rectangle", "circle", "sketch", "operation"].includes(
              state.document.features[id].type,
            ),
          )
          .at(-1) || ""
      : "";
  const emptyTarget =
    !!selection && state.geometry[selection.definition]?.status === "draft";
  const ref =
    selection && !emptyTarget
      ? reference(selection, state, selection.edge ? "start" : undefined)
      : reference(
          { worldOrigin: true, definition: "root", occurrence: "" },
          state,
        );
  let d: OperationDraft = {
    name: "Tool operation",
    profile:
      !selection && preset === "tool"
        ? "face"
        : selection?.edge
          ? "fillet"
          : selection?.face
            ? "face"
            : profile
              ? "sketch"
              : selection && !selection.vertex && !emptyTarget
                ? "face"
                : "rectangle",
    motion: selection?.edge ? "sweep" : "linear",
    result: selection ? "auto" : "new",
    target: selection,
    origin: "reference",
    reference: ref,
    profileReference: selection?.face ? ref : null,
    pathReference: selection?.edge ? ref : null,
    plane: selection?.edge ? "perpendicular" : selection?.face ? "face" : "XY",
    direction: selection?.edge ? "edge" : "normal",
    extent: "distance",
    reverse: false,
    keepBodyPlacement: true,
    sketch: profile,
    sketchOccurrence: profile ? selection?.occurrence || "" : "",
    points: [],
    values: {
      origin_x: "0",
      origin_y: "0",
      origin_z: "0",
      offset_u: "0",
      offset_v: "0",
      offset_n: "0",
      width: "20",
      height: "12",
      diameter: "5",
      distance: !selection && preset === "tool" ? "" : "5",
      path_percent: "100",
      angle: "360",
      amount: "2",
      axis_x: "0",
      axis_y: "0",
      axis_z: "0",
      count: "2",
      spacing: "10",
    },
  };
  if (initialMembers.length > 1) {
    for (const item of initialMembers.slice(1))
      d = inferOperationSelection(d, item, state, true).draft;
  }
  if (preset !== "tool") d = applyPreset(d, preset);
  return d;
}
export function applyPreset(d: OperationDraft, preset: string): OperationDraft {
  const common = {
    ...d,
    pathMeasure: undefined,
    values: { ...d.values },
    points: [...d.points],
  };
  if (preset === "mirror" || preset === "pattern")
    return {
      ...common,
      name: preset === "mirror" ? "Mirrored body" : "Connected repeat",
      profile: "body",
      motion: preset,
      plane: "YZ",
      direction: "X",
      result: preset === "mirror" || !d.target ? "new" : "add",
      profileReference: d.target
        ? {
            selection: {
              occurrence: d.target.occurrence,
              definition: d.target.definition,
            },
            anchor: "center",
            label: "Active component",
          }
        : d.profileReference,
    };
  if (preset === "fillet" || preset === "chamfer")
    return {
      ...common,
      name: preset === "fillet" ? "Round edge" : "Bevel edge",
      profile: preset,
      motion: "sweep",
      plane: "perpendicular",
      direction: "edge",
    };
  if (preset === "holes")
    return {
      ...common,
      name: "Hole",
      profile: "circle",
      motion: "linear",
      result: d.target ? "cut" : "new",
      extent: d.target ? "through" : "distance",
      reverse: true,
      direction: "normal",
      pathReference: null,
      plane: d.profileReference?.selection.face ? "face" : d.plane,
    };
  if (preset === "extrude" || preset === "emboss")
    return {
      ...common,
      name: preset === "emboss" ? "Raised detail" : "Face extrusion",
      profile:
        preset === "emboss"
          ? "circle"
          : d.profileReference?.selection.face
            ? "face"
            : d.sketch
              ? "sketch"
              : "rectangle",
      motion: "linear",
      direction: "normal",
      extent: "distance",
      reverse: false,
      values: {
        ...d.values,
        distance: preset === "emboss" ? "1" : d.values.distance,
      },
    };
  if (preset === "revolve" || preset === "helix")
    return {
      ...common,
      name: preset === "revolve" ? "Revolved profile" : "Helical sweep",
      profile: ["fillet", "chamfer", "face", "body"].includes(d.profile)
        ? "circle"
        : d.profile,
      motion: preset,
      plane: "axial",
      direction: "Z",
      origin: "reference",
      reference: {
        selection: { worldOrigin: true, definition: "root", occurrence: "" },
        anchor: "center",
        label: "World origin",
      },
      extent: "distance",
      values: {
        ...d.values,
        offset_u: "10",
        offset_v: "0",
        offset_n: "0",
      },
    };
  if (preset === "sweep")
    return {
      ...common,
      name: "Swept profile",
      profile: ["fillet", "chamfer", "face", "body"].includes(d.profile)
        ? "circle"
        : d.profile,
      motion: "sweep",
      plane: "perpendicular",
      direction: "edge",
      extent: "distance",
    };
  if (preset === "boolean")
    return {
      ...common,
      name: "Body Boolean",
      profile: "body",
      motion: "none",
      result: d.target ? "auto" : "new",
    };
  if (preset === "sketch")
    return {
      ...common,
      name: "Custom profile",
      profile: "polygon",
      motion: "none",
      result: "new",
    };
  if (
    preset === "box" ||
    preset === "rectangle" ||
    preset === "circle" ||
    preset === "cylinder"
  )
    return {
      ...common,
      name:
        preset === "box"
          ? "Box"
          : preset === "cylinder"
            ? "Cylinder"
            : "Planar profile",
      profile:
        preset === "circle" || preset === "cylinder" ? "circle" : "rectangle",
      motion: preset === "rectangle" || preset === "circle" ? "none" : "linear",
      result: "new",
      extent: "distance",
      reverse: false,
    };
  return common;
}
function serializeReference(ref: OperationReference | null) {
  if (!ref) return undefined;
  const s = ref.selection;
  if (s.worldOrigin)
    return { component: "root", world: "origin", anchor: "center" };
  return {
    component: s.definition,
    occurrence: s.occurrence,
    face: s.face?.signature,
    edge: s.vertex?.edge.signature || s.edge?.signature,
    anchor: ref.anchor,
    ...(ref.sketch ? { sketch: ref.sketch } : {}),
  };
}
export function operationCommand(d: OperationDraft) {
  const decode = (s: string) =>
    s.startsWith("@") ? { parameter: s.slice(1) } : s;
  return {
    target: d.target?.definition,
    target_occurrence: d.target?.occurrence,
    name: d.name,
    result: d.result,
    profile: d.profile,
    motion: d.motion,
    plane: d.plane,
    direction: d.direction,
    origin: d.origin,
    reference: serializeReference(
      !isFinish(d) &&
        !(
          d.profile === "body" &&
          d.keepBodyPlacement &&
          ["none", "pattern"].includes(d.motion)
        ) &&
        (d.origin === "reference" || d.plane === "face")
        ? d.reference
        : null,
    ),
    profile_reference: serializeReference(
      ["face", "body"].includes(d.profile) || d.plane === "face"
        ? d.profileReference
        : null,
    ),
    path_reference: serializeReference(
      isFinish(d) ||
        d.motion === "sweep" ||
        (d.direction === "edge" && !["none", "mirror"].includes(d.motion))
        ? d.pathReference
        : null,
    ),
    travel_target: serializeReference(
      ["linear", "sweep", "helix"].includes(d.motion) && d.extent !== "through"
        ? d.travelTarget || null
        : null,
    ),
    path_references:
      referenceMembers(d, "path").length > 1 &&
      (isFinish(d) || d.motion === "sweep")
        ? referenceMembers(d, "path").map((r) => serializeReference(r))
        : undefined,
    profile_references:
      referenceMembers(d, "profile").length > 1 &&
      ["face", "sketch"].includes(d.profile)
        ? referenceMembers(d, "profile").map((r) => serializeReference(r))
        : undefined,
    sketch: d.profile === "sketch" ? d.sketch || undefined : undefined,
    sketch_occurrence:
      d.profile === "sketch" ? d.sketchOccurrence || undefined : undefined,
    extent: d.motion === "linear" && !isFinish(d) ? d.extent : "distance",
    path_extent:
      !isFinish(d) &&
      ["linear", "sweep", "helix"].includes(d.motion) &&
      !(d.motion === "linear" && d.extent === "through")
        ? d.travelTarget
          ? "target"
          : d.motion !== "helix" &&
              pathMeasure(d) === "percent" &&
              d.values.path_percent?.trim()
            ? "percent"
            : d.values.distance?.trim()
              ? "distance"
              : "full"
        : "full",
    reverse: ["none", "mirror"].includes(d.motion) ? false : d.reverse,
    keep_body_placement: d.keepBodyPlacement,
    points: d.points,
    values: Object.fromEntries(
      Object.entries(d.values)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => [k, decode(v)]),
    ),
  };
}
export function operationProblem(d: OperationDraft): string | null {
  if (
    isFinish(d) &&
    d.travelTarget &&
    (referenceMembers(d, "path").length !== 1 ||
      d.pathReference?.selection.edge?.type !== "LINE")
  )
    return "Target-limited corner finishes require one straight edge. Clear the target for full curved/multiple-edge finishing.";
  if (
    ["linear", "sweep", "helix"].includes(d.motion) &&
    !isFinish(d) &&
    d.extent !== "through" &&
    !d.travelTarget &&
    !d.values.distance?.trim() &&
    !(pathMeasure(d) === "percent" && d.values.path_percent?.trim()) &&
    !d.pathReference?.selection.edge
  )
    return "An implicit direction has no finite full length. Enter a distance, select a target point, or pick a finite path.";
  if (d.result !== "new" && !d.target)
    return "Cancel this operation, select the component to edit, then press T.";
  if (isFinish(d) && (!d.target || !d.pathReference?.selection.edge))
    return "Pick an edge on the target component to finish.";
  if (["face", "body"].includes(d.profile) && !d.profileReference)
    return "Pick the tool profile in the viewport.";
  if (
    d.profile === "face" &&
    d.profileReference?.selection.face?.type !== "PLANE"
  )
    return "A 2D face profile needs a planar face. Choose a body profile for solid geometry.";
  if (d.profile === "sketch" && !d.sketch)
    return "Choose a closed sketch/profile.";
  if (d.profile === "polygon" && d.points.length < 3)
    return "Draw at least three profile points on the shown plane.";
  if (
    !isFinish(d) &&
    ["linear", "sweep", "helix"].includes(d.motion) &&
    d.extent !== "through" &&
    pathMeasure(d) === "percent" &&
    !d.pathReference?.selection.edge
  )
    return "Pick a finite path for percentage extent. An implicit normal has no total length.";
  if (d.motion === "sweep" && !d.pathReference?.selection.edge)
    return "Pick a Tool Path edge. The path is translated through Tool Origin.";
  if (
    d.direction === "edge" &&
    !["none", "mirror"].includes(d.motion) &&
    !d.pathReference?.selection.edge
  )
    return "Pick an edge to define the direction or axis.";
  if (d.profile === "body" && !["none", "mirror", "pattern"].includes(d.motion))
    return "Use a placed Boolean, mirror, or connected repeat for a 3D body. Use a face/2D section for travel.";
  if (
    d.plane === "face" &&
    !d.profileReference?.selection.face &&
    !d.reference?.selection.face
  )
    return "Pick a support face or choose an exact reference plane.";
  return null;
}
/** Geometry type drives inference; scroll position does not. */
function inferSingleSelection(
  d: OperationDraft,
  selection: Selection,
  state: State,
): { draft: OperationDraft; message: string } {
  const item = reference(selection, state);
  if (selection.vertex)
    return {
      draft: { ...d, origin: "reference", reference: item, originPinned: true },
      message: "Tool Origin follows the picked vertex.",
    };
  if (selection.edge) {
    const path = reference(selection, state, "start");
    const wasPathOrigin =
      d.reference?.selection.edge?.signature ===
        d.pathReference?.selection.edge?.signature &&
      d.reference?.selection.occurrence ===
        d.pathReference?.selection.occurrence;
    const missingProfile =
      !!d.target && d.profile === "face" && !d.profileReference;
    return {
      draft: {
        ...d,
        pathReference: path,
        direction: "edge",
        ...((!d.originPinned &&
          (wasPathOrigin || missingProfile || !d.reference)) ||
        isFinish(d)
          ? { origin: "reference", reference: path }
          : {}),
        ...(missingProfile
          ? { profile: "fillet", motion: "sweep", plane: "perpendicular" }
          : {}),
        ...(d.motion === "linear" && selection.edge.type !== "LINE"
          ? { motion: "sweep" }
          : {}),
        ...(["circle", "rectangle", "polygon"].includes(d.profile)
          ? { plane: "perpendicular" }
          : {}),
        ...(d.profile === "body" ? { motion: "sweep" } : {}),
      },
      message:
        d.profile === "body"
          ? "Tool Path updated. Choose a 2D section to follow it, or restore No motion for a placed solid tool."
          : "Tool Path replaced; target and dimensions retained.",
    };
  }
  if (selection.face) {
    if (selection.face.type !== "PLANE")
      return {
        draft: { ...d, profile: "face", profileReference: item, plane: "face" },
        message:
          "Choose a planar face for a section or support plane. Curved faces are not flattened implicitly.",
      };
    const replace =
      ["face", "body", "sketch"].includes(d.profile) || isFinish(d);
    const resetMotion = isFinish(d) || d.profile === "body";
    return {
      draft: {
        ...d,
        profileReference: item,
        plane: "face",
        ...(replace
          ? { profile: "face", sketch: "", sketchOccurrence: "" }
          : {}),
        ...(!d.originPinned ? { origin: "reference", reference: item } : {}),
        ...(resetMotion
          ? { motion: "linear", direction: "normal", pathReference: null }
          : {}),
      },
      message: replace
        ? "Tool Profile replaced; dimensions and Tool Effect retained."
        : "Support face replaced; custom section and offsets retained.",
    };
  }
  if (d.profile === "body")
    return {
      draft: { ...d, profileReference: item },
      message: "Tool body replaced; target retained.",
    };
  const component = state.document.components[selection.definition];
  const sketch = component?.feature_ids
    .filter((id) => state.profiles?.[id]?.status === "closed")
    .at(-1);
  if (sketch)
    return {
      draft: {
        ...d,
        profile: "sketch",
        sketch,
        sketchOccurrence: selection.occurrence,
        profileReference: null,
        plane: "XY",
        ...(!d.originPinned ? { origin: "reference", reference: item } : {}),
      },
      message: "Closed profile selected with its own plane and placed frame.",
    };
  return {
    draft: d,
    message:
      "Pick a face, edge or vertex to update tool references. Cancel the operation to change the active component.",
  };
}
/** Shift-click toggles members within a role; ordinary picks replace that role. */
export function inferOperationSelection(
  d: OperationDraft,
  selection: Selection,
  state: State,
  add = false,
): { draft: OperationDraft; message: string } {
  const blocked = operationPathPickProblem(d, null, selection);
  if (blocked) return { draft: d, message: blocked };
  const update = inferSingleSelection(d, selection, state);
  let next = update.draft;
  if (selection.edge) {
    const refs = toggleReferences(
      referenceMembers(d, "path"),
      reference(selection, state, "start"),
      add,
    );
    next = { ...next, pathReferences: refs, pathReference: refs[0] || null };
    if (refs.length > 1 && !isFinish(next)) next.motion = "sweep";
    if ((isFinish(next) || followsPathOrigin(d)) && refs.length) {
      try {
        const first = orderedPath(refs, state)[0];
        next.reference = {
          ...first.reference,
          anchor: first.reverse ? "end" : "start",
        };
      } catch {
        if (add) next.reference = d.reference;
      }
    }
    return {
      draft: next,
      message: `${refs.length} path edge${refs.length === 1 ? "" : "s"} selected · Shift-click adds or removes.`,
    };
  }
  const planar =
    state.document.components[selection.definition]?.kind === "planar";
  const sketch =
    !selection.face && !selection.vertex && planar
      ? state.document.components[selection.definition]?.feature_ids
          .filter((id) => state.profiles?.[id]?.status === "closed")
          .at(-1)
      : undefined;
  if (selection.face || sketch) {
    if (!add && !["face", "sketch"].includes(next.profile))
      return {
        draft: {
          ...next,
          profileReferences: undefined,
          pathReferences: next.pathReference ? d.pathReferences : [],
        },
        message: update.message,
      };
    const item = {
      ...reference(selection, state),
      ...(sketch ? { sketch } : {}),
    };
    const existing = referenceMembers(d, "profile");
    const seeded = existing.length
      ? existing
      : d.profile === "sketch" && d.sketch
        ? [
            {
              ...reference(
                {
                  definition:
                    state.document.features[d.sketch]?.owner ||
                    d.target?.definition ||
                    selection.definition,
                  occurrence: d.sketchOccurrence,
                },
                state,
              ),
              sketch: d.sketch,
            },
          ]
        : [];
    const refs = toggleReferences(seeded, item, add),
      first = refs[0];
    next = {
      ...next,
      profileReferences: refs,
      profileReference: first?.sketch ? null : first || null,
      profile: first?.sketch ? "sketch" : "face",
      sketch: first?.sketch || "",
      sketchOccurrence: first?.selection.occurrence || "",
      pathReferences: next.pathReference ? d.pathReferences : [],
    };
    if (add && seeded.length && !d.originPinned) {
      next.reference = first === seeded[0] ? d.reference : first || null;
      next.origin = d.origin;
    }
    return {
      draft: next,
      message: `${refs.length} tool profile${refs.length === 1 ? "" : "s"} selected · relative placement retained.`,
    };
  }
  return update;
}
export function facePathSelections(
  selection: Selection,
  state: State,
): Selection[] {
  const signatures = selection.face?.edge_signatures;
  if (!signatures?.length)
    throw Error(
      "This face has no available boundary references. Rebuild the design and pick it again.",
    );
  if (signatures.length > 64)
    throw Error(
      "This face has more than 64 boundary edges. Pick a smaller path group.",
    );
  return signatures.map((signature) => {
    const matches =
      state.geometry[selection.definition]?.edges?.filter(
        (e) => e.signature === signature,
      ) || [];
    if (matches.length !== 1)
      throw Error(
        "A face boundary edge is missing or ambiguous. Pick its replacement.",
      );
    return {
      definition: selection.definition,
      occurrence: selection.occurrence,
      edge: matches[0],
      geometryKey: state.geometry[selection.definition]?.geometry_key,
    };
  });
}
export function inferFacePath(
  d: OperationDraft,
  selection: Selection,
  state: State,
  add = false,
) {
  const blocked = pathComponentProblem(d, selection);
  if (blocked) throw Error(blocked);
  const edges = facePathSelections(selection, state);
  let draft = d;
  edges.forEach((s, i) => {
    draft = inferOperationSelection(draft, s, state, add || i > 0).draft;
  });
  return {
    draft,
    message: `${edges.length} face boundary edges selected for Tool Path.`,
  };
}
export interface OperationFrame {
  finishPartial?: boolean;
  travelTarget?: THREE.Vector3;
  projectedTarget?: THREE.Vector3;
  sectionEffect?: string;
  profileRadius: number;
  baseOrigin: THREE.Vector3;
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  normal: THREE.Vector3;
  direction: THREE.Vector3;
  outline: THREE.Vector3[];
  profileLoops?: THREE.Vector3[][];
  profileRegions?: THREE.Vector3[][][];
  bodyMatrix?: THREE.Matrix4;
  bodyOccurrence?: string;
  distance: number;
  path: THREE.Vector3[];
  travelPath: THREE.Vector3[];
  referencePath: THREE.Vector3[];
  referencePaths?: THREE.Vector3[][];
  pathOffset: THREE.Vector3[];
  pathStyle: "implicit" | "direct" | "parallel";
  pathLabel: string;
  amount: number;
}
export function operationFrame(
  d: OperationDraft,
  state: State,
  evaluated: Record<string, number> = {},
  display: any = null,
): OperationFrame {
  const matrix = (s: Selection | null | undefined) =>
    new THREE.Matrix4().set(
      ...((state.occurrences
        .find((o) => o.id === s?.occurrence)
        ?.matrix.flat() ||
        new THREE.Matrix4().identity().toArray()) as Parameters<
        THREE.Matrix4["set"]
      >),
    );
  const target = matrix(d.target),
    targetX = new THREE.Vector3(1, 0, 0).transformDirection(target),
    targetY = new THREE.Vector3(0, 1, 0).transformDirection(target);
  const n = (key: string) => {
    if (key in evaluated) return evaluated[key];
    const value = d.values[key] || "0";
    if (value.startsWith("@"))
      return state.parameter_graph[value.slice(1)]?.value || 0;
    const raw = parseFloat(value);
    return Number.isFinite(raw) ? raw * (/\bin\b/.test(value) ? 25.4 : 1) : 0;
  };
  const axis = (name: string) =>
    name === "X"
      ? new THREE.Vector3(1, 0, 0)
      : name === "Y"
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
  let normal = axis("Z"),
    u = axis("X"),
    base = new THREE.Vector3();
  const ref = d.reference;
  if (ref) {
    const s = ref.selection,
      m = matrix(s),
      edge = s.vertex?.edge || s.edge;
    const center = ref.sketch
      ? state.profiles?.[ref.sketch]?.center ||
        state.geometry[s.definition]?.center || [0, 0, 0]
      : edge
        ? ref.anchor === "start"
          ? edge.start
          : ref.anchor === "end"
            ? edge.end
            : edge.midpoint || edge.center
        : s.face?.center || state.geometry[s.definition]?.center || [0, 0, 0];
    base.fromArray(center || [0, 0, 0]).applyMatrix4(m);
    normal
      .fromArray(
        (ref.sketch ? state.profiles?.[ref.sketch]?.normal : s.face?.normal) ||
          edge?.tangent || [0, 0, 1],
      )
      .transformDirection(m);
    u = (Math.abs(normal.dot(targetX)) > 0.95 ? targetY : targetX).clone();
    u.addScaledVector(normal, -normal.dot(u)).normalize();
  }
  if (d.plane === "face" && d.profileReference?.selection.face) {
    const s = d.profileReference.selection;
    normal.fromArray(s.face!.normal).transformDirection(matrix(s));
    u = (Math.abs(normal.dot(targetX)) > 0.95 ? targetY : targetX).clone();
    u.addScaledVector(normal, -normal.dot(u)).normalize();
  }
  if (d.profile === "sketch" && state.profiles?.[d.sketch]?.normal) {
    const occurrence = state.occurrences.find(
      (o) => o.id === d.sketchOccurrence,
    );
    const m = new THREE.Matrix4().set(
      ...((occurrence?.matrix.flat() ||
        new THREE.Matrix4().toArray()) as Parameters<THREE.Matrix4["set"]>),
    );
    normal.fromArray(state.profiles[d.sketch].normal!).transformDirection(m);
    u = (Math.abs(normal.dot(targetX)) > 0.95 ? targetY : targetX).clone();
    u.addScaledVector(normal, -normal.dot(u)).normalize();
  }
  if (
    ["XY", "XZ", "YZ"].includes(d.plane) &&
    !["sketch", "face"].includes(d.profile)
  ) {
    normal =
      d.plane === "XY"
        ? axis("Z")
        : d.plane === "XZ"
          ? axis("Y").negate()
          : axis("X");
    u = d.plane === "YZ" ? axis("Y") : axis("X");
  }
  let chain: ReturnType<typeof orderedPath> = [];
  try {
    chain = orderedPath(referenceMembers(d, "path"), state);
  } catch {
    /* Invalid drafts keep native selections highlighted; no false joining lines. */
  }
  const pathEdge =
    chain[0]?.reference.selection.edge || d.pathReference?.selection.edge;
  let direction =
    d.direction === "edge" && chain.length
      ? new THREE.Vector3()
          .fromArray(
            chain[0].reverse
              ? chain[0].reference.selection.edge.end_tangent ||
                  chain[0].reference.selection.edge.tangent
              : chain[0].reference.selection.edge.tangent,
          )
          .transformDirection(matrix(chain[0].reference.selection))
          .multiplyScalar(chain[0].reverse ? -1 : 1)
      : d.direction === "edge" && pathEdge
        ? new THREE.Vector3()
            .fromArray(pathEdge.tangent || [0, 0, 1])
            .transformDirection(matrix(d.pathReference!.selection))
        : d.direction === "normal"
          ? normal.clone()
          : axis(d.direction);
  if (d.plane === "perpendicular" || d.plane === "axial") {
    u = (Math.abs(direction.dot(targetX)) > 0.9 ? targetY : targetX).clone();
    u.addScaledVector(direction, -direction.dot(u)).normalize();
    normal =
      d.plane === "perpendicular"
        ? direction.clone()
        : u.clone().cross(direction).normalize();
  }
  const v = normal.clone().cross(u).normalize();
  const origin =
    d.origin === "coordinates"
      ? new THREE.Vector3(n("origin_x"), n("origin_y"), n("origin_z"))
      : base
          .clone()
          .addScaledVector(u, n("offset_u"))
          .addScaledVector(v, n("offset_v"))
          .addScaledVector(normal, n("offset_n"));
  const at = (x: number, y: number) =>
    origin.clone().addScaledVector(u, x).addScaledVector(v, y);
  let outline: THREE.Vector3[] = [];
  if (d.profile === "rectangle")
    outline = [
      at(-n("width") / 2, -n("height") / 2),
      at(n("width") / 2, -n("height") / 2),
      at(n("width") / 2, n("height") / 2),
      at(-n("width") / 2, n("height") / 2),
    ];
  if (d.profile === "circle")
    outline = Array.from({ length: 64 }, (_, i) =>
      at(
        (Math.cos((i / 64) * Math.PI * 2) * n("diameter")) / 2,
        (Math.sin((i / 64) * Math.PI * 2) * n("diameter")) / 2,
      ),
    );
  if (d.profile === "polygon") outline = d.points.map((p) => at(p[0], p[1]));
  let distance = n("distance") * (d.reverse ? -1 : 1);
  if (d.extent === "through" && d.target)
    distance = Math.hypot(
      ...(state.geometry[d.target.definition]?.bounds?.size || [20, 20, 20]),
    );
  const path =
    chain.length > 1
      ? chain.flatMap((c, i) => (i ? c.points.slice(1) : c.points))
      : pathEdge
        ? (
            pathEdge.samples || [
              pathEdge.start || [0, 0, 0],
              pathEdge.end || [0, 0, 0],
            ]
          ).map((p: number[]) =>
            new THREE.Vector3()
              .fromArray(p)
              .applyMatrix4(matrix(d.pathReference!.selection)),
          )
        : [];
  if (isFinish(d) && path.length) origin.copy(path[0]);
  let profileLoops: THREE.Vector3[][] = outline.length ? [outline] : [];
  let profileRegions: THREE.Vector3[][][] = profileLoops.length
    ? [profileLoops]
    : [];
  let bodyMatrix: THREE.Matrix4 | undefined, bodyOccurrence: string | undefined;
  if (["face", "sketch"].includes(d.profile)) {
    let regions = referenceMembers(d, "profile");
    if (!regions.length && d.profile === "sketch" && d.sketch)
      regions = [
        {
          selection: {
            definition:
              state.document.features[d.sketch]?.owner ||
              d.target?.definition ||
              "",
            occurrence: d.sketchOccurrence,
          },
          sketch: d.sketch,
          anchor: "center",
          label: "Sketch",
        },
      ];
    const first = regions[0];
    if (first) {
      const center = first.sketch
        ? state.profiles?.[first.sketch]?.center
        : first.selection.face?.center;
      const anchor = new THREE.Vector3()
        .fromArray(center || [0, 0, 0])
        .applyMatrix4(matrix(first.selection));
      const delta = origin.clone().sub(anchor);
      profileRegions = regions.map((r) => {
        const face = r.selection.face;
        const loops = r.sketch
          ? state.profiles?.[r.sketch]?.outlines
          : face?.outlines;
        return (loops || []).map((loop) =>
          loop.map((p) =>
            new THREE.Vector3()
              .fromArray(p)
              .applyMatrix4(matrix(r.selection))
              .add(delta),
          ),
        );
      });
      profileLoops = profileRegions.flat();
    }
  }
  if (d.profile === "body" && d.profileReference) {
    const s = d.profileReference.selection,
      geometry = state.geometry[s.definition];
    bodyMatrix = matrix(s);
    bodyOccurrence = s.occurrence;
    const center = new THREE.Vector3()
      .fromArray(geometry?.center || [0, 0, 0])
      .applyMatrix4(bodyMatrix);
    if (d.keepBodyPlacement) {
      if (d.motion !== "mirror") origin.copy(center);
    } else {
      bodyMatrix.elements[12] += origin.x - center.x;
      bodyMatrix.elements[13] += origin.y - center.y;
      bodyMatrix.elements[14] += origin.z - center.z;
    }
    const b = geometry?.bounds;
    if (b) {
      const corners = Array.from({ length: 8 }, (_, i) =>
        new THREE.Vector3(
          b[i & 1 ? "max" : "min"][0],
          b[i & 2 ? "max" : "min"][1],
          b[i & 4 ? "max" : "min"][2],
        ).applyMatrix4(bodyMatrix!),
      );
      profileLoops = [];
      profileRegions = [];
      for (let i = 0; i < 8; i++)
        for (const bit of [1, 2, 4])
          if (!(i & bit)) profileLoops.push([corners[i], corners[i | bit]]);
    }
  }
  if (isFinish(d)) {
    profileLoops = (display?.finish_section?.loops || []).map(
      (loop: number[][]) => loop.map((p) => new THREE.Vector3().fromArray(p)),
    );
    profileRegions = profileLoops.length ? [profileLoops] : [];
  }
  const totalPathLength = operationPathLength(d, state);
  if (
    !isFinish(d) &&
    d.motion === "linear" &&
    d.extent !== "through" &&
    pathMeasure(d) === "percent" &&
    totalPathLength
  )
    distance =
      ((totalPathLength * n("path_percent")) / 100) * (d.reverse ? -1 : 1);
  const rotates = ["revolve", "helix"].includes(d.motion);
  const travelTarget =
    d.travelTarget &&
    ["linear", "sweep", "helix"].includes(d.motion) &&
    d.extent !== "through"
      ? new THREE.Vector3()
          .fromArray(
            d.travelTarget.selection.worldOrigin
              ? [0, 0, 0]
              : d.travelTarget.selection.vertex?.point ||
                  d.travelTarget.selection.edge?.midpoint ||
                  d.travelTarget.selection.face?.center ||
                  state.geometry[d.travelTarget.selection.definition]
                    ?.center || [0, 0, 0],
          )
          .applyMatrix4(
            d.travelTarget.selection.worldOrigin
              ? new THREE.Matrix4()
              : matrix(d.travelTarget.selection),
          )
      : undefined;
  if (d.motion === "linear" && d.extent !== "through") {
    if (travelTarget)
      distance =
        travelTarget.clone().sub(origin).dot(direction) *
        (d.extent === "symmetric" ? 2 : 1);
    else if (
      !d.values.distance?.trim() &&
      !(pathMeasure(d) === "percent" && d.values.path_percent?.trim()) &&
      totalPathLength
    )
      distance = totalPathLength * (d.reverse ? -1 : 1);
  }
  if (display?.travel && d.motion === "linear")
    distance = display.travel.distance;
  const usesEdge =
    !!path.length &&
    (isFinish(d) ||
      d.motion === "sweep" ||
      (d.direction === "edge" && !["none", "mirror"].includes(d.motion)));
  let pathStyle: OperationFrame["pathStyle"] = usesEdge ? "direct" : "implicit";
  const guideLength = Math.max(12, Math.min(80, Math.abs(distance) * 1.3));
  let referencePath = usesEdge
    ? path
    : [
        origin.clone().addScaledVector(direction, -guideLength / 3),
        origin.clone().addScaledVector(direction, guideLength),
      ];
  let travelPath: THREE.Vector3[] = [];
  let pathOffset: THREE.Vector3[] = [];
  if (isFinish(d))
    travelPath = display?.travel
      ? [
          new THREE.Vector3().fromArray(display.travel.origin),
          new THREE.Vector3().fromArray(display.travel.end),
        ]
      : path;
  else if (d.motion === "sweep" && path.length) {
    const complete = d.reverse ? [...path].reverse() : path;
    let fraction =
      pathMeasure(d) === "percent"
        ? n("path_percent") / 100
        : totalPathLength
          ? n("distance") / totalPathLength
          : 1;
    if (
      !d.values.distance?.trim() &&
      !(pathMeasure(d) === "percent" && d.values.path_percent?.trim())
    )
      fraction = 1;
    if (travelTarget) {
      const offset = origin.clone().sub(complete[0]);
      let best = Infinity,
        station = 0,
        total = 0;
      for (let i = 1; i < complete.length; i++) {
        const a = complete[i - 1].clone().add(offset),
          b = complete[i].clone().add(offset),
          v = b.clone().sub(a),
          len = v.length();
        const t = Math.max(
          0,
          Math.min(1, travelTarget.clone().sub(a).dot(v) / (len * len || 1)),
        );
        const gap = travelTarget.distanceToSquared(
          a.clone().addScaledVector(v, t),
        );
        if (gap < best) {
          best = gap;
          station = total + t * len;
        }
        total += len;
      }
      fraction = total ? station / total : 0;
    }
    if (display?.travel && totalPathLength)
      fraction = display.travel.distance / totalPathLength;
    const ordered = trimDisplayPath(complete, fraction);
    const offset = origin.clone().sub(ordered[0]);
    travelPath = ordered.map((p: THREE.Vector3) => p.clone().add(offset));
    if (offset.length() > 1e-6) {
      pathStyle = "parallel";
      pathOffset = [ordered[0], origin];
    }
  } else if (d.motion === "linear") {
    travelPath =
      d.extent === "symmetric" || d.extent === "through"
        ? [
            origin.clone().addScaledVector(direction, -distance / 2),
            origin.clone().addScaledVector(direction, distance / 2),
          ]
        : [origin, origin.clone().addScaledVector(direction, distance)];
    if (usesEdge) {
      const foot = path[0]
        .clone()
        .addScaledVector(direction, origin.clone().sub(path[0]).dot(direction));
      if (foot.distanceTo(origin) > 1e-6) {
        pathStyle = "parallel";
        pathOffset = [foot, origin];
      }
    }
  } else if (rotates) {
    const axisOrigin = usesEdge
      ? path[0]
      : new THREE.Vector3(n("axis_x"), n("axis_y"), n("axis_z"));
    referencePath = [
      axisOrigin.clone().addScaledVector(direction, -guideLength / 3),
      axisOrigin.clone().addScaledVector(direction, guideLength),
    ];
  }
  // Finishing accepts independent edges as well as chains. Keep their guides
  // separate so the overlay never invents connector segments between them.
  const referencePaths = isFinish(d)
    ? referenceMembers(d, "path")
        .map((r) => {
          const e = r.selection.edge;
          return e
            ? (e.samples || [e.start, e.end]).map((p: number[]) =>
                new THREE.Vector3()
                  .fromArray(p)
                  .applyMatrix4(matrix(r.selection)),
              )
            : [];
        })
        .filter((points) => points.length > 1)
    : undefined;
  const source =
    d.direction === "normal"
      ? d.plane === "face" && d.profileReference?.selection.face
        ? "Face normal"
        : "Profile normal"
      : `World ${d.direction} direction`;
  const pathLabel = rotates
    ? `${usesEdge ? "Picked edge" : d.direction === "normal" ? "Profile normal" : `World ${d.direction}`} · rotation axis`
    : pathStyle === "parallel"
      ? "Offset travel · parallel to highlighted edge"
      : pathStyle === "direct"
        ? `Direct path · ${referenceMembers(d, "path").length > 1 ? `${referenceMembers(d, "path").length} ${isFinish(d) ? "selected" : "connected"} edges` : "highlighted edge"}`
        : `${source} · implicit path`;
  return {
    finishPartial: isFinish(d) && !!display?.travel,
    travelTarget,
    projectedTarget: display?.travel?.end
      ? new THREE.Vector3().fromArray(display.travel.end)
      : travelPath.at(-1),
    sectionEffect: display?.finish_section?.effect,
    origin,
    baseOrigin: base,
    profileRadius: n("diameter") / 2,
    u,
    v,
    normal,
    direction,
    outline,
    profileLoops,
    profileRegions,
    bodyMatrix,
    bodyOccurrence,
    distance,
    path,
    travelPath,
    referencePath,
    referencePaths,
    pathOffset,
    pathStyle,
    pathLabel,
    amount: n("amount"),
  };
}

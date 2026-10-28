import type { Selection, State } from "./types";
import { referenceLabel } from "./geometryLabels.ts";
import * as THREE from "three";

export type MovementMethod = "axes" | "reference" | "rotate";
export type WorldAxis = "X" | "Y" | "Z";
export type MoveSlot = "origin" | "target" | "direction" | null;
export type MovePick = MoveSlot | "component";
export type MoveAnchor = "start" | "mid" | "end" | "center";
export interface MoveReference {
  worldAxis?: WorldAxis;
  selection: Selection;
  anchor: MoveAnchor;
  label: string;
}
export interface MovementGuideData {
  worldAxis?: WorldAxis;
  origin?: number[];
  destination?: number[];
  target?: number[] | null;
  direction?: number[] | null;
  remaining_gap?: number;
  directionStart?: number[];
  directionEnd?: number[];
  rotation_angle?: number;
}
export function worldAxisReference(axis: WorldAxis): MoveReference {
  return {
    worldAxis: axis,
    selection: { occurrence: "", definition: "" },
    anchor: "start",
    label: `World ${axis} axis`,
  };
}
export function inferredMovementDistance(
  refs: Partial<Record<Exclude<MoveSlot, null>, MoveReference>>,
  state: State,
  occurrence: { id: string; definition: string },
  reverse: boolean,
): string {
  if (!refs.target) return "";
  const origin = worldMovePoint(
      refs.origin || {
        selection: {
          occurrence: occurrence.id,
          definition: occurrence.definition,
        },
        anchor: "center",
        label: "",
      },
      state,
    ),
    target = worldMovePoint(refs.target, state);
  if (!origin || !target) return "";
  const delta = new THREE.Vector3()
    .fromArray(target)
    .sub(new THREE.Vector3().fromArray(origin));
  let distance = delta.length();
  if (refs.direction) {
    const a = worldMovePoint({ ...refs.direction, anchor: "start" }, state),
      b = worldMovePoint({ ...refs.direction, anchor: "end" }, state);
    if (!a || !b) return "";
    const direction = new THREE.Vector3()
      .fromArray(b)
      .sub(new THREE.Vector3().fromArray(a))
      .normalize()
      .multiplyScalar(reverse ? -1 : 1);
    distance = delta.dot(direction);
  }
  return String(
    Math.abs(distance) < 1e-9 ? 0 : Number(distance.toPrecision(12)),
  );
}
export function inferMovePick(
  method: MovementMethod,
  active: string,
  selection: Selection,
  armed: MovePick = null,
): Exclude<MovePick, null> | null {
  if (armed) return armed;
  if (selection.worldOrigin) return "target";
  if (!selection.vertex && !selection.edge && !selection.face)
    return "component";
  if (method === "axes") return null;
  if (method === "rotate")
    return (selection.edge && !selection.vertex) ||
      selection.vertex?.anchor === "mid"
      ? "direction"
      : null;
  if (selection.edge && !selection.vertex) return "direction";
  return selection.occurrence === active ||
    selection.occurrence.startsWith(active + "/")
    ? "origin"
    : "target";
}
export function inferredMoveLabel(
  refs: Partial<Record<Exclude<MoveSlot, null>, MoveReference>>,
  distance: string,
) {
  if (distance.trim())
    return refs.direction
      ? "Exact distance along direction"
      : refs.target
        ? "Exact distance toward target"
        : "Choose a direction or target";
  return refs.target
    ? refs.direction
      ? "Target projected onto direction"
      : "Point to point"
    : "Choose a target or enter a distance";
}
export function movementArgs(
  method: MovementMethod,
  occurrence: { id: string; source_id: string },
  refs: Partial<Record<Exclude<MoveSlot, null>, MoveReference>>,
  values: Record<string, string>,
  reverse: boolean,
) {
  const value = (v: string) =>
    v.startsWith("@") ? { parameter: v.slice(1) } : v;
  const args: Record<string, any> = {
    id: occurrence.source_id,
    occurrence: occurrence.id,
    method,
    reverse,
  };
  if (method === "axes") {
    args.values = Object.fromEntries(
      ["x", "y", "z", "rx", "ry", "rz"].map((k) => [k, value(values[k])]),
    );
    return args;
  }
  if (refs.direction) args.direction = moveDirection(refs.direction);
  if (method === "rotate") {
    if (!args.direction)
      throw Error("Select a straight edge for the rotation axis.");
    args.values = { angle: value(values.angle) };
    return args;
  }
  if (refs.origin) args.origin = movePoint(refs.origin);
  if (refs.target) args.target = movePoint(refs.target);
  const distance = values.distance.trim();
  if (!args.target && !(args.direction && distance))
    throw Error(
      args.direction
        ? "Enter an exact distance or select a target point."
        : "Select a target point, or a direction and an exact distance.",
    );
  args.values = distance ? { distance: value(distance) } : {};
  return args;
}
export function worldMovePoint(ref: MoveReference, state: State) {
  if (ref.selection.worldOrigin) return [0, 0, 0];
  if (ref.worldAxis)
    return ["X", "Y", "Z"].map((a) =>
      a === ref.worldAxis && ref.anchor === "end" ? 30 : 0,
    );
  const row = state.occurrences.find((o) => o.id === ref.selection.occurrence);
  if (!row) return undefined;
  return new THREE.Vector3()
    .fromArray(movePoint(ref).point!)
    .applyMatrix4(
      new THREE.Matrix4().set(
        ...(row.matrix.flat() as Parameters<THREE.Matrix4["set"]>),
      ),
    )
    .toArray();
}
export function moveReference(
  selection: Selection,
  state: State,
): MoveReference {
  return {
    selection: {
      ...selection,
      geometryKey: state.geometry[selection.definition]?.geometry_key,
    },
    anchor: selection.vertex
      ? selection.vertex.anchor
      : selection.edge
        ? selection.edge.type === "LINE"
          ? "mid"
          : "start"
        : "center",
    label: referenceLabel(selection, state),
  };
}
export function movePoint(ref: MoveReference) {
  const s = ref.selection;
  if (s.worldOrigin) return { world: "origin" };
  const point =
    s.vertex?.point ||
    (s.edge
      ? ref.anchor === "start"
        ? s.edge.start
        : ref.anchor === "end"
          ? s.edge.end
          : s.edge.midpoint ||
            s.edge.start.map((v: number, i: number) => (v + s.edge.end[i]) / 2)
      : s.face?.center || [0, 0, 0]);
  return { occurrence: s.occurrence, point: [...point] };
}
export function moveDirection(ref: MoveReference) {
  if (ref.worldAxis) return { axis: ref.worldAxis };
  const e = ref.selection.edge;
  if (
    !e ||
    e.type !== "LINE" ||
    !e.start ||
    !e.end ||
    Math.hypot(...e.end.map((v: number, i: number) => v - e.start[i])) < 1e-9
  )
    throw Error(
      "Choose a straight edge with nonzero length for the reference direction.",
    );
  return {
    occurrence: ref.selection.occurrence,
    start: [...e.start],
    end: [...e.end],
  };
}

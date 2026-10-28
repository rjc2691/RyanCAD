import * as THREE from "three";
import type { Selection, State } from "../types";
import type { OperationDraft, OperationReference } from "./operationModel";

export function selectionKey(s: Selection) {
  return `${s.occurrence}|${s.vertex ? `vertex:${s.vertex.edge.signature}:${s.vertex.anchor}` : s.edge ? `edge:${s.edge.signature}` : s.face ? `face:${s.face.signature || s.face.id}` : "component"}`;
}
export const selectionMembers = (
  selection: Selection | null | undefined,
): Selection[] => (selection ? selection.items || [selection] : []);
export function mergeSelection(
  previous: Selection | null,
  item: Selection | null,
  add = false,
): Selection | null {
  if (!item) return add ? previous : null;
  const kind = (s: Selection) =>
    s.vertex ? "vertex" : s.edge ? "edge" : s.face ? "face" : "component";
  const items =
    add && previous && kind(previous) === kind(item)
      ? [...selectionMembers(previous)]
      : [];
  const index = items.findIndex((s) => selectionKey(s) === selectionKey(item));
  if (index < 0) items.push({ ...item, items: undefined });
  else items.splice(index, 1);
  return items.length > 1 ? { ...items[0], items } : items[0] || null;
}
export const referenceMembers = (
  d: OperationDraft,
  role: "path" | "profile",
): OperationReference[] =>
  role === "path"
    ? d.pathReferences || (d.pathReference ? [d.pathReference] : [])
    : d.profileReferences ||
      (d.profileReference && d.profile === "face" ? [d.profileReference] : []);
export function referenceMatrix(s: Selection, state: State) {
  const m = state.occurrences.find((o) => o.id === s.occurrence)?.matrix;
  return m
    ? new THREE.Matrix4().set(...(m.flat() as Parameters<THREE.Matrix4["set"]>))
    : new THREE.Matrix4();
}
export function orderedPath(refs: OperationReference[], state: State) {
  if (!refs.length) return [];
  const nodes: THREE.Vector3[] = [],
    adjacency: number[][] = [],
    links: number[][] = [];
  const point = (p: number[], r: OperationReference) =>
    new THREE.Vector3()
      .fromArray(p)
      .applyMatrix4(referenceMatrix(r.selection, state));
  const node = (p: THREE.Vector3) => {
    let i = nodes.findIndex((n) => n.distanceTo(p) <= 1e-6);
    if (i < 0) {
      i = nodes.length;
      nodes.push(p);
      adjacency.push([]);
    }
    return i;
  };
  refs.forEach((r, i) => {
    const e = r.selection.edge;
    if (!e) throw Error("Every Tool Path selection must be an edge.");
    const a = node(point(e.start, r)),
      b = node(point(e.end, r));
    links.push([a, b]);
    adjacency[a].push(i);
    adjacency[b].push(i);
  });
  if (adjacency.some((a) => a.length > 2))
    throw Error("Tool Path branches. Shift-click the extra edge to remove it.");
  const ends = adjacency
    .map((a, i) => (a.length === 1 ? i : -1))
    .filter((i) => i >= 0);
  if (ends.length !== 0 && ends.length !== 2)
    throw Error(
      "Tool Path edges must form one connected chain or closed loop.",
    );
  let current = ends.length
    ? ends.reduce((a, b) =>
        nodes[a].distanceTo(nodes[links[0][0]]) <=
        nodes[b].distanceTo(nodes[links[0][0]])
          ? a
          : b,
      )
    : links[0][0];
  const used = new Set<number>(),
    ordered: {
      reference: OperationReference;
      reverse: boolean;
      points: THREE.Vector3[];
    }[] = [];
  while (used.size < refs.length) {
    const i = adjacency[current].find((i) => !used.has(i));
    if (i === undefined)
      throw Error(
        "Tool Path contains a gap or a separate loop. Shift-click to remove it.",
      );
    const reverse = current !== links[i][0],
      r = refs[i],
      e = r.selection.edge;
    const points = (e.samples || [e.start, e.end]).map((p: number[]) =>
      point(p, r),
    );
    if (reverse) points.reverse();
    ordered.push({ reference: r, reverse, points });
    used.add(i);
    current = links[i][reverse ? 0 : 1];
  }
  return ordered;
}
export function groupedSelectionProblem(
  d: OperationDraft,
  state: State,
): string | null {
  const paths = referenceMembers(d, "path"),
    regions = referenceMembers(d, "profile");
  for (const path of paths) {
    const problem = pathComponentProblem(d, path.selection);
    if (problem) return problem;
  }
  if (paths.length > 64 || regions.length > 64)
    return "Select at most 64 edges or profiles per operation.";
  if (
    paths.length > 1 &&
    !["fillet", "chamfer"].includes(d.profile) &&
    (d.motion === "sweep" ||
      (d.direction === "edge" && !["none", "mirror"].includes(d.motion)))
  ) {
    if (d.motion !== "sweep")
      return "Choose Sweep to follow a multi-edge path. A rotation axis needs one straight edge.";
    try {
      orderedPath(paths, state);
    } catch (e) {
      return (e as Error).message;
    }
  }
  if (regions.length > 1 && ["face", "sketch"].includes(d.profile)) {
    const normals = regions.map((r) => {
      const n = r.sketch
        ? state.profiles?.[r.sketch]?.normal
        : r.selection.face?.normal;
      if (!n || (!r.sketch && r.selection.face?.type !== "PLANE")) return null;
      return new THREE.Vector3()
        .fromArray(n)
        .transformDirection(referenceMatrix(r.selection, state));
    });
    if (normals.some((n) => !n))
      return "Every tool profile must be a planar face or closed planar sketch.";
    if (normals.some((n) => Math.abs(n!.dot(normals[0]!)) < 1 - 1e-8))
      return "Tool Profile planes must be coplanar or parallel. Shift-click to remove an incompatible profile.";
  }
  return null;
}

/** A path is owned by one placed body, including when definitions are linked. */
export function pathComponentProblem(
  d: OperationDraft,
  selection: Selection,
): string | null {
  const first = referenceMembers(d, "path")[0]?.selection;
  const owner =
    ["fillet", "chamfer"].includes(d.profile) && d.target ? d.target : first;
  if (
    owner &&
    (owner.definition !== selection.definition ||
      owner.occurrence !== selection.occurrence)
  )
    return "Tool Path edges must belong to the same component instance. Clear the path before choosing another component.";
  return null;
}
export function toggleReferences(
  refs: OperationReference[],
  item: OperationReference,
  add: boolean,
) {
  if (!add) return [item];
  const key = (r: OperationReference) =>
    `${selectionKey(r.selection)}|${r.sketch || ""}`;
  return refs.some((r) => key(r) === key(item))
    ? refs.filter((r) => key(r) !== key(item))
    : [...refs, item];
}

/** Role membership is authoritative after Shift toggles or chip removal. */
export function displaySelectionMembers(
  selection: Selection | null | undefined,
  draft?: OperationDraft,
) {
  if (draft && selection?.edge && draft.pathReferences)
    return draft.pathReferences.map((r) => r.selection);
  if (
    draft &&
    draft.profileReferences &&
    (selection?.face ||
      (draft.profile === "sketch" && !selection?.edge && !selection?.vertex))
  )
    return draft.profileReferences.map((r) => r.selection);
  return selectionMembers(selection);
}

export function followsPathOrigin(d: OperationDraft) {
  if (["fillet", "chamfer"].includes(d.profile)) return true;
  if (d.originPinned) return false;
  if (!d.reference || (d.profile === "face" && !d.profileReference))
    return true;
  return referenceMembers(d, "path").some(
    (r) =>
      r.selection.edge?.signature === d.reference?.selection.edge?.signature &&
      r.selection.occurrence === d.reference?.selection.occurrence,
  );
}

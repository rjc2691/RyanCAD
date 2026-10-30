import type { Occurrence, Selection } from "./types";
export const withinGroup = (id: string, group: string) =>
  id === group || id.startsWith(group + "/");
export const parentPath = (id: string) =>
  id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "";
/** Resolve a body hit to the immediate selectable object in the current edit scope. */
export function groupSelection(
  hit: Selection | null,
  rows: Occurrence[],
  scope = "",
): Selection | null {
  if (!hit) return null;
  if (scope === hit.occurrence && rows.find(o=>o.id===scope)?.kind !== "assembly") return hit;
  if (scope && !hit.occurrence.startsWith(scope + "/")) return null;
  const tail = scope ? hit.occurrence.slice(scope.length + 1) : hit.occurrence;
  const id = (scope ? scope + "/" : "") + tail.split("/")[0],
    o = rows.find((o) => o.id === id);
  if (!o) return null;
  return id === hit.occurrence
    ? hit
    : { occurrence: id, definition: o.definition };
}
export function expandedGroupSelection(
  selection: Selection,
  rows: Occurrence[],
): Selection[] {
  if (rows.find((o) => o.id === selection.occurrence)?.kind !== "assembly")
    return [selection];
  return rows
    .filter(
      (o) =>
        o.kind !== "assembly" && o.id.startsWith(selection.occurrence + "/"),
    )
    .map((o) => ({ occurrence: o.id, definition: o.definition }));
}
export function groupCandidates(rows: Occurrence[], scope = "") {
  return rows.filter(
    (o) => parentPath(o.id) === scope && o.purpose !== "tool" && !o.suppressed,
  );
}
/** Stable depth-first tree order independent of the evaluator's occurrence order.
 * Expansion is view state and never changes assembly ownership or edit scope. */
export function componentTreeRows(
  rows: Occurrence[],
  expanded: ReadonlySet<string>,
) {
  const children = new Map<string, Occurrence[]>();
  for (const row of rows) {
    const parent = parentPath(row.id);
    children.set(parent, [...(children.get(parent) || []), row]);
  }
  const result: {
    occurrence: Occurrence;
    depth: number;
    childCount: number;
    position: number;
    siblings: number;
  }[] = [];
  const visit = (parent: string, depth: number) => {
    const branch = children.get(parent) || [];
    branch.forEach((occurrence, index) => {
      result.push({
        occurrence,
        depth,
        childCount: children.get(occurrence.id)?.length || 0,
        position: index + 1,
        siblings: branch.length,
      });
      if (expanded.has(occurrence.id)) visit(occurrence.id, depth + 1);
    });
  };
  visit("", 0);
  return result;
}

/** A drop on a part means its containing level; a group means inside it. */
export function treeDropParent(target: Occurrence | null) {
  return target
    ? target.kind === "assembly"
      ? target.id
      : parentPath(target.id)
    : "";
}
export function treeDropProblem(
  rows: Occurrence[],
  sourceId: string,
  parentId: string,
): string {
  const source = rows.find((o) => o.id === sourceId),
    parent = parentId ? rows.find((o) => o.id === parentId) : null;
  if (!source) return "Choose a component from this design.";
  if (parentId && (!parent || parent.kind !== "assembly"))
    return "Drop into a group or the design root.";
  if (
    source.pattern_mode ||
    source.suppressed ||
    parent?.pattern_mode ||
    parent?.suppressed
  )
    return "Patterned or suppressed components cannot be reorganized independently.";
  if (parentId === sourceId || parentId.startsWith(sourceId + "/"))
    return "A group cannot contain itself or its descendants.";
  if (parentPath(sourceId) === parentId) return "Already at this level.";
  const owner = parentPath(sourceId),
    ownerDefinition = rows.find((o) => o.id === owner)?.definition;
  if (
    (ownerDefinition &&
      rows.filter((o) => o.definition === ownerDefinition).length > 1) ||
    (parent &&
      rows.filter((o) => o.definition === parent.definition).length > 1)
  )
    return "Copy a shared group before changing its membership.";
  return "";
}
export function remapTreePath(path: string, mapping: Record<string, string>) {
  const entry = Object.entries(mapping)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([old]) => path === old || path.startsWith(old + "/"));
  return entry ? entry[1] + path.slice(entry[0].length) : path;
}

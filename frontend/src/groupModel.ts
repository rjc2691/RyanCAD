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
  if(hit.worldOrigin)return hit;
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
export function remapTreePath(path: string, mapping: Record<string, string>) {
  const entry = Object.entries(mapping)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([old]) => path === old || path.startsWith(old + "/"));
  return entry ? entry[1] + path.slice(entry[0].length) : path;
}

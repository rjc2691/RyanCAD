import type { Geometry, Selection, State } from "./types";
/** Readable labels are scoped to a component's current geometry revision, never topology references. */
export function entityName(
  s: Selection | null | undefined,
  g?: Geometry,
): string {
  if (!s) return "";
  if (s.worldOrigin) return "World origin";
  if (s.vertex) {
    if (s.vertex.anchor === "mid")
      return `Midpoint · ${entityName({ ...s, vertex: undefined, edge: s.vertex.edge }, g)}`;
    const i =
      g?.vertices?.findIndex(
        (p) => Math.hypot(...p.map((v, j) => v - s.vertex!.point[j])) < 1e-5,
      ) ?? -1;
    return i >= 0 ? g?.vertex_info?.[i]?.name || `Vertex ${i + 1}` : "Vertex";
  }
  const kind = s.edge ? "Edge" : s.face ? "Face" : "Component",
    item = s.edge || s.face;
  if (!item) return kind;
  if (item.name) return item.name;
  const list = s.edge ? g?.edges : g?.faces;
  const i =
    list?.findIndex(
      (e) =>
        e === item ||
        (item.id && e.id === item.id) ||
        (item.signature && e.signature === item.signature),
    ) ?? -1;
  if (i >= 0) return `${kind} ${i + 1}`;
  const match = item.id?.match(/_(\d+)$/);
  return match ? `${kind} ${Number(match[1]) + 1}` : kind;
}
export function referenceLabel(
  s: Selection,
  state: Pick<State, "geometry" | "document" | "occurrences">,
): string {
  if (s.worldOrigin) return "World origin";
  return `${entityName(resolveDisplaySelection(s, state.geometry[s.definition]) || s, state.geometry[s.definition])} · ${state.occurrences.find((o) => o.id === s.occurrence)?.name || state.document.components[s.definition]?.name || "part"}`;
}
/** Resolve a stored reference onto current display buffers, rejecting missing/ambiguous entities. */
export function resolveDisplaySelection(
  s: Selection,
  g?: Geometry,
): Selection | null {
  if (s.worldOrigin) return s;
  if (!g) return null;
  if (s.vertex) {
    if (s.vertex.anchor === "mid") {
      const edge = resolveDisplaySelection(
        { ...s, vertex: undefined, edge: s.vertex.edge },
        g,
      )?.edge;
      if (!edge?.midpoint) return null;
      return { ...s, vertex: { ...s.vertex, edge, point: edge.midpoint } };
    }
    const point = g.vertices?.find(
      (p) => Math.hypot(...p.map((v, j) => v - s.vertex!.point[j])) < 1e-5,
    );
    if (!point) return null;
    return { ...s, vertex: { ...s.vertex, point } };
  }
  const item = s.edge || s.face;
  if (!item) return s;
  const list = s.edge ? g.edges : g.faces;
  if (s.geometryKey && s.geometryKey === g.geometry_key && item.id) {
    const current = list?.find((e) => e.id === item.id);
    if (current)
      return { ...s, ...(s.edge ? { edge: current } : { face: current }) };
  }
  const matches =
    list?.filter((e) =>
      item.signature ? e.signature === item.signature : e.id === item.id,
    ) || [];
  if (matches.length !== 1) return null;
  return { ...s, ...(s.edge ? { edge: matches[0] } : { face: matches[0] }) };
}

import type { Geometry, Selection, State } from "./types";

/** Display-only scope: one selected part, one placed assembly, or all physical instances. */
export function inspectorMeasurements(
  state: State,
  selection: Selection | null,
  geometry: Record<string, Geometry> = state.geometry,
) {
  const component =
    selection && state.document.components[selection.definition];
  const part = component && component.kind !== "assembly";
  const instances = state.occurrences.filter(
    (o) =>
      o.kind !== "assembly" &&
      (part || state.document.components[o.definition]?.purpose !== "tool") &&
      !o.suppressed &&
      (component || !state.document.structure_version || (!o.library && o.layout===state.document.active_layout)) &&
      (!component || part || o.id.startsWith(`${selection?.occurrence}/`)),
  );
  const definitions = part
    ? [selection!.definition]
    : instances.map((o) => o.definition);
  let volume = 0,
    area = 0,
    incomplete = 0,
    planar = 0;
  for (const id of definitions) {
    const info = geometry[id];
    if (!info || !["valid", "planar"].includes(info.status)) {
      incomplete++;
      continue;
    }
    if (info.status === "planar") planar++;
    volume += info.volume ?? 0;
    area += info.area ?? 0;
  }
  const known = definitions.length - incomplete;
  return {
    scope: part ? "component" : component ? "assembly" : "design",
    volume: (part && planar) || (!known && incomplete) ? null : volume,
    area: !known && incomplete ? null : area,
    areaLabel: planar
      ? planar === known
        ? "Profile area"
        : "Surface / profile area"
      : "Surface area",
    count: definitions.length,
    incomplete,
  };
}

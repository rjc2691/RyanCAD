import type { Feature, State } from "./types";
import { expressionLabel, numeric } from "./api.ts";

export const FEATURE_EDIT_SECTION_ORDER = ["Tool Profile", "Tool Path", "Tool Origin", "Dimensions", "Position"];
export const PROFILE_SHAPE_LABELS: Record<string, string> = {
  face: "Selected face", circle: "Circle", rectangle: "Rectangle", polygon: "Draw profile",
  sketch: "Existing sketch", body: "3D body", fillet: "Round corner", chamfer: "Bevel corner",
};
export const PATH_TYPE_LABELS: Record<string, string> = {
  linear: "Straight travel / extrusion", sweep: "Follow a design edge / sweep",
  revolve: "Rotate about an axis", helix: "Rotate and travel / helix",
  none: "No motion / placed Boolean", mirror: "Mirror about a plane", pattern: "Connected repeat along direction",
};

/** Placement values remain in the recipe, but are no longer exposed as inputs. */
export function featureFieldVisible(field: string) {
  return !/^(offset_|origin_)/.test(field);
}

export interface SavedFeatureReference { label: string; detail: string }

/** Display saved construction aids without inventing live links or topology IDs. */
export function featureSavedReferences(feature: Feature, state: State, role: "origin" | "profile" | "path" | "target"): SavedFeatureReference[] {
  const snapshot = feature.options.reference_snapshot;
  const stored = snapshot?.refs || {};
  const refs = feature.references || {};
  const single = role === "origin" ? "reference" : role === "profile" ? "profile_reference" : role === "path" ? "path_reference" : "travel_target";
  const prefix = role === "profile" ? "region_" : role === "path" ? "path_" : "";
  const grouped = prefix ? Object.keys(stored).filter(key => new RegExp(`^${prefix}\\d+$`).test(key)).sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length))) : [];
  let entries: { selection: any; local?: boolean; frozen?: boolean }[] = grouped.length
    ? grouped.map(key => ({ ...stored[key], frozen: true }))
    : stored[single] ? [{ ...stored[single], frozen: true }] : [];
  if (!entries.length) {
    const live = role === "profile" ? refs.profile_references : role === "path" ? refs.path_references : null;
    entries = (live?.length ? live : refs[single] ? [refs[single]] : []).map((selection: any) => ({ selection, local: selection.component === feature.owner }));
  }
  if (entries.length) return entries.map(({selection: ref, local, frozen}) => {
    if (ref.world === "origin") return {label: "World origin", detail: "Saved origin reference"};
    const component = state.document.components[ref.component];
    const geometry = !frozen || local ? state.geometry[ref.component] : undefined;
    const edge = ref.edge && geometry?.edges?.find(e => e.signature === ref.edge);
    const face = ref.face && geometry?.faces?.find(f => f.signature === ref.face);
    const entity = edge?.name || (edge ? `Edge ${geometry!.edges!.indexOf(edge) + 1}` : face?.name || (face ? `Face ${geometry!.faces!.indexOf(face) + 1}` : ""));
    const sketch = !frozen && ref.sketch ? state.document.features[ref.sketch]?.name : "";
    const anchor = ref.anchor === "mid" ? "Midpoint" : ref.anchor === "start" ? "Start vertex" : ref.anchor === "end" ? "End vertex" : "";
    const label = sketch || (entity ? `${anchor && role !== "path" ? anchor + " · " : ""}${entity}` : ref.edge ? `${anchor && role !== "path" ? anchor + " · " : ""}Saved edge` : ref.face ? "Saved face" : feature.options.profile === "sketch" ? "Saved sketch profile" : "Saved body");
    return {label: local || !frozen ? `${label}${component ? " · " + component.name : ""}` : label,
      detail: frozen ? local ? "Original component reference · read only" : "Copied reference geometry · read only" : "Original reference · read only"};
  });
  const options = feature.options;
  const finish = ["fillet", "chamfer"].includes(options.profile);
  if (role === "target") return [];
  if (role === "origin") {
    if (finish) return [{label: "From Tool Path", detail: "Origin follows the start of the saved path"}];
    if (options.profile === "body" && options.keep_body_placement) return [{label: "From Tool Profile body", detail: "Saved body location and orientation"}];
    if (["origin_x", "origin_y", "origin_z"].some(key => key in feature.parameters)) return [{label: "Fixed origin", detail: ["x", "y", "z"].map(axis => `${axis.toUpperCase()} ${numeric(state.parameter_graph[feature.parameters[`origin_${axis}`]]?.value ?? 0, 3)}`).join(" · ") + " mm"}];
    return [{label: "Saved origin", detail: "Original placement retained"}];
  }
  if (role === "profile") {
    if (finish) return [{label: options.profile === "fillet" ? "Round corner profile" : "Bevel corner profile", detail: "Temporary profile · perpendicular to Tool Path"}];
    const profile = refs.profile && state.document.features[refs.profile];
    if (profile) return [{label: profile.name, detail: "Original sketch profile · read only"}];
    if (options.profile === "sketch" || snapshot?.profile) return [{label: "Saved sketch profile", detail: "Copied profile geometry · read only"}];
    if (["face", "body"].includes(options.profile)) return [{label: options.profile === "face" ? "Saved face profile" : "Saved tool body", detail: "Original profile geometry retained"}];
    return [{label: ["XY", "XZ", "YZ"].includes(options.plane) ? `World ${options.plane} plane` : options.plane === "perpendicular" ? "Perpendicular to Tool Path" : options.plane === "axial" ? "Contains the rotation axis" : "Saved support plane", detail: "Positioned at Tool Origin"}];
  }
  if (options.motion === "none") return [{label: "No travel", detail: "Apply the body at its saved location"}];
  if (options.motion === "mirror") return [{label: ["XY", "XZ", "YZ"].includes(options.plane) ? `World ${options.plane} plane` : "Saved mirror plane", detail: "Mirror plane through Tool Origin"}];
  return [{label: options.direction === "normal" ? "Tool Profile normal" : ["X", "Y", "Z"].includes(options.direction) ? `World ${options.direction} direction` : "Saved edge path", detail: options.direction === "edge" ? "Original path geometry retained" : "Implicit path through Tool Origin"}];
}

export function featureEditValues(feature: Feature, state: State): Record<string, string> {
  return Object.fromEntries(Object.entries(feature.parameters).map(([field, id]) => {
    const p = state.document.parameters[id];
    return [field, p.named === false ? expressionLabel(p.expression, state.document.parameters) : "@" + id];
  }));
}

export function featureEditChanges(feature: Feature, initial: Record<string, string>, values: Record<string, string>, name: string, options: Record<string, any>, suppressed: boolean) {
  const changedValues = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== initial[key]).map(([key, value]) => [key, value.startsWith("@") ? { parameter: value.slice(1) } : value]));
  const changedOptions = Object.fromEntries(Object.entries(options).filter(([key, value]) => value !== feature.options[key]));
  if (!Object.keys(changedValues).length && !Object.keys(changedOptions).length && name.trim() === feature.name && suppressed === feature.suppressed) return null;
  return { id: feature.id, name: name.trim(), values: changedValues, options: changedOptions, suppressed };
}

export function featureFieldSection(feature: Feature, field: string) {
  if (feature.type !== "operation") return ["x", "y", "z"].includes(field) ? "Position" : "Dimensions";
  if (/^(origin_|offset_)/.test(field)) return "Tool Origin";
  if (["distance", "path_percent", "angle", "count", "spacing"].includes(field) || field.startsWith("axis_")) return "Tool Path";
  return "Tool Profile";
}

export function featureFieldLabel(feature: Feature, field: string) {
  const labels: Record<string, string> = {
    width: feature.type === "operation" ? "Profile width" : "Width",
    height: feature.type === "operation" ? "Profile height" : "Height",
    diameter: "Diameter", distance: "Path distance", path_percent: "Path percentage",
    amount: feature.options.profile === "fillet" ? "Fillet radius" : "Chamfer distance",
    offset_u: "Reference offset U", offset_v: "Reference offset V", offset_n: "Reference offset N",
    origin_x: "Origin X", origin_y: "Origin Y", origin_z: "Origin Z",
    axis_x: "Axis origin X", axis_y: "Axis origin Y", axis_z: "Axis origin Z",
    angle: "Rotation angle", count: "Copies", spacing: "Spacing",
  };
  if (feature.type !== "operation" && field === "distance") return "Distance";
  const point = field.match(/^point_(\d+)_([uv])$/);
  if (point) return `Profile point ${Number(point[1]) + 1} ${point[2].toUpperCase()}`;
  return labels[field] || field.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
}

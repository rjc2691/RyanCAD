import {connectNewSketchLines} from "./sketchRelationships.ts";
import * as THREE from "three";
import { parameterNames } from "./parameterNames.ts";
import { expressionLabel } from "./api.ts";
import type { Feature, Selection, State } from "./types";
import {
  initialOperation,
  operationFrame,
} from "./operations/operationModel.ts";

export type SketchPoint = [number, number];
export type SketchTool =
  | "select"
  | "move"
  | "line"
  | "rectangle"
  | "circle"
  | "arc"
  | "point"
  | "project"
  | "dimension"
  | "connect"
  | "disconnect";
export const SKETCH_TOOL_KEYS: Record<string, SketchTool> = {
  " ": "select",
  m: "move",
  l: "line",
  r: "rectangle",
  c: "circle",
  a: "arc",
  p: "point",
  j: "project",
  d: "dimension",
  k: "connect",
  u: "disconnect",
};
export function chooseSketchTool(
  d: SketchDraft,
  tool: SketchTool,
): SketchDraft {
  return { ...d, tool, pending: [], cursor: null, relationshipFirst:null,moveOrigin:null, message: "" };
}
export interface SketchAnchor {
  id: string;
  entity: string;
  kind: "start" | "end" | "mid" | "center" | "point";
  point: SketchPoint;
}
export function sketchAnchors(
  d: Pick<SketchDraft, "entities">,
): SketchAnchor[] {
  return d.entities.flatMap((e) => {
    const anchor = (
      kind: SketchAnchor["kind"],
      point: SketchPoint,
    ): SketchAnchor => ({ id: `${e.id}:${kind}`, entity: e.id, kind, point });
    if (e.type === "line")
      return [
        anchor("start", [e.x1, e.y1]),
        anchor("end", [e.x2, e.y2]),
        anchor("mid", [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]),
      ];
    if (e.type === "point") return [anchor("point", [e.x, e.y])];
    const result = [anchor("center", [e.x, e.y])];
    if (e.type === "arc")
      for (const [kind, degrees] of [
        ["start", e.start_angle],
        ["end", e.end_angle],
        ["mid", (e.start_angle + e.end_angle) / 2],
      ] as const) {
        const angle = (degrees * Math.PI) / 180;
        result.push(
          anchor(kind, [
            e.x + e.radius * Math.cos(angle),
            e.y + e.radius * Math.sin(angle),
          ]),
        );
      }
    return result;
  });
}
export interface SketchFrame {
  origin: number[];
  u: number[];
  normal: number[];
}
export interface SketchEntity {
  id: string;
  type: "line" | "point" | "circle" | "arc";
  construction: boolean;
  fixed: boolean;
  [field: string]: any;
}
export interface SketchDraft {
  name: string;
  plane: string;
  frame: SketchFrame;
  feature?: Feature;
  entities: SketchEntity[];
  solvedEntities?: SketchEntity[];
  constraints: any[];
  tool: SketchTool;
  pending: SketchPoint[];
  cursor: SketchPoint | null;
  selected: string | null;
  selectedEntities?:string[];
  selectedPoints?:string[];
  moveOrigin?:SketchPoint|null;
  snap: number;
  gridSnapEnabled: boolean;
  selectedAnchor?: SketchAnchor | null;
  hovered?:string|null;
  hoveredAnchor?:string|null;
  relationshipFirst?:{entity:string;anchor?:SketchAnchor|null}|null;
  construction: boolean;
  fixed: boolean;
  showComponents: boolean;
  message: string;
}
export const SKETCH_FIELDS: Record<string, string[]> = {
  point: ["x", "y"],
  line: ["x1", "y1", "x2", "y2"],
  circle: ["x", "y", "radius"],
  arc: ["x", "y", "radius", "start_angle", "end_angle"],
};
export function worldSketchFrame(plane: string): SketchFrame {
  return {
    origin: [0, 0, 0],
    u: plane === "YZ" ? [0, 1, 0] : [1, 0, 0],
    normal:
      plane === "XY" ? [0, 0, 1] : plane === "XZ" ? [0, -1, 0] : [1, 0, 0],
  };
}
export function sketchBasis(frame: SketchFrame) {
  const origin = new THREE.Vector3().fromArray(frame.origin),
    u = new THREE.Vector3().fromArray(frame.u),
    normal = new THREE.Vector3().fromArray(frame.normal);
  return { origin, u, normal, v: new THREE.Vector3().crossVectors(normal, u) };
}
export function frameFromSelection(
  selection: Selection | null,
  state: State,
): SketchFrame | null {
  if(selection?.worldPlane)return worldSketchFrame(selection.worldPlane);
  if (selection?.face?.type !== "PLANE") return null;
  const f = operationFrame(initialOperation(selection, state), state);
  return {
    origin: f.origin.toArray(),
    u: f.u.toArray(),
    normal: f.normal.toArray(),
  };
}
export function startSketch(
  state: State,
  feature?: Feature,
  frame?: SketchFrame,
): SketchDraft {
  let placedFrame: SketchFrame =
    feature?.options.frame ||
    frame ||
    worldSketchFrame(feature?.options.plane || "XY");
  const occurrence =
    feature && feature.owner !== "root"
      ? state.occurrences.find((o) => o.definition === feature.owner)
      : null;
  if (occurrence) {
    const m = new THREE.Matrix4().set(
        ...(occurrence.matrix.flat() as Parameters<THREE.Matrix4["set"]>),
      ),
      f = sketchBasis(placedFrame);
    placedFrame = {
      origin: f.origin.applyMatrix4(m).toArray(),
      u: f.u.transformDirection(m).toArray(),
      normal: f.normal.transformDirection(m).toArray(),
    };
  }
  return {
    name:
      feature?.name ||
      `Sketch ${Object.values(state.document.features).filter((f) => f.type === "sketch").length + 1}`,
    plane:
      feature?.options.frame || frame || occurrence
        ? "custom"
        : feature?.options.plane || "XY",
    frame: placedFrame,
    feature,
    entities: feature
      ? feature.options.entities.map((e: any) => {
          const q = {
            ...e,
            ...Object.fromEntries(
              SKETCH_FIELDS[e.type].map((k) => [
                k,
                state.parameter_graph[feature.parameters[`${e.id}.${k}`]]
                  ?.value ?? 0,
              ]),
            ),
          };
          const solved = state.sketches?.[feature.id]?.entities?.find(
            (s: any) => s.id === e.id,
          );
          if (solved?.start && e.type === "line")
            Object.assign(q, {
              x1: solved.start[0],
              y1: solved.start[1],
              x2: solved.end[0],
              y2: solved.end[1],
            });
          else if (solved?.center)
            Object.assign(q, {
              x: solved.center[0],
              y: solved.center[1],
              radius: solved.radius,
              ...(e.type === "arc"
                ? {
                    start_angle: (solved.start_angle * 180) / Math.PI,
                    end_angle: (solved.end_angle * 180) / Math.PI,
                  }
                : {}),
            });
          else if (solved?.point)
            Object.assign(q, { x: solved.point[0], y: solved.point[1] });
          q.expressions = Object.fromEntries(SKETCH_FIELDS[e.type].flatMap(field => {
            const pid = feature.parameters[`${e.id}.${field}`], p = state.document.parameters[pid];
            return p && parameterNames(state.document.parameters, pid).length ? [[field, p.named ? `[${p.name}]` : expressionLabel(p.expression, state.document.parameters)]] : [];
          }));
          return q;
        })
      : [],
    constraints: feature
      ? feature.options.constraints.map((c: any) => ({
          ...c,
        parameterName: c.parameter_key ? parameterNames(state.document.parameters, feature.parameters[c.parameter_key]).join(", ") : undefined,
        ...(c.parameter_key && parameterNames(state.document.parameters, feature.parameters[c.parameter_key]).length ? {
          pendingExpression: state.document.parameters[feature.parameters[c.parameter_key]]?.named
            ? `[${state.document.parameters[feature.parameters[c.parameter_key]].name}]`
            : expressionLabel(state.document.parameters[feature.parameters[c.parameter_key]].expression, state.document.parameters),
        } : {}),
          ...(c.parameter_key
            ? {
                value:
                  state.parameter_graph[feature.parameters[c.parameter_key]]
                    ?.value,
              }
            : {}),
        }))
      : [],
    tool: "line",
    pending: [],
    cursor: null,
    selected: null,
    snap: 1,
    gridSnapEnabled: true,
    construction: false,
    fixed: true,
    showComponents: true,
    message: "",
  };
}
export function entityPoints(e: SketchEntity): SketchPoint[] {
  if (e.type === "point") return [[e.x, e.y]];
  if (e.type === "line")
    return [
      [e.x1, e.y1],
      [e.x2, e.y2],
    ];
  const start = e.type === "circle" ? 0 : (e.start_angle * Math.PI) / 180,
    end = e.type === "circle" ? Math.PI * 2 : (e.end_angle * Math.PI) / 180;
  return Array.from({ length: 65 }, (_, i) => {
    const t = start + ((end - start) * i) / 64;
    return [
      e.x + e.radius * Math.cos(t),
      e.y + e.radius * Math.sin(t),
    ] as SketchPoint;
  });
}
function addEntities(
  d: SketchDraft,
  items: Partial<SketchEntity>[],
): SketchDraft {
  let next = Math.max(
    0,
    ...d.entities.map((e) => Number(e.id.replace(/^e/, "")) || 0),
  );
  const entities = items.map(
    (item) =>
      ({
        construction: d.construction,
        fixed: d.fixed,
        ...item,
        id: `e${++next}`,
      }) as SketchEntity,
  );
  return {
    ...d,
    entities: [...d.entities, ...entities],
    selectedAnchor: null,
    selected: entities.at(-1)?.id || null,
    selectedEntities:entities.length?[entities.at(-1)!.id]:[],selectedPoints:[],
    message: "",
  };
}
export function snapSketchPoint(
  d: SketchDraft,
  p: SketchPoint,
  tolerance: number,
): SketchPoint {
  const anchors: SketchPoint[] = [[0, 0], ...d.pending];
  anchors.push(...sketchAnchors(d).map((a) => a.point));
  let best = anchors
    .filter((a) => Math.hypot(a[0] - p[0], a[1] - p[1]) <= tolerance)
    .sort(
      (a, b) =>
        Math.hypot(a[0] - p[0], a[1] - p[1]) -
        Math.hypot(b[0] - p[0], b[1] - p[1]),
    )[0];
  if (best) return [...best];
  // Geometry is evaluated in raw pointer coordinates, before grid rounding.
  let closest: SketchPoint | null = null,
    distance = tolerance;
  for (const e of d.entities) {
    let q: SketchPoint;
    if (e.type === "line") {
      const dx = e.x2 - e.x1,
        dy = e.y2 - e.y1,
        length = dx * dx + dy * dy;
      const t = length
        ? Math.max(
            0,
            Math.min(1, ((p[0] - e.x1) * dx + (p[1] - e.y1) * dy) / length),
          )
        : 0;
      q = [e.x1 + t * dx, e.y1 + t * dy];
    } else if (e.type === "circle" || e.type === "arc") {
      let angle = Math.atan2(p[1] - e.y, p[0] - e.x);
      if (e.type === "arc") {
        const start = (e.start_angle * Math.PI) / 180,
          end = (e.end_angle * Math.PI) / 180;
        while (angle < start) angle += Math.PI * 2;
        if (angle > end) continue;
      }
      q = [e.x + e.radius * Math.cos(angle), e.y + e.radius * Math.sin(angle)];
    } else continue;
    const gap = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (gap <= distance) {
      closest = q;
      distance = gap;
    }
  }
  if (closest) return closest;
  const result = p.map((x) =>
    d.gridSnapEnabled !== false && d.snap > 0
      ? Math.round(x / d.snap) * d.snap
      : x,
  ) as SketchPoint;
  if (d.pending.length && d.tool === "line") {
    const a = d.pending[0];
    if (Math.abs(result[0] - a[0]) < tolerance) result[0] = a[0];
    if (Math.abs(result[1] - a[1]) < tolerance) result[1] = a[1];
  }
  return result.map((x) => Math.round(x * 1e6) / 1e6) as SketchPoint;
}
/** A new segment closes an outline if its ends already share a non-collinear path. */
function closesLineOutline(d:SketchDraft,a:SketchPoint,b:SketchPoint){
  const near=(p:SketchPoint,q:SketchPoint)=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-6;
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const edges=d.entities.filter(e=>['line','arc'].includes(e.type)&&!!e.construction===!!d.construction).map(e=>entityPoints(e));
  const queue:{point:SketchPoint;bent:boolean}[]=[{point:a,bent:false}],seen:typeof queue=[];
  while(queue.length){
    const current=queue.shift()!;
    if(seen.some(s=>near(s.point,current.point)))continue;
    seen.push(current);
    if(near(current.point,b))return current.bent;
    for(const ps of edges){
      const first=ps[0],last=ps.at(-1)!;if(!first||near(first,last))continue;
      if(!near(current.point,first)&&!near(current.point,last))continue;
      const bent=current.bent||ps.some(p=>Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))/length>1e-6);
      queue.push({point:near(current.point,first)?last:first,bent});
    }
  }
  return false;
}
export function sketchClick(
  d: SketchDraft,
  p: SketchPoint,
  tolerance = 0.5,
): SketchDraft {
  if (d.tool === "select") {
    const anchor = sketchAnchors(d)
      .filter(
        (a) => Math.hypot(a.point[0] - p[0], a.point[1] - p[1]) <= tolerance*(a.kind==="point"?1:0.55),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.point[0] - p[0], a.point[1] - p[1]) -
          Math.hypot(b.point[0] - p[0], b.point[1] - p[1]),
      )[0];
    if (anchor)
      return { ...d, selected: anchor.entity, selectedAnchor: anchor };
    let best: string | null = null,
      distance = tolerance;
    for (const e of d.entities) {
      const ps = entityPoints(e);
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i],
          b = ps[Math.min(i + 1, ps.length - 1)],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          len = dx * dx + dy * dy;
        const t = len
          ? Math.max(
              0,
              Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len),
            )
          : 0;
        const v = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
        if (v <= distance) {
          distance = v;
          best = e.id;
        }
      }
    }
    return { ...d, selected: best, selectedAnchor: null };
  }
  p = snapSketchPoint(d, p, tolerance);
  if (d.tool === "point")
    return addEntities(d, [{ type: "point", x: p[0], y: p[1] }]);
  if (d.tool === "project") return d;
  if (!d.pending.length) return { ...d, pending: [p], cursor: p };
  const a = d.pending[0];
  if (Math.hypot(p[0] - a[0], p[1] - a[1]) < 1e-6)
    return { ...d, message: "Choose a different point." };
  if (d.tool === "line") {
    const closed=closesLineOutline(d,a,p);
    return connectNewSketchLines(d,{
      ...addEntities(d, [
        { type: "line", x1: a[0], y1: a[1], x2: p[0], y2: p[1] },
      ]),
      pending: closed?[]:[p],
      cursor:closed?null:p,
    });
  }
  if (d.tool === "rectangle") {
    if (Math.abs(p[0] - a[0]) < 1e-6 || Math.abs(p[1] - a[1]) < 1e-6)
      return { ...d, message: "Rectangle width and height must be nonzero." };
    const corners = [a, [p[0], a[1]], p, [a[0], p[1]], a];
    return connectNewSketchLines(d,{
      ...addEntities(
        d,
        corners.slice(0, 4).map((c, i) => ({
          type: "line",
          x1: c[0],
          y1: c[1],
          x2: corners[i + 1][0],
          y2: corners[i + 1][1],
        })),
      ),
      pending: [],
    });
  }
  const radius = Math.hypot(p[0] - a[0], p[1] - a[1]);
  if (d.tool === "circle")
    return {
      ...addEntities(d, [{ type: "circle", x: a[0], y: a[1], radius }]),
      pending: [],
    };
  if (d.pending.length === 1) return { ...d, pending: [a, p] };
  const b = d.pending[1],
    start = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  let end = (Math.atan2(p[1] - a[1], p[0] - a[0]) * 180) / Math.PI;
  while (end <= start) end += 360;
  return {
    ...addEntities(d, [
      {
        type: "arc",
        x: a[0],
        y: a[1],
        radius: Math.hypot(b[0] - a[0], b[1] - a[1]),
        start_angle: start,
        end_angle: end,
      },
    ]),
    pending: [],
  };
}
/** Project existing native display curves into this frame; deliberately copied geometry. */
export function projectSketchReference(
  d: SketchDraft,
  selection: Selection | null,
  state: State,
): SketchDraft {
  if (!selection)
    return {
      ...d,
      message: "Pick an edge, vertex or planar face from a visible component.",
    };
  const o = state.occurrences.find((o) => o.id === selection.occurrence);
  if (!o) return d;
  const matrix = new THREE.Matrix4().set(
      ...(o.matrix.flat() as Parameters<THREE.Matrix4["set"]>),
    ),
    f = sketchBasis(d.frame);
  const local = (p: number[]) => {
    const v = new THREE.Vector3()
      .fromArray(p)
      .applyMatrix4(matrix)
      .sub(f.origin);
    return [v.dot(f.u), v.dot(f.v)] as SketchPoint;
  };
  if (selection.vertex)
    return {
      ...addEntities({ ...d, construction: true }, [
        {
          type: "point",
          x: local(selection.vertex.point)[0],
          y: local(selection.vertex.point)[1],
        },
      ]),
      construction: d.construction,
      message: "Projected copy · independent of source edits",
    };
  const edges = selection.edge
    ? [selection.edge]
    : (state.geometry[selection.definition]?.edges || []).filter((e) =>
        selection.face?.edge_signatures?.includes(e.signature),
      );
  const lines: Partial<SketchEntity>[] = [];
  for (const edge of edges) {
    const ps = (
      edge.samples?.length ? edge.samples : [edge.start, edge.end]
    ).map(local);
    for (let i = 1; i < ps.length; i++)
      if (Math.hypot(ps[i][0] - ps[i - 1][0], ps[i][1] - ps[i - 1][1]) > 1e-6)
        lines.push({
          type: "line",
          x1: ps[i - 1][0],
          y1: ps[i - 1][1],
          x2: ps[i][0],
          y2: ps[i][1],
        });
  }
  if (!lines.length)
    return {
      ...d,
      message: "This reference has no usable projection onto the sketch plane.",
    };
  if (lines.length + d.entities.length > 200)
    return {
      ...d,
      message:
        "Projection exceeds the 200-entity sketch limit. Pick a smaller reference.",
    };
  return {
    ...addEntities({ ...d, construction: true }, lines),
    construction: d.construction,
    message:
      "Projected copy · curves are sampled construction lines, independent of source edits",
  };
}

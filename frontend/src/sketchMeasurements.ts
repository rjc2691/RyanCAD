import {lineSeparation} from "./sketchDimensions.ts";
import type { SketchDraft, SketchEntity, SketchPoint } from "./sketchModel";
import {sketchAngle,sketchAxisAngle,interiorAngleValue} from "./sketchAngles.ts";
export type SketchAnnotation = {
  id: string;
  kind: "length" | "distance" | "angle";
  constrained: boolean;
  label: string;
  start: SketchPoint;
  end: SketchPoint;
  vertex?: SketchPoint;
  parameterName?: string;
  reflex?: boolean;
  axis?:string;
};
const fmt = (n: number) =>
  Number(n.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const end = (e: SketchEntity, n: 1 | 2): SketchPoint => [
  e[`x${n}`],
  e[`y${n}`],
];
const dist = (a: SketchPoint, b: SketchPoint) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const text = (c: any, measured: number, unit: string) => {
  const value =
    typeof c?.value === "number" && Number.isFinite(c.value)
      ? fmt(c.value)
      : typeof c?.value === "string" && c.value.trim()
        ? c.value.trim()
        : fmt(measured);
  return `${c?.parameterName ? "p: " : ""}${value} ${unit}`;
};
export function sketchMeasurements(
  d: Pick<SketchDraft, "entities" | "constraints"> & Partial<Pick<SketchDraft,"frame">>,
): SketchAnnotation[] {
  const lines = d.entities.filter(
    (e) => e.type === "line" && dist(end(e, 1), end(e, 2)) > 1e-8,
  );
  const out: SketchAnnotation[] = [];
  for (const e of lines) {
    const a = end(e, 1),
      b = end(e, 2),
      length = dist(a, b);
    const c = d.constraints.find(
      (c) =>
        c.type === "distance" &&
        ((c.a === `${e.id}.start` && c.b === `${e.id}.end`) ||
          (c.b === `${e.id}.start` && c.a === `${e.id}.end`)),
    );
    out.push({
      id: `length:${e.id}`,
      kind: "length",
      constrained: !!c,
      parameterName: c?.parameterName,
      label: text(c, length, "mm"),
      start: a,
      end: b,
    });
  }
  for(const c of d.constraints.filter(c=>c.type==="line_distance")){
    const a=lines.find(e=>e.id===c.a),b=lines.find(e=>e.id===c.b);if(!a||!b)continue;
    const span=lineSeparation(a,b);
    out.push({id:`line_distance:${c.a}:${c.b}`,kind:"distance",constrained:true,label:text(c,span.value,"mm"),start:span.start,end:span.end,parameterName:c.parameterName});
  }
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i],
        b = lines[j];
      const c = d.constraints.find(
        (c) =>
          c.type === "angle" &&
          ((c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id)),
      );
      const corner=sketchAngle(d.entities,a,b);
      if(!corner.connected&&!c)continue;
      const {vertex,start:u,end:v}=corner,angle=c?.angle_frame&&typeof c.value==="number"?c.value:corner.value;
      const displayConstraint=c&&!c.angle_frame&&typeof c.value==="number"?{...c,value:interiorAngleValue(c.a===a.id?c.value:-c.value,corner.frame)}:c;
      if (!Number.isFinite(angle) || (!c && (angle < 1 || angle > 359)))
        continue;
      out.push({
        id: `angle:${a.id}:${b.id}`,
        kind: "angle",
        constrained: !!c,
        parameterName: c?.parameterName,
        label: text(displayConstraint, angle, "°"),
        start: u,
        end: v,
        vertex,
        reflex: angle>180,
      });
    }
  for(const c of d.constraints.filter(c=>c.type==="angle"&&c.b?.startsWith("world:"))){
    const e=lines.find(e=>e.id===c.a);if(!e)continue;
    try{
      const axis=c.b.slice(6),corner=sketchAxisAngle(d.frame||{origin:[0,0,0],u:[1,0,0],normal:[0,0,1]},axis,e),length=Math.hypot(e.x2-e.x1,e.y2-e.y1);
      out.push({id:`angle:${e.id}:${c.b}`,kind:"angle",constrained:true,label:`${text(c,corner.value,"\u00b0")} \u00b7 ${axis}`,parameterName:c.parameterName,vertex:[e.x1,e.y1],start:[e.x2,e.y2],end:[e.x1+corner.direction[0]*length,e.y1+corner.direction[1]*length],axis});
    }catch{/* An unavailable axis is reported by the solver, not drawn at an arbitrary angle. */}
  }
  return out;
}

import {sketchAngle,sketchAxisAngle,interiorAngleExpression} from "./sketchAngles.ts";
import {expressionLabel} from "./api.ts";
import type {SketchDraft,SketchEntity,SketchPoint} from "./sketchModel";
import type {State} from "./types";

export type DimensionKind="length"|"distance"|"angle";
export interface DimensionCandidate {
  id:string;kind:DimensionKind;label:string;line:string;second:string|null;
  type:"distance"|"line_distance"|"angle";a:string;b:string;measured:number;
  constraint?:any;angleFrame?:any;
}
export interface SketchDimensionEditorState {
  line:string;second?:string|null;value:string;error?:string;kind?:DimensionKind;
  annotation?:string;choices?:{id:string;label:string}[];choice?:number;
}
const lineLength=(e:SketchEntity)=>Math.hypot(e.x2-e.x1,e.y2-e.y1);
export function parallelLines(a:SketchEntity,b:SketchEntity){
  const scale=lineLength(a)*lineLength(b);
  return scale>1e-12&&Math.abs((a.x2-a.x1)*(b.y2-b.y1)-(a.y2-a.y1)*(b.x2-b.x1))/scale<=1e-6;
}
/** Perpendicular span, anchored near the middle of the selected lines. */
export function lineSeparation(a:SketchEntity,b:SketchEntity){
  const dx=a.x2-a.x1,dy=a.y2-a.y1,length=lineLength(a);
  const end:SketchPoint=[(b.x1+b.x2)/2,(b.y1+b.y2)/2];
  const t=((end[0]-a.x1)*dx+(end[1]-a.y1)*dy)/(length*length);
  const start:SketchPoint=[a.x1+t*dx,a.y1+t*dy];
  return {start,end,value:Math.hypot(end[0]-start[0],end[1]-start[1])};
}
/** Ordered candidates are computed from committed sketch geometry, never a tentative preview. */
export function dimensionCandidates(d:SketchDraft,ids:string[],axis?:string):DimensionCandidate[]{
  const entities=d.solvedEntities||d.entities;
  const lines=[...new Set(ids)].map(id=>entities.find(e=>e.id===id&&e.type==="line")).filter((e):e is SketchEntity=>!!e&&lineLength(e)>1e-8);
  if(lines.length!==ids.length||!lines.length||lines.length>2)return [];
  const existing=(type:string,a:string,b:string)=>d.constraints.find(c=>c.type===type&&((c.a===a&&c.b===b)||(c.a===b&&c.b===a)));
  const first=lines[0];
  if(axis){
    const corner=sketchAxisAngle(d.frame,axis,first),b=`world:${axis}`,c=existing("angle",first.id,b);
    return [{id:`angle:${first.id}:${b}`,kind:"angle",label:`Angle to ${axis}`,line:first.id,second:b,type:"angle",a:first.id,b,measured:corner.value,constraint:c,angleFrame:c?.angle_frame||corner.frame}];
  }
  if(lines.length===1){
    const a=`${first.id}.start`,b=`${first.id}.end`,c=existing("distance",a,b);
    return [{id:`length:${first.id}`,kind:"length",label:"Length",line:first.id,second:null,type:"distance",a:c?.a||a,b:c?.b||b,measured:lineLength(first),constraint:c}];
  }
  const second=lines[1],c=existing("angle",first.id,second.id);
  const a=c?entities.find(e=>e.id===c.a)!:first,b=c?entities.find(e=>e.id===c.b)!:second;
  const corner=sketchAngle(entities,a,b);
  const angle:DimensionCandidate={id:`angle:${a.id}:${b.id}`,kind:"angle",label:"Angle",line:a.id,second:b.id,type:"angle",a:a.id,b:b.id,measured:corner.value,constraint:c,angleFrame:c?.angle_frame||corner.frame};
  if(!parallelLines(first,second))return [angle];
  const distance=existing("line_distance",first.id,second.id),la=distance?entities.find(e=>e.id===distance.a)!:first,lb=distance?entities.find(e=>e.id===distance.b)!:second;
  return [{id:`line_distance:${la.id}:${lb.id}`,kind:"distance",label:"Distance",line:la.id,second:lb.id,type:"line_distance",a:la.id,b:lb.id,measured:lineSeparation(la,lb).value,constraint:distance},angle];
}

export function candidateExpression(c:DimensionCandidate,d:SketchDraft,state:State){
  const old=c.constraint,p=old?.parameter_key&&d.feature&&state.document.parameters[d.feature.parameters[old.parameter_key]];
  let value=old?.pendingExpression??(p?(p.named?`[${p.name}]`:expressionLabel(p.expression,state.document.parameters)):String(old?.value??Number(c.measured.toFixed(4))));
  if(c.kind==="angle"&&old&&!old.angle_frame&&!c.b.startsWith("world:"))value=interiorAngleExpression(value,Number(old.value??0),c.angleFrame);
  return String(value);
}

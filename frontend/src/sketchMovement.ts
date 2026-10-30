import {sketchAnchors,type SketchDraft,type SketchPoint} from "./sketchModel.ts";
import {anchorReference,freeRelationshipGeometry} from "./sketchRelationships.ts";
import {solveSketchDraft} from "./solveSketchDraft.ts";
import type {State} from "./types";

export function sketchMovePoints(d:SketchDraft):string[]{
  const points=new Set<string>();
  for(const id of d.selectedEntities||(!d.selectedAnchor&&d.selected?[d.selected]:[])){
    const e=d.entities.find(e=>e.id===id);if(!e)continue;
    if(e.type==="line"){points.add(`${id}.start`);points.add(`${id}.end`);}
    else if(e.type==="point")points.add(id);
    else throw new Error("Select a line, line endpoint, or point to move.");
  }
  for(const id of d.selectedPoints||(d.selectedAnchor?[d.selectedAnchor.id]:[])){
    const a=sketchAnchors(d).find(a=>a.id===id);if(!a)continue;
    const e=d.entities.find(e=>e.id===a.entity)!;
    if(e.type==="line"&&a.kind==="mid"){points.add(`${e.id}.start`);points.add(`${e.id}.end`);}
    else if(e.type==="point"||e.type==="line"&&["start","end"].includes(a.kind))points.add(anchorReference(a));
    else throw new Error("Select a line, line endpoint, or point to move.");
  }
  return [...points];
}
export function sketchMoveOrigin(d:SketchDraft):SketchPoint|null{
  const refs=sketchMovePoints(d),anchors=sketchAnchors(d);
  const points=refs.map(ref=>anchors.find(a=>anchorReference(a)===ref)?.point).filter((p):p is SketchPoint=>!!p);
  if(!points.length)return null;
  return [points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length];
}
export function sketchMoveCandidate(d:SketchDraft,delta:SketchPoint){
  const refs=sketchMovePoints(d);
  if(!refs.length)throw new Error("Select a point or line to move.");
  if(!delta.every(Number.isFinite))throw new Error("Enter finite movement coordinates.");
  // A fixed point can be indirectly attached to the selected point by coincidence.
  const connected=new Set(refs);let expanded=true;
  while(expanded){expanded=false;for(const c of d.constraints){if(c.type!=="coincident")continue;if(connected.has(c.a)&&!connected.has(c.b)){connected.add(c.b);expanded=true;}if(connected.has(c.b)&&!connected.has(c.a)){connected.add(c.a);expanded=true;}}}
  if(d.constraints.some(c=>c.type==="fix"&&connected.has(c.a)))throw new Error("Remove the fixed-point relationship before moving this point.");
  const moved=new Set(refs),entities=freeRelationshipGeometry(d,refs).map(e=>{
    const next={...e};
    if(e.type==="line")for(const [anchor,x,y] of [["start","x1","y1"],["end","x2","y2"]] as const){
      if(!moved.has(`${e.id}.${anchor}`))continue;
      next[x]+=delta[0];next[y]+=delta[1];
      if(next.expressions){next.expressions={...next.expressions};delete next.expressions[x];delete next.expressions[y];}
    }
    if(e.type==="point"&&moved.has(e.id)){next.x+=delta[0];next.y+=delta[1];next.expressions={};}
    return next;
  });
  // Temporary fixed targets give the solver a concrete destination. They never
  // become persistent sketch constraints or change named parameter values.
  return {...d,entities,solvedEntities:undefined,constraints:[...d.constraints,...refs.map(a=>({type:"fix",a,b:""}))]};
}
export async function solveSketchMove(d:SketchDraft,delta:SketchPoint,state:State):Promise<SketchDraft>{
  const solved=await solveSketchDraft(sketchMoveCandidate(d,delta),state);
  return {...solved,constraints:d.constraints,moveOrigin:null,pending:[]};
}

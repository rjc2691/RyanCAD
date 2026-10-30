import {api,waitJob} from "./api.ts";
import {expressionParameterNames} from "./parameterNames.ts";
import type {SketchDraft} from "./sketchModel";
import type {State} from "./types";

export function sketchDraftCommand(d:SketchDraft){
  const constraints=d.constraints.map(({pendingExpression,...c})=>pendingExpression!==undefined?{...c,value:pendingExpression}:c);
  const args={name:d.name,entities:d.entities,constraints};
  return d.feature?{name:"sketch.update",args:{...args,feature_id:d.feature.id}}:
    {name:"sketch.create",args:{...args,owner:"root",plane:d.plane==="custom"?"XY":d.plane,frame:d.frame}};
}
export async function solveSketchDraft(d:SketchDraft,state:State):Promise<SketchDraft>{
  if(!d.entities.length)return {...d,solvedEntities:undefined};
  const submission=await api("/sketch-preview",{method:"POST",body:JSON.stringify({...sketchDraftCommand(d),expected_revision:state.document.revision})});
  const result=await waitJob(submission);
  const entities=d.entities.map(e=>{
    const q=result.sketch.entities.find((x:any)=>x.id===e.id);if(!q)return e;
    if(e.type==="line")return {...e,x1:q.start[0],y1:q.start[1],x2:q.end[0],y2:q.end[1]};
    if(e.type==="point")return {...e,x:q.point[0],y:q.point[1]};
    return {...e,x:q.center[0],y:q.center[1],radius:q.radius,...(e.type==="arc"?{start_angle:q.start_angle*180/Math.PI,end_angle:q.end_angle*180/Math.PI}:{})};
  });
  const constraints=d.constraints.map((c,i)=>result.constraint_values[i]==null?c:{...c,value:result.constraint_values[i],
    parameterName:expressionParameterNames(state.document.parameters,String(c.pendingExpression||"")).join(", ")||c.parameterName});
  return {...d,entities,solvedEntities:undefined,constraints,message:""};
}

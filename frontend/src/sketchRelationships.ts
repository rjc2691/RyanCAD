import type {SketchDraft,SketchEntity,SketchAnchor} from "./sketchModel";

export function anchorReference(anchor:SketchAnchor){
  return anchor.kind==="point"?anchor.entity:`${anchor.entity}.${anchor.kind}`;
}
export function editableEndpoint(anchor?:SketchAnchor|null){
  return !!anchor&&["start","end","point","center"].includes(anchor.kind);
}
export function freeRelationshipGeometry(d:SketchDraft,involved:string[]):SketchEntity[]{
  const ids=new Set(involved.map(id=>id.split('.')[0]));
  let changed=true;
  while(changed){changed=false;for(const c of d.constraints){
    if(c.type!=="coincident")continue;
    const pair=[c.a,c.b].filter(Boolean).map((r:string)=>r.split('.')[0]);
    if(pair.some((id:string)=>ids.has(id)))for(const id of pair)if(!ids.has(id)){ids.add(id);changed=true;}
  }}
  return (d.solvedEntities||d.entities).map(e=>ids.has(e.id)?{...e,fixed:false}:e);
}
export function deleteSketchSelection(d:SketchDraft):SketchDraft{
  if(!d.selected)return d;
  const ids=new Set([d.selected,...(d.selectedEntities||[]),...(d.selectedPoints||[]).map(p=>p.split(":")[0])]);
  return {...d,entities:(d.solvedEntities||d.entities).filter(e=>!ids.has(e.id)),solvedEntities:undefined,
    constraints:d.constraints.filter(c=>![c.a,c.b].some(r=>[...ids].some(id=>r===id||r?.startsWith(id+'.')))),
    selected:null,selectedEntities:[],selectedPoints:[],selectedAnchor:null,hovered:null,hoveredAnchor:null,relationshipFirst:null,pending:[],message:""};
}

/** Snapped endpoints create real connections, rather than merely equal coordinates. */
export function connectNewSketchLines(before:SketchDraft,after:SketchDraft):SketchDraft{
  const previous=new Set(before.entities.map(e=>e.id));
  const lines=after.entities.filter(e=>e.type==="line");
  const constraints=[...after.constraints],involved:string[]=[];
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
    const a=lines[i],b=lines[j];
    if(previous.has(a.id)&&previous.has(b.id)||a.construction!==b.construction)continue;
    for(const [anchorA,x,y] of [["start",a.x1,a.y1],["end",a.x2,a.y2]] as const)
      for(const [anchorB,u,v] of [["start",b.x1,b.y1],["end",b.x2,b.y2]] as const){
        if(Math.hypot(x-u,y-v)>1e-7)continue;
        const first=`${a.id}.${anchorA}`,second=`${b.id}.${anchorB}`;
        if(constraints.some(c=>c.type==="coincident"&&((c.a===first&&c.b===second)||(c.a===second&&c.b===first))))continue;
        // A joint needs a spanning tree, not every pair of overlapping endpoints.
        const seen=new Set([first]);let changed=true;
        while(changed){changed=false;for(const c of constraints){if(c.type!=="coincident")continue;if(seen.has(c.a)&&!seen.has(c.b)){seen.add(c.b);changed=true;}if(seen.has(c.b)&&!seen.has(c.a)){seen.add(c.a);changed=true;}}}
        if(seen.has(second))continue;
        constraints.push({type:"coincident",a:first,b:second});involved.push(a.id,b.id);
      }
  }
  return involved.length?{...after,constraints,entities:freeRelationshipGeometry({...after,constraints},involved)}:after;
}

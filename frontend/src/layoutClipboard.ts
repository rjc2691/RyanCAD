import * as THREE from "three";
import type {State,Selection} from "./types";
import {selectionMembers} from "./operations/groupedSelection.ts";

export interface LayoutClipboard {document:string;parts:{part:string;variation?:string|null;matrix:number[][]}[];}
/** Copy placement snapshots, sharing the reusable part definition. */
export function copyLayoutParts(state:State,selection:Selection|null):LayoutClipboard|null{
  const ids=new Set(selectionMembers(selection).map(s=>s.occurrence));
  const rows=state.occurrences.filter(o=>ids.has(o.id)&&o.structure_role==="part"&&o.layout===state.document.active_layout&&!o.library&&!o.suppressed);
  if(!rows.length)return null;
  if(rows.length>100)throw Error("Copy up to 100 parts at a time.");
  return {document:state.document.id,parts:rows.map(o=>({part:o.definition,variation:o.variation,matrix:o.matrix.map(row=>[...row])}))};
}
export function pasteLayoutParts(state:State,clipboard:LayoutClipboard,scope:string,offset=30){
  if(clipboard.document!==state.document.id)throw Error("Paste parts into the design they were copied from.");
  const destination=state.occurrences.find(o=>o.id===scope&&o.layout===state.document.active_layout&&!o.library&&(o.structure_role==="layout"||o.structure_role==="group"))
    ||state.occurrences.find(o=>o.parent==="root"&&o.definition===state.document.active_layout);
  if(!destination)throw Error("Choose a layout before pasting parts.");
  const matrix=(rows:number[][])=>new THREE.Matrix4().set(...rows.flat() as Parameters<THREE.Matrix4["set"]>);
  const inverse=matrix(destination.matrix).invert();
  return clipboard.parts.map(item=>{
    if(state.document.components[item.part]?.structure_role!=="part"||item.variation&&!state.document.variations?.[item.variation])throw Error("A copied part or variation no longer exists.");
    const world=matrix(item.matrix);world.elements[12]+=offset;
    const local=inverse.clone().multiply(world),position=new THREE.Vector3().setFromMatrixPosition(local),angles=new THREE.Euler().setFromRotationMatrix(local,"XYZ");
    const placement=Object.fromEntries([...["x","y","z"].map((key,i)=>[key,position.getComponent(i)]),...["rx","ry","rz"].map((key,i)=>[key,THREE.MathUtils.radToDeg([angles.x,angles.y,angles.z][i])])]);
    return {name:"part.insert",args:{part:item.part,parent:destination.definition,variation:item.variation,placement}};
  });
}

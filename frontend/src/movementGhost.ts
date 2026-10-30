import * as THREE from "three";
import type {Selection} from "./types";

/** Non-pickable reference drawing at the committed placement. Shared edge buffers stay source-owned. */
export function syncMovementGhost(ghost:THREE.Group,parts:THREE.Group,target?:Selection|null,clip:THREE.Plane[]=[]){
  const sources=target?parts.children.filter(g=>{const id=g.userData.occurrence?.id;return id&&(id===target.occurrence||id.startsWith(target.occurrence+"/"));}):[];
  const key=sources.map(g=>`${g.userData.occurrence.id}:${g.userData.asset?.edges?.uuid}`).join('|');
  if(ghost.userData.key!==key){
    ghost.traverse((g:any)=>g.material?.dispose());ghost.clear();ghost.userData.key=key;
    for(const source of sources){
      const geometry=source.userData.asset?.edges;if(!geometry)continue;
      const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#afbdd3',transparent:true,opacity:.32,depthTest:false,depthWrite:false}));
      line.matrixAutoUpdate=false;line.matrix.set(...source.userData.occurrence.matrix.flat() as Parameters<THREE.Matrix4['set']>);
      line.renderOrder=3;line.raycast=()=>{};ghost.add(line);
    }
  }
  ghost.traverse((g:any)=>{if(g.material)g.material.clippingPlanes=clip;});
  ghost.visible=!!target;
}

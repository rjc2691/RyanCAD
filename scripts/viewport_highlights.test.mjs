import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {highlight,disposeOverlay,hoverIntent} from '../frontend/src/viewportHighlights.ts';
import {SELECTION_COLOR,HOVER_COLOR} from '../frontend/src/viewportOperationDisplay.ts';

const asset=()=>({geometry:new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,10,0,0,0,10,0],3)).setIndex([0,1,2]),edges:new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,10,0,0],3))});
const base={definition:'p',occurrence:'i'},edge={...base,edge:{signature:'e',segment_start:0,segment_count:1}},face={...base,face:{signature:'f',type:'PLANE',triangle_start:0,triangle_count:1}},vertex={...base,vertex:{point:[0,0,0],anchor:'start',edge:edge.edge}};
test('selected edge has the cyan halo/core; click target has the restrained blue stroke',()=>{
 const a=asset(),selected=highlight(edge,a,[],'selected'),hover=highlight(edge,a,[],'hover');
 assert.equal(SELECTION_COLOR,'#8be9ff');assert.equal(HOVER_COLOR,'#2455a4');
 assert.equal(hover.material.color.getHexString(),HOVER_COLOR.slice(1));assert(selected.children.some(o=>o.material.color.getHexString()===SELECTION_COLOR.slice(1)));
 assert(Math.max(...selected.children.map(o=>o.material.linewidth))>hover.material.linewidth);
 assert(selected.children.every(o=>!o.material.depthWrite&&!o.material.depthTest));
});

test('face hover owns its buffers and renders a distinct fill/boundary above selection',()=>{
 const a=asset(),selected=highlight(face,a,[],'selected'),hover=highlight(face,a,[],'hover');
 const fill=hover.children.find(o=>o.isMesh);assert.notEqual(fill.geometry.getAttribute('position'),a.geometry.getAttribute('position'));assert.equal(fill.material.color.getHexString(),HOVER_COLOR.slice(1));assert(fill.renderOrder>selected.children.find(o=>o.isMesh).renderOrder);
 const boundaryOnly=highlight(face,a,[],'hover',false);assert(boundaryOnly.material.isLineMaterial);
});
test('selected vertex uses the cyan ring, hover vertex a smaller blue diamond; marker maps are released',()=>{
 const a=asset(),hover=highlight(vertex,a,[],'hover'),selected=highlight(vertex,a,[],'selected');
 assert(selected.material.size>hover.material.size);assert.notDeepEqual(hover.material.map.image.data,selected.material.map.image.data);
 let disposed=0;hover.material.map.addEventListener('dispose',()=>disposed++);const group=new THREE.Group();group.add(hover);disposeOverlay(group);assert.equal(disposed,1);
});
test('removing highlights never disposes the shared native mesh or edge buffers',()=>{
 const a=asset();let disposed=0;a.geometry.addEventListener('dispose',()=>disposed++);a.edges.addEventListener('dispose',()=>disposed++);
 const group=new THREE.Group();for(const s of [edge,face,vertex])group.add(highlight(s,a,[],'hover'));disposeOverlay(group);assert.equal(disposed,0);assert.equal(group.children.length,0);
});
test('click target copy reflects actual role, Shift toggles, and incompatible picks',()=>{
 assert.equal(hoverIntent(edge,null,undefined,null,false),'Click selects this edge');
 assert.equal(hoverIntent(edge,edge,undefined,null,true),'Shift-click removes this edge');
 const draft={profile:'face',pathReference:{selection:edge},profileReference:{selection:face}};
 assert.equal(hoverIntent(edge,null,draft,null,false),'Click replaces Tool Path');assert.equal(hoverIntent(face,null,draft,'path',false),'Tool Path needs an edge');
 assert.match(hoverIntent(face,null,draft,'plane',true),/support plane/);assert.match(hoverIntent(vertex,null,draft,'origin',true),/Tool Origin/);
});

test('whole component reference hover outlines all native edges without consuming shared buffers',()=>{
 const a=asset(),overlay=highlight(base,a,[],'hover',false);assert(overlay);assert.equal(overlay.material.color.getHexString(),HOVER_COLOR.slice(1));
 let disposed=0;a.geometry.addEventListener('dispose',()=>disposed++);a.edges.addEventListener('dispose',()=>disposed++);const group=new THREE.Group();group.add(overlay);disposeOverlay(group);assert.equal(disposed,0);
});

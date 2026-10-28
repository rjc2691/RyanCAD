import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {syncOperationAppearance,disposePreview,operationDisplayContext,SELECTION_COLOR,COMPONENT_SELECTION_COLOR} from '../frontend/src/viewportOperationDisplay.ts';

function fixture() {
  const parts=new THREE.Group();
  const occurrences=[{id:'target',definition:'p',color:'#aaccee'},{id:'linked',definition:'p',color:'#aaccee'},{id:'context',definition:'q',color:'#ccaa88'}];
  for(const occurrence of occurrences) {
    const group=new THREE.Group(),surface=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),wire=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial()),selectionLayer=new THREE.Group();
    group.userData={occurrence,surface,wire,selectionLayer};group.add(surface,wire,selectionLayer);parts.add(group);
  }
  const props={geometry:{p:{geometry_key:'old'},q:{geometry_key:'context'}},occurrences,selected:{occurrence:'target',definition:'p'},operationDraft:{target:{definition:'p'},profile:'fillet',result:'auto'},section:false};
  return {parts,props};
}
function candidate() {
  const root=new THREE.Group(),assets=new Map([['p',{geometry:new THREE.BoxGeometry(),edges:new THREE.BufferGeometry()}]]);
  for(const id of ['target','linked']) {
    const group=new THREE.Group();group.userData.occurrence={id,definition:'p',color:'#aaccee'};group.add(new THREE.Mesh(assets.get('p').geometry,new THREE.MeshStandardMaterial()));root.add(group);
  }
  return {token:'preview',context:'part:p',root,assets,components:{p:{geometry_key:'new'}},section:false};
}
test('operation focus follows the edited definition, including linked instances, rather than the last picked reference',()=>{
  const {parts,props}=fixture();props.selected={occurrence:'context',definition:'q'};syncOperationAppearance(parts,null,props);
  for(const group of parts.children){const {surface,occurrence}=group.userData;const inactive=occurrence.definition==='q';assert.equal(surface.material.opacity,inactive?.2:1);assert.equal(surface.material.transparent,inactive);assert.equal(surface.material.depthWrite,!inactive);assert(surface.material.color.equals(new THREE.Color(occurrence.color)));}
});
test('preview masks source drawing without removing reference-picking meshes or fading the candidate',()=>{
  const {parts,props}=fixture(),display=candidate(),source=parts.children[0].userData.surface;
  syncOperationAppearance(parts,display,props);
  assert.equal(parts.children[0].userData.surface,source);assert.equal(source.visible,true);assert.equal(source.material.colorWrite,false);assert.equal(source.material.depthWrite,false);assert.equal(parts.children[0].userData.wire.visible,false);
  for(const g of display.root.children){const m=g.children[0].material;assert.equal(m.opacity,1);assert.equal(m.transparent,false);assert.equal(m.depthWrite,true);}
  props.selected={occurrence:'linked',definition:'p'};syncOperationAppearance(parts,display,props);assert.equal(source.material.colorWrite,false);
});
test('cancel and unrelated preview contexts restore normal source drawing; committed source takes over',()=>{
  const {parts,props}=fixture(),display=candidate();syncOperationAppearance(parts,display,props);
  props.operationDraft=undefined;syncOperationAppearance(parts,display,props);assert.equal(parts.children[0].userData.surface.material.colorWrite,true);assert(parts.children[2].userData.surface.material.color.equals(new THREE.Color('#ccaa88')));
  props.operationDraft={target:{definition:'p'},profile:'fillet',result:'auto'};props.geometry.p.geometry_key='new';syncOperationAppearance(parts,display,props);assert.equal(display.root.children[0].visible,false);assert.equal(parts.children[0].userData.surface.material.depthWrite,true);
});
test('section clipping and exploded placement remain consistent on retained previews',()=>{
  const {parts,props}=fixture(),display=candidate();parts.children[0].matrix.makeTranslation(20,0,0);props.section=true;syncOperationAppearance(parts,display,props);
  assert.equal(display.root.children[0].matrix.elements[12],20);assert.equal(display.root.children[0].children[0].material.clippingPlanes.length,1);
  props.section=false;syncOperationAppearance(parts,display,props);assert.equal(display.root.children[0].children[0].material.clippingPlanes.length,0);
});
test('disposing linked preview instances releases shared assets exactly once',()=>{
  const display=candidate();let geometry=0,edges=0,materials=0;display.assets.get('p').geometry.addEventListener('dispose',()=>geometry++);display.assets.get('p').edges.addEventListener('dispose',()=>edges++);
  display.root.traverse(o=>o.material?.addEventListener('dispose',()=>materials++));disposePreview(display);assert.equal(geometry,1);assert.equal(edges,1);assert.equal(materials,2);assert.equal(display.root.children.length,0);
  assert.equal(operationDisplayContext({profile:'circle',result:'new'}),'new');assert.equal(operationDisplayContext({profile:'fillet',result:'new',target:{definition:'p'}}),'part:p');
});

test('component selection keeps the orange component palette and cannot make the active definition transparent',()=>{
 const {parts,props}=fixture();props.selected={occurrence:'context',definition:'q'};syncOperationAppearance(parts,null,props);
 assert.notEqual(COMPONENT_SELECTION_COLOR,SELECTION_COLOR);
 assert(parts.children[2].userData.wire.material.color.equals(new THREE.Color(COMPONENT_SELECTION_COLOR)));
 assert.equal(parts.children[0].userData.surface.material.opacity,1);assert.equal(parts.children[2].userData.surface.material.opacity,.2);
 props.operationDraft.result='new';syncOperationAppearance(parts,null,props);assert.equal(parts.children[0].userData.surface.material.opacity,1);
 props.operationDraft=undefined;syncOperationAppearance(parts,null,props);for(const g of parts.children){assert.equal(g.userData.surface.material.transparent,false);assert.equal(g.userData.surface.material.depthWrite,true);}
});

test('a selected group highlights all descendants orange and edit scope mutes only outside components',()=>{
 const {parts,props}=fixture();props.occurrences[0].id='g/target';props.occurrences[1].id='g/linked';
 props.selected={occurrence:'g',definition:'assembly'};props.operationDraft=undefined;props.editingGroup='g';
 syncOperationAppearance(parts,null,props);
 for(const child of parts.children.slice(0,2)){assert(child.userData.wire.material.color.equals(new THREE.Color(COMPONENT_SELECTION_COLOR)));assert.equal(child.userData.surface.material.opacity,1);}
 assert.equal(parts.children[2].userData.surface.material.opacity,.2);
});

test('move previews reposition retained source/picking meshes and cancel restores committed placement',()=>{
 const {parts,props}=fixture();props.operationDraft=undefined;props.placementTarget={occurrence:'target',definition:'p'};
 const identity=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
 props.occurrences=props.occurrences.map(o=>({...o,matrix:identity}));
 const display={token:'move',context:'move:target',root:new THREE.Group(),assets:new Map(),components:props.geometry,section:false,occurrences:props.occurrences.map(o=>({...o,matrix:o.id==='target'?[[1,0,0,24],[0,1,0,7],[0,0,1,3],[0,0,0,1]]:identity}))};
 const surface=parts.children[0].userData.surface;syncOperationAppearance(parts,display,props);
 assert.equal(parts.children[0].matrix.elements[12],24);assert.equal(parts.children[0].matrix.elements[13],7);assert.equal(parts.children[0].userData.surface,surface);assert.equal(surface.material.colorWrite,true);assert.equal(surface.material.opacity,1);assert.equal(parts.children[1].matrix.elements[12],0);assert.equal(parts.children[1].userData.surface.material.opacity,.2);
 props.placementTarget=null;syncOperationAppearance(parts,null,props);assert.equal(parts.children[0].matrix.elements[12],0);assert(parts.children.every(g=>g.userData.surface.material.opacity===1));
});
test('move preview matrices include parent-transformed descendants and restore the newly committed placement',()=>{
 const {parts,props}=fixture();props.operationDraft=undefined;props.placementTarget={occurrence:'assembly',definition:'a'};
 const translated=[[1,0,0,35],[0,1,0,0],[0,0,1,0],[0,0,0,1]],base=[[1,0,0,5],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
 props.occurrences=props.occurrences.map((o,i)=>({...o,id:i===0?'assembly/target':o.id,matrix:base}));parts.children.forEach((g,i)=>g.userData.occurrence=props.occurrences[i]);
 const display={token:'move',context:'move:assembly',root:new THREE.Group(),assets:new Map(),components:props.geometry,section:false,occurrences:props.occurrences.map((o,i)=>({...o,matrix:i===0?translated:base}))};
 syncOperationAppearance(parts,display,props);assert.equal(parts.children[0].matrix.elements[12],35);assert.equal(parts.children[0].userData.surface.material.opacity,1);
 props.occurrences=display.occurrences;props.placementTarget=null;syncOperationAppearance(parts,null,props);assert.equal(parts.children[0].matrix.elements[12],35);
});

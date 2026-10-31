import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {copyLayoutParts,pasteLayoutParts} from '../frontend/src/layoutClipboard.ts';
const identity=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const rowMatrix=m=>Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>m.elements[j*4+i]));
const matrix=rows=>new THREE.Matrix4().set(...rows.flat());
const pose=values=>new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...['rx','ry','rz'].map(k=>THREE.MathUtils.degToRad(values[k]||0)),'XYZ')).setPosition(values.x||0,values.y||0,values.z||0);
const scene=()=>({document:{id:'d',active_layout:'l',components:{p:{structure_role:'part'},q:{structure_role:'part'},l:{structure_role:'layout'},g:{structure_role:'group'}},variations:{v:{part:'p'}}},occurrences:[{id:'layout',definition:'l',parent:'root',structure_role:'layout',matrix:identity},{id:'layout/p',definition:'p',structure_role:'part',layout:'l',variation:'v',matrix:rowMatrix(pose({x:10,y:20,z:30,rx:15,ry:20,rz:35}))},{id:'layout/q',definition:'q',structure_role:'part',layout:'l',matrix:rowMatrix(pose({x:30,y:30}))},{id:'library',definition:'p',structure_role:'part',library:true,matrix:identity},{id:'layout/group',definition:'g',structure_role:'group',layout:'l',matrix:rowMatrix(pose({x:50,y:-12,rz:70}))}]});
const equal=(a,b)=>a.elements.forEach((n,i)=>assert(Math.abs(n-b.elements[i])<1e-8));
test('copies placement snapshots and variations, then pastes linked definitions into a rotated group',()=>{
 const s=scene(),clip=copyLayoutParts(s,{occurrence:'layout/p',definition:'p'}),original=matrix(clip.parts[0].matrix);s.occurrences[1].matrix[0][3]=900;
 const commands=pasteLayoutParts(s,clip,'layout/group'),args=commands[0].args;assert.equal(args.part,'p');assert.equal(args.variation,'v');assert.equal(args.parent,'g');
 const expected=original.clone();expected.elements[12]+=30;equal(matrix(s.occurrences[4].matrix).multiply(pose(args.placement)),expected);
 s.occurrences.splice(1,1);assert.equal(pasteLayoutParts(s,clip,'layout').length,1);
});
test('multi-part paste preserves relative placement and uses active layout after layout switch',()=>{
 const s=scene(),clip=copyLayoutParts(s,{occurrence:'layout/p',definition:'p',items:[{occurrence:'layout/p',definition:'p'},{occurrence:'layout/q',definition:'q'}]});
 s.document.active_layout='other';s.document.components.other={structure_role:'layout'};s.occurrences.push({id:'other-layout',definition:'other',parent:'root',structure_role:'layout',matrix:identity});
 const commands=pasteLayoutParts(s,clip,'',60);assert.equal(commands.length,2);for(const [i,command]of commands.entries()){assert.equal(command.args.parent,'other');const expected=matrix(clip.parts[i].matrix);expected.elements[12]+=60;equal(pose(command.args.placement),expected);}
});
test('ignores authoring copies and rejects missing definitions and cross-design paste',()=>{
 const s=scene();assert.equal(copyLayoutParts(s,{occurrence:'library',definition:'p'}),null);const clip=copyLayoutParts(s,{occurrence:'layout/p',definition:'p'});assert.throws(()=>pasteLayoutParts({...s,document:{...s.document,id:'different'}},clip,''),/design/);delete s.document.components.p;assert.throws(()=>pasteLayoutParts(s,clip,''),/no longer exists/);
});

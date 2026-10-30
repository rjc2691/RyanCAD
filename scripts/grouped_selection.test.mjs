import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSelection,selectionMembers,orderedPath,groupedSelectionProblem,referenceMembers,displaySelectionMembers} from '../frontend/src/operations/groupedSelection.ts';
import {initialOperation,inferOperationSelection,operationCommand,operationFrame,applyPreset,reference} from '../frontend/src/operations/operationModel.ts';
const identity=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const state=()=>({document:{components:{p:{id:'p',name:'Active',kind:'solid',feature_ids:[]},q:{id:'q',name:'Reference',kind:'solid',feature_ids:[]}},features:{},parameters:{}},geometry:{},occurrences:[{id:'i',definition:'p',matrix:identity},{id:'j',definition:'q',matrix:identity}],parameter_graph:{},profiles:{}});
const edge=(signature,start,end)=>({signature,type:'LINE',start,end,midpoint:start.map((v,i)=>(v+end[i])/2),tangent:end.map((v,i)=>v-start[i]),samples:[start,end]});
const e1=edge('a',[0,0,0],[10,0,0]),e2=edge('b',[10,10,0],[10,0,0]),e3=edge('c',[10,10,0],[20,10,0]);
const picked=e=>({definition:'p',occurrence:'i',edge:e});
const face=(signature,z=0,normal=[0,0,1])=>({definition:'p',occurrence:'i',face:{signature,id:signature,type:'PLANE',center:[0,0,z],normal}});

test('Ctrl-click only removes the exact selected object and preserves other selections',()=>{
 let s=mergeSelection(picked(e1),picked(e2),true);
 assert.equal(mergeSelection(s,picked(e3),false,true),s);
 assert.equal(mergeSelection(s,null,false,true),s);
 s=mergeSelection(s,picked(e1),false,true);assert.deepEqual(selectionMembers(s).map(v=>v.edge.signature),['b']);
 assert.equal(mergeSelection(s,picked(e2),false,true),null);
 assert.equal(mergeSelection(null,picked(e1),false,true),null);
 assert.equal(mergeSelection(s,{...picked(e2),occurrence:'other'},false,true),s);
 for(const item of [face('a'),{definition:'p',occurrence:'i'},{definition:'p',occurrence:'i',vertex:{edge:e1,anchor:'start'}}])assert.equal(mergeSelection(item,item,false,true),null);
});

test('Shift toggles real faces/edges in the same component, retaining the first anchor',()=>{
 let s=mergeSelection(null,picked(e1));s=mergeSelection(s,picked(e2),true);assert.equal(s.edge.signature,'a');assert.equal(selectionMembers(s).length,2);
 s=mergeSelection(s,picked(e1),true);assert.equal(s.edge.signature,'b');s=mergeSelection(s,picked(e2),true);assert.equal(s,null);
 s=mergeSelection(face('a'),face('b'),true);assert.equal(selectionMembers(s).length,2);assert.equal(selectionMembers(mergeSelection(s,picked(e1),true)).length,1);
});
test('connected paths are ordered and reversed independently of click order',()=>{
 const s=state(),refs=[e2,e1,e3].map(e=>reference(picked(e),s));const chain=orderedPath(refs,s);
 assert.equal(chain.length,3);for(let i=1;i<chain.length;i++)assert(chain[i-1].points.at(-1).distanceTo(chain[i].points[0])<1e-6);
 assert.equal(chain[0].points[0].x,20);assert.equal(chain.at(-1).points.at(-1).x,0);
});
test('connectivity uses placed instance coordinates',()=>{
 const s=state();s.occurrences[1].matrix=[[1,0,0,10],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
 const refs=[reference(picked(e1),s),reference({definition:'q',occurrence:'j',edge:edge('local',[0,0,0],[0,10,0])},s)];assert.equal(orderedPath(refs,s).length,2);
});
test('branches, gaps and separate loops cannot be joined implicitly',()=>{
 const s=state();for(const extra of [edge('gap',[30,0,0],[40,0,0]),edge('branch',[10,0,0],[10,0,10])]){
  const refs=[e1,e2,extra].map(e=>reference(picked(e),s));assert.throws(()=>orderedPath(refs,s),/branch|gap|connected/);
 }
});
test('an existing multi-edge selection launches a grouped finisher and serializes every reference',()=>{
 const s=state(),selection=mergeSelection(picked(e1),picked(e2),true),d=initialOperation(selection,s);assert.equal(referenceMembers(d,'path').length,2);assert.equal(d.target.definition,'p');assert.equal(operationCommand(d).path_references.length,2);
});
test('Shift extends and removes sweep paths; plain click replaces the path',()=>{
 const s=state();let d=applyPreset(initialOperation(picked(e1),s),'sweep');d=inferOperationSelection(d,picked(e2),s,true).draft;
 assert.equal(groupedSelectionProblem(d,s),null);assert.equal(operationCommand(d).path_references.length,2);assert.equal(operationFrame(d,s).travelPath.length,3);
 d=inferOperationSelection(d,picked(e1),s,true).draft;assert.equal(referenceMembers(d,'path').length,1);assert.equal(operationCommand(d).path_references,undefined);
 d=inferOperationSelection(d,picked(e3),s).draft;assert.equal(referenceMembers(d,'path')[0].selection.edge.signature,'c');
});
test('parallel profiles retain the first origin and a single signed motion',()=>{
 const s=state(),first=face('first'),second=face('second',5,[0,0,-1]);let d=initialOperation(first,s);d.values.distance='-3';d=inferOperationSelection(d,second,s,true).draft;
 assert.equal(d.reference.selection.face.signature,'first');assert.equal(groupedSelectionProblem(d,s),null);assert.equal(operationCommand(d).profile_references.length,2);assert.equal(d.values.distance,'-3');assert.equal(d.target.definition,'p');
 d=inferOperationSelection(d,first,s,true).draft;assert.equal(d.reference.selection.face.signature,'second');assert.equal(referenceMembers(d,'profile').length,1);
});
test('nonparallel selections stay visible but invalidate Apply until removed',()=>{
 const s=state();let d=initialOperation(face('first'),s);const side=face('side',0,[1,0,0]);d=inferOperationSelection(d,side,s,true).draft;assert.match(groupedSelectionProblem(d,s),/parallel/);d=inferOperationSelection(d,side,s,true).draft;assert.equal(groupedSelectionProblem(d,s),null);
});
test('grouped sketch references preserve stable feature and occurrence IDs',()=>{
 const s=state();s.document.components.q.kind='planar';s.document.components.q.feature_ids=['sk'];s.document.features.sk={owner:'q',type:'circle'};s.profiles.sk={status:'closed',normal:[0,0,1],center:[8,0,0]};
 const d=inferOperationSelection(initialOperation(face('first'),s),{definition:'q',occurrence:'j'},s,true).draft;
 assert.equal(groupedSelectionProblem(d,s),null);assert.equal(operationCommand(d).profile_references[1].sketch,'sk');assert.equal(operationCommand(d).profile_references[1].occurrence,'j');assert.equal(d.target.definition,'p');
});
test('canonical role membership controls highlighting after a member is removed',()=>{
 const s=state(),a=face('a'),b=face('b'),selection=mergeSelection(a,b,true);let d=inferOperationSelection(initialOperation(a,s),b,s,true).draft;d=inferOperationSelection(d,a,s,true).draft;
 assert.deepEqual(displaySelectionMembers(selection,d).map(s=>s.face.signature),['b']);
});

test('choosing a path after a face profile preserves the face origin for parallel travel',()=>{
 const s=state();let d=initialOperation(face('anchor',5),s);const first=d.reference;d=inferOperationSelection(d,picked(e1),s).draft;assert.equal(d.reference,first);
 d=inferOperationSelection(d,picked(e2),s,true).draft;assert.equal(d.reference,first);assert.equal(operationFrame(d,s).pathStyle,'parallel');
});

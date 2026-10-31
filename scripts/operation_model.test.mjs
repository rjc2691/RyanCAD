import test from 'node:test';
import assert from 'node:assert/strict';
import {withToolEffect,withOperationTarget,initialOperation,operationPathPickProblem,withSketchProfile,applyPreset,operationCommand,operationProblem,operationFrame,inferOperationSelection,inferFacePath,reference} from '../frontend/src/operations/operationModel.ts';
const identity=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const edge={signature:'LINE:corner',type:'LINE',start:[0,0,0],end:[0,0,10],midpoint:[0,0,5],tangent:[0,0,1],center:[0,0,5]};
const face={id:'face_0',signature:'PLANE:top',type:'PLANE',normal:[0,0,1],center:[0,0,10]};
const state=()=>({document:{components:{p:{id:'p',name:'Part',kind:'solid',feature_ids:[]}},features:{},parameters:{}},geometry:{p:{center:[0,0,5]}},occurrences:[{id:'i',definition:'p',matrix:identity}],parameter_graph:{}});
test('edge launch preselects the path and finishing section',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',edge},state());
 assert.equal(d.profile,'fillet');assert.equal(d.motion,'sweep');assert.equal(d.result,'cut');assert.equal(operationCommand(d).result,'cut');assert.equal(d.pathReference.selection.edge.signature,edge.signature);assert.equal(operationProblem(d),null);
});
test('face launch and hole preset preserve the target and support plane',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',face},state()),hole=applyPreset(d,'holes');
 assert.equal(d.profile,'face');assert.equal(hole.profile,'circle');assert.equal(hole.result,'cut');assert.equal(hole.target.definition,'p');assert.equal(hole.profileReference.selection.face.signature,face.signature);
});
test('component and blank entry points have distinct, honest defaults',()=>{
 const d=initialOperation({definition:'p',occurrence:'i'},state());
 assert.equal(d.profile,'face');assert(operationProblem(d));
 const blank=initialOperation(null,state());assert.equal(blank.result,'new');assert.equal(blank.profile,'face');assert.equal(blank.target,null);assert.equal(blank.profileReference,null);assert.equal(blank.values.distance,'');assert(operationProblem(blank));
});
test('vertex references serialize through a guarded endpoint, not a mesh index',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',vertex:{point:edge.end,edge,anchor:'end'}},state());
 const args=operationCommand(d);assert.equal(args.reference.edge,edge.signature);assert.equal(args.reference.anchor,'end');assert(!('point' in args.reference));
});
test('switching to a placed body prunes unrelated travel references at commit',()=>{
 const d=applyPreset(initialOperation({definition:'p',occurrence:'i',edge},state()),'boolean');
 const args=operationCommand(d);assert.equal(args.path_reference,undefined);assert.equal(args.reference,undefined);assert.equal(args.motion,'none');
 const revolve=operationCommand(applyPreset(initialOperation({definition:'p',occurrence:'i',edge},state()),'revolve'));
 assert.equal(revolve.path_reference,undefined);assert.equal(revolve.direction,'Z');
 d.sketch='discarded-profile';d.sketchOccurrence='discarded-instance';
 assert.equal(operationCommand(d).sketch,undefined);assert.equal(operationCommand(d).sketch_occurrence,undefined);
});
test('reference offsets use the displayed profile frame',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',face},state());d.values.offset_u='10';d.values.offset_v='4';d.values.offset_n='2';
 const f=operationFrame(d,state());assert.deepEqual(f.origin.toArray(),[10,4,12]);
});
test('stock preview selection resolves to the nominal profile',()=>{
 const s=state();s.document.components.p.kind='planar';s.document.components.p.feature_ids=['sk'];s.document.features.sk={id:'sk',type:'rectangle'};s.geometry.p.thickness_preview=true;
 const d=initialOperation({definition:'p',occurrence:'i',face},s);assert.equal(d.profile,'sketch');assert.equal(d.profileReference,null);assert.equal(operationCommand(d).reference.face,undefined);
});

test('signed face travel and Boolean result stay independent',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',face},state());d.values.distance='-2';d.result='cut';
 const args=operationCommand(d),f=operationFrame(d,state());
 assert.equal(args.values.distance,'-2');assert.equal(args.reverse,false);
 assert.equal(f.pathStyle,'implicit');assert.match(f.pathLabel,/Face normal/);
 assert.deepEqual(f.travelPath[1].toArray(),[0,0,8]);
 d.extent='through';const through=operationFrame(d,state());assert(through.travelPath[0].z<10&&through.travelPath[1].z>10);
});
test('direct and translated sweep paths retain the real reference curve',()=>{
 const curve={...edge,type:'CIRCLE',samples:[[0,0,0],[2,0,4],[0,0,10]]};
 const d=applyPreset(initialOperation({definition:'p',occurrence:'i',edge:curve},state()),'sweep');
 let f=operationFrame(d,state());assert.equal(f.pathStyle,'direct');assert.equal(f.path.length,3);assert.deepEqual(f.travelPath[1].toArray(),[2,0,4]);
 d.values.offset_u='5';f=operationFrame(d,state());assert.equal(f.pathStyle,'parallel');assert.deepEqual(f.path[1].toArray(),[2,0,4]);assert.deepEqual(f.travelPath[1].toArray(),[7,0,4]);assert.equal(f.pathOffset.length,2);
 d.reverse=true;f=operationFrame(d,state());assert.deepEqual(f.travelPath[0].toArray(),f.origin.toArray());assert.equal(f.travelPath.at(-1).z,-10);
});

test('editing a face starts in Auto while primitive and hole intent remain explicit',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',face},state());assert.equal(d.result,'auto');
 assert.equal(applyPreset(d,'holes').result,'cut');assert.equal(applyPreset(d,'box').result,'new');
 assert.equal(applyPreset(d,'boolean').result,'auto');
});
test('implicit face replacement rebases origin without changing the target or numeric intent',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',face},state());d.values.distance='-2';
 const next={...face,signature:'PLANE:side',normal:[0,1,0],center:[0,6,5]};
 const result=inferOperationSelection(d,{definition:'q',occurrence:'j',face:next},state()).draft;
 assert.equal(result.profileReference.selection.face.signature,next.signature);assert.equal(result.reference.selection.face.signature,next.signature);
 assert.equal(result.target.definition,'p');assert.equal(result.values.distance,'-2');assert.equal(result.result,'auto');
});
test('a custom section follows a new support face and keeps an explicitly chosen result',()=>{
 const d=applyPreset(initialOperation({definition:'p',occurrence:'i',face},state()),'holes');d.values.offset_u='8';
 const next=inferOperationSelection(d,{definition:'p',occurrence:'i',face:{...face,signature:'next'}},state()).draft;
 assert.equal(next.profile,'circle');assert.equal(next.result,'cut');assert.equal(next.values.offset_u,'8');assert.equal(next.profileReference.selection.face.signature,'next');
});
test('edge replacement follows an implicit path origin but retains a pinned origin',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',edge},state());const nextEdge={...edge,signature:'new',start:[10,0,0]};
 let next=inferOperationSelection(d,{definition:'p',occurrence:'i',edge:nextEdge},state()).draft;
 assert.equal(next.pathReference.selection.edge.signature,'new');assert.equal(next.reference.selection.edge.signature,'new');
 d.profile='circle';d.originPinned=true;next=inferOperationSelection(d,{definition:'p',occurrence:'i',edge:nextEdge},state()).draft;
 assert.equal(next.reference.selection.edge.signature,edge.signature);assert.equal(next.pathReference.selection.edge.signature,'new');
});
test('a vertex selects a persistent exact origin without replacing the profile',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',face},state());
 const next=inferOperationSelection(d,{definition:'p',occurrence:'i',vertex:{point:edge.end,edge,anchor:'end'}},state()).draft;
 assert(next.originPinned);assert.equal(next.profile,'face');assert.equal(next.reference.anchor,'end');
 const replacement=inferOperationSelection(next,{definition:'p',occurrence:'i',face:{...face,signature:'next'}},state()).draft;
 assert.equal(replacement.reference.anchor,'end');assert.equal(replacement.profileReference.selection.face.signature,'next');
});
test('unsupported implicit replacements block the old candidate instead of silently applying it',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',face},state());
 const curved=inferOperationSelection(d,{definition:'p',occurrence:'i',face:{...face,type:'CYLINDER'}},state()).draft;
 assert(operationProblem(curved));
 const body=applyPreset(d,'boolean');const following=inferOperationSelection(body,{definition:'p',occurrence:'i',edge},state()).draft;
 assert.equal(following.pathReference.selection.edge.signature,edge.signature);assert(operationProblem(following));
});

test('reference picks never bind a new component as the operation target, including a blank launch',()=>{
 const d=initialOperation(null,state());
 for(const selection of [{definition:'p',occurrence:'i',face},{definition:'p',occurrence:'i',edge},{definition:'p',occurrence:'i'},{definition:'p',occurrence:'i',vertex:{point:edge.end,edge,anchor:'end'}}]) {
  const next=inferOperationSelection(d,selection,state()).draft;assert.equal(next.target,null);
 }
});
test('all presets and cross-component reference types retain the original target',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',face},state());
 for(const preset of ['box','cylinder','holes','fillet','chamfer','sweep','revolve','helix','boolean','mirror','pattern']) {
  const configured=applyPreset(d,preset);assert.equal(configured.target,d.target);
  for(const selection of [{definition:'q',occurrence:'j',face},{definition:'q',occurrence:'j',edge},{definition:'q',occurrence:'j'},{definition:'q',occurrence:'j',vertex:{point:edge.end,edge,anchor:'end'}}]) assert.equal(inferOperationSelection(configured,selection,state()).draft.target,d.target);
 }
});

test('native face loops retain holes and placement in the displayed Tool Profile',()=>{
 const s=state(),outer=[[-2,-2,10],[2,-2,10],[2,2,10],[-2,2,10]],hole=[[-1,-1,10],[1,-1,10],[1,1,10],[-1,1,10]];
 const d=initialOperation({definition:'p',occurrence:'i',face:{...face,outlines:[outer,hole]}},s);
 d.values.offset_u='3';d.values.offset_n='2';
 const f=operationFrame(d,s);assert.equal(f.profileRegions.length,1);assert.equal(f.profileRegions[0].length,2);
 assert.deepEqual(f.profileLoops[0][0].toArray(),[1,-2,12]);assert.deepEqual(f.profileLoops[1][0].toArray(),[2,-1,12]);
});
test('body display follows placed and explicitly anchored occurrence transforms',()=>{
 const s=state();s.geometry.q={center:[0,0,5],bounds:{min:[-2,-3,0],max:[2,3,10],size:[4,6,10]}};s.occurrences.push({id:'j',definition:'q',matrix:[[1,0,0,20],[0,1,0,0],[0,0,1,0],[0,0,0,1]]});
 const d=applyPreset(initialOperation({definition:'p',occurrence:'i',face},s),'boolean');d.profileReference={selection:{definition:'q',occurrence:'j'},anchor:'center',label:'Cutter'};
 let f=operationFrame(d,s);assert.deepEqual(f.origin.toArray(),[20,0,5]);assert.equal(f.bodyMatrix.elements[12],20);assert.equal(f.profileLoops.length,12);assert.equal(f.profileRegions.length,0);
 d.keepBodyPlacement=false;d.origin='coordinates';d.values.origin_x='8';d.values.origin_y='4';d.values.origin_z='3';f=operationFrame(d,s);assert.equal(f.bodyMatrix.elements[12],8);assert.equal(f.bodyMatrix.elements[13],4);assert.equal(f.bodyMatrix.elements[14],-2);
});
test('finish display waits for native removed-region outlines and preserves the path origin',()=>{
 const d=initialOperation({definition:'p',occurrence:'i',edge},state());
 assert.deepEqual(operationFrame(d,state()).profileLoops,[]);
 const loops=[[[0,0,5],[2,0,5],[0,2,5]]],f=operationFrame(d,state(),{}, {finish_section:{loops,effect:'removed'}});
 assert.deepEqual(f.origin.toArray(),edge.start);assert.deepEqual(f.profileLoops[0].map(p=>p.toArray()),loops[0]);assert.equal(f.sectionEffect,'removed');
});

test('independent finish edges retain separate path overlays without invented chords',()=>{
 const s=state(),d=initialOperation({definition:'p',occurrence:'i',edge},s);
 d.pathReferences=[d.pathReference,{selection:{definition:'p',occurrence:'i',edge:{...edge,signature:'separate',start:[8,0,0],end:[8,0,10]}},anchor:'start',label:'Second edge'}];
 const f=operationFrame(d,s);assert.equal(f.referencePaths.length,2);assert.deepEqual(f.referencePaths[1][0].toArray(),[8,0,0]);
});
test('mirror profile body remains placed while its plane origin can move independently',()=>{
 const s=state();s.geometry.p.bounds={min:[-2,-3,0],max:[2,3,10],size:[4,6,10]};
 const d=applyPreset(initialOperation({definition:'p',occurrence:'i'},s),'mirror');d.origin='coordinates';d.values.origin_x='12';
 const f=operationFrame(d,s);assert.equal(f.origin.x,12);assert.equal(f.bodyMatrix.elements[12],0);assert.equal(f.bodyMatrix.elements[14],0);
});

test('world origin and travel targets serialize as guarded semantic points',()=>{
 const s=state(),d=initialOperation(null,s);d.origin='reference';d.reference=reference({worldOrigin:true,definition:'root',occurrence:''},s);d.travelTarget=d.reference;d.values.distance='';
 const command=operationCommand(d);assert.equal(command.reference.world,'origin');assert.equal(command.travel_target.world,'origin');assert.equal(command.path_extent,'target');assert.equal(command.values.distance,undefined);
 d.motion='none';assert.equal(operationCommand(d).travel_target,undefined);
});
test('blank path fields request full finite travel but reject an implicit infinite direction',()=>{
 const s=state(),d=initialOperation(null,s,'box');d.values.distance='';d.values.path_percent='';assert.match(operationProblem(d),/finite/);
 d.pathReference=reference({definition:'p',occurrence:'i',edge},s,'start');d.direction='edge';assert.equal(operationCommand(d).path_extent,'full');assert.equal(operationProblem(d),null);assert.equal(operationFrame(d,s).distance,10);
});
test('face path pick expands exact boundary edges without replacing the profile',()=>{
 const s=state(),edges=[{...edge,signature:'a',start:[0,0,0],end:[10,0,0]},{...edge,signature:'b',start:[10,0,0],end:[10,10,0]},{...edge,signature:'c',start:[10,10,0],end:[0,10,0]},{...edge,signature:'d',start:[0,10,0],end:[0,0,0]}];s.geometry.p.edges=edges;
 const f={...face,edge_signatures:edges.map(e=>e.signature)},d=initialOperation({definition:'p',occurrence:'i',edge:edges[0]},s),next=inferFacePath(d,{definition:'p',occurrence:'i',face:f},s).draft;
 assert.equal(next.profile,'fillet');assert.equal(next.pathReferences.length,4);assert.deepEqual(next.pathReferences.map(r=>r.selection.edge.signature),['a','b','c','d']);
});


test('ad hoc sketches retain drawn world placement without applying old origin offsets twice',()=>{
 const s=state();s.document.features.sk={id:'sk',type:'sketch',owner:'root',name:'Drawn'};
 s.profiles={sk:{status:'closed',center:[15,4,10],normal:[0,0,1],outlines:[[[13,2,10],[17,2,10],[17,6,10],[13,6,10],[13,2,10]]]}};
 const d=initialOperation({definition:'p',occurrence:'i',face},s);d.originPinned=true;d.values.offset_u='10';d.values.offset_v='3';
 const next=withSketchProfile(d,s,'sk',true),f=operationFrame(next,s);
 assert.equal(next.target.definition,'p');assert.equal(next.values.offset_u,'0');assert.equal(next.values.offset_v,'0');assert.deepEqual(f.origin.toArray(),[15,4,10]);
 assert.equal(next.profile,'sketch');assert.equal(operationCommand(next).sketch,'sk');
 const explicit=withSketchProfile(d,s,'sk');assert.equal(explicit.reference,d.reference);assert.equal(explicit.values.offset_u,'10');
});


test('path picking rejects other components and other linked instances without replacing the draft',()=>{
 const s=state(),d=initialOperation({definition:'p',occurrence:'i',edge},s);
 for(const selection of [{definition:'q',occurrence:'j',edge},{definition:'p',occurrence:'other-copy',edge}]) {
  for(const add of [false,true]){const result=inferOperationSelection(d,selection,s,add);assert.equal(result.draft,d);assert.match(result.message,/same component instance/);}
  assert.match(operationPathPickProblem(d,'path',selection),/same component instance/);
  assert.match(operationPathPickProblem(d,'path',{...selection,edge:undefined,vertex:{point:[0,0,0],edge,anchor:'start'}}),/same component instance/);
  assert.throws(()=>inferFacePath(d,{...selection,edge:undefined,face},s,true),/same component instance/);
  assert.equal(operationPathPickProblem(d,'origin',selection),null);assert.equal(operationPathPickProblem(d,'travelTarget',selection),null);
 }
 const same=inferOperationSelection(d,{definition:'p',occurrence:'i',edge:{...edge,signature:'second'}},s,true).draft;assert.equal(same.pathReferences.length,2);
});

test('a sweep may start on an external body, but all later path edges stay on that occurrence',()=>{
 const s=state(),d=initialOperation({definition:'p',occurrence:'i',face},s);d.profile='circle';
 const a=inferOperationSelection(d,{definition:'q',occurrence:'j',edge},s).draft;assert.equal(a.pathReference.selection.definition,'q');assert.equal(a.target.definition,'p');
 assert.equal(inferOperationSelection(a,{definition:'p',occurrence:'i',edge},s,true).draft,a);
 const cleared={...a,pathReference:null,pathReferences:[]};assert.equal(operationPathPickProblem(cleared,'path',{definition:'p',occurrence:'i',edge}),null);
});


test('new tool origins always use implicit references; world-origin offsets provide exact placement',()=>{
 const s=state(),d=initialOperation(null,s);assert.equal(d.origin,'reference');assert.equal(d.reference.selection.worldOrigin,true);
 d.values.offset_u='4';d.values.offset_v='5';d.values.offset_n='6';assert.deepEqual(operationFrame(d,s).origin.toArray(),[4,5,6]);
 assert.deepEqual(operationCommand(d).reference,{component:'root',world:'origin',anchor:'center'});
 for(const preset of ['revolve','helix']){const next=applyPreset(d,preset);assert.equal(next.origin,'reference');assert.equal(next.reference.selection.worldOrigin,true);assert.deepEqual(operationFrame(next,s).origin.toArray(),[10,0,0]);}
});

test('an empty tool or part starts with a constructive profile anchored to world origin',()=>{
 const s=state();s.geometry.p={status:'draft'};s.document.components.p.purpose='tool';
 const d=initialOperation({definition:'p',occurrence:'i'},s);
 assert.equal(d.profile,'rectangle');assert.equal(d.target.definition,'p');
 assert.equal(d.reference.selection.worldOrigin,true);assert.equal(d.result,'auto');
 assert.equal(operationProblem(d),null);
});


test('a blank operation borrows faces and paths without adopting a target or becoming a fillet',()=>{
 const s=state(),blank=initialOperation(null,s);
 const path=inferOperationSelection(blank,{definition:'p',occurrence:'i',edge},s).draft;
 assert.equal(path.target,null);assert.equal(path.result,'new');assert.equal(path.profile,'face');
 const profile=inferOperationSelection(path,{definition:'p',occurrence:'i',face},s).draft;
 assert.equal(profile.target,null);assert.equal(profile.result,'new');assert.equal(profile.profile,'face');
});


test('a selected design sketch initializes a new untargeted operation at its own frame',()=>{
 const s=state();s.document.features.sk={id:'sk',type:'sketch',owner:'root',name:'Plate outline'};
 const d=withSketchProfile(initialOperation(null,s),s,'sk');
 assert.equal(d.target,null);assert.equal(d.result,'new');assert.equal(d.profile,'sketch');assert.equal(d.sketch,'sk');assert.equal(d.reference.sketch,'sk');assert.equal(d.values.distance,'');
 assert.equal(operationCommand({...d,values:{...d.values,distance:'5'}}).sketch,'sk');
});
test('replacing a corner-finishing profile with a sketch returns to ordinary extrusion',()=>{
 const s=state();s.document.features.sk={id:'sk',type:'sketch',owner:'root',name:'Plate outline'};
 const d=withSketchProfile(initialOperation({definition:'p',occurrence:'i',edge},s),s,'sk');
 assert.equal(d.target.definition,'p');assert.equal(d.motion,'linear');assert.equal(d.direction,'normal');assert.equal(d.pathReference,null);
});

test('world origin starts a new operation with a pinned point, never a root body target',()=>{
 const origin={worldOrigin:true,occurrence:'',definition:'root'};
 const d=initialOperation(origin,state());assert.equal(d.target,null);assert.equal(d.result,'new');assert(d.originPinned);assert(d.reference.selection.worldOrigin);assert.equal(operationCommand(d).target,undefined);
});


test('explicit modify effect adopts a picked face body while blank creation and locked targets stay unchanged',()=>{
 const s=state(),selection={definition:'p',occurrence:'i',face};
 const d=inferOperationSelection(initialOperation(null,s),selection,s).draft;assert.equal(d.target,null);assert.equal(d.result,'new');
 for(const result of ['auto','add','cut','intersect']){const next=withToolEffect(d,result,s);assert.deepEqual(next.target,{definition:'p',occurrence:'i'});assert.equal(next.result,result);assert.equal(next.profileReference,d.profileReference);}
 assert.equal(withToolEffect(d,'new',s).target,null);
 const locked=initialOperation(selection,s),other={definition:'other',occurrence:'elsewhere',face};s.document.components.other={id:'other',kind:'solid',feature_ids:[]};s.occurrences.push({id:'elsewhere',definition:'other',matrix:identity});
 const replaced=inferOperationSelection(locked,other,s).draft;assert.equal(withToolEffect(replaced,'cut',s).target.definition,'p');assert.equal(withOperationTarget(locked,other,s),locked);
});

test('target picking fills an empty face profile and rejects read-only or ambiguous assembled bodies',()=>{
 const s=state(),blank=withToolEffect(initialOperation(null,s),'cut',s);assert.equal(blank.target,null);
 const next=withOperationTarget(blank,{definition:'p',occurrence:'i',face},s);assert.equal(next.target.definition,'p');assert.equal(next.profileReference.selection.face.signature,face.signature);assert.equal(next.result,'cut');
 s.document.components.p.read_only=true;assert.equal(withOperationTarget(blank,{definition:'p',occurrence:'i',face},s).target,null);
 s.document.components.part={id:'part',kind:'assembly'};s.occurrences.push({id:'assembly',definition:'part',kind:'assembly',matrix:identity});assert.equal(withOperationTarget(blank,{definition:'part',occurrence:'assembly'},s).target,null);
});

test('mixed face sources and placed solid tools require a deliberate target pick',()=>{
 const s=state();s.document.components.q={id:'q',kind:'solid',feature_ids:[]};s.occurrences.push({id:'j',definition:'q',matrix:identity});let d=inferOperationSelection(initialOperation(null,s),{definition:'p',occurrence:'i',face},s).draft;d=inferOperationSelection(d,{definition:'q',occurrence:'j',face},s,true).draft;assert.equal(withToolEffect(d,'add',s).target,null);
 const body={...d,profile:'body',profileReference:reference({definition:'p',occurrence:'i'},s)};assert.equal(withToolEffect(body,'cut',s).target,null);
});

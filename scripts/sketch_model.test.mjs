import test from 'node:test';
import assert from 'node:assert/strict';
import {startSketch,sketchClick,snapSketchPoint,entityPoints,sketchBasis,worldSketchFrame,projectSketchReference,sketchAnchors,chooseSketchTool,SKETCH_TOOL_KEYS} from '../frontend/src/sketchModel.ts';
const state={document:{features:{},parameters:{}},parameter_graph:{},geometry:{},occurrences:[]};
test('rectangle yields four exactly connected editable lines and retains the plane',()=>{
 let d={...startSketch(state),tool:'rectangle'};d=sketchClick(d,[2,3],0);d=sketchClick(d,[12,8],0);
 assert.equal(d.entities.length,4);assert.equal(d.pending.length,0);
 for(let i=0;i<4;i++){const a=d.entities[i],b=d.entities[(i+1)%4];assert.deepEqual([a.x2,a.y2],[b.x1,b.y1]);}
 assert.deepEqual(d.frame.normal,[0,0,1]);
});
test('connected line chains snap to endpoints and midpoints before the configurable grid',()=>{
 let d=startSketch(state);d=sketchClick(d,[0,0],0);d=sketchClick(d,[10,0],0);
 assert.deepEqual(d.pending,[[10,0]]);assert.deepEqual(snapSketchPoint(d,[5.1,.1],.3),[5,0]);
 assert.deepEqual(snapSketchPoint({...d,pending:[],snap:.25},[3.31,1.11],.01),[3.25,1]);
});

test('closing a snapped outline ends the chain; the next click starts another without an extra segment',()=>{
 let d={...startSketch(state),gridSnapEnabled:false};
 for(const p of [[0,0],[10,0],[10,10],[.05,.04]])d=sketchClick(d,p,.1);
 assert.equal(d.entities.length,3);assert.deepEqual([d.entities[2].x2,d.entities[2].y2],[0,0]);
 assert.deepEqual(d.pending,[]);assert.equal(d.cursor,null);assert.equal(d.tool,'line');
 d=sketchClick(d,[30,30],0);assert.equal(d.entities.length,3);assert.deepEqual(d.pending,[[30,30]]);
});

test('closing an existing open outline ends drawing but unrelated endpoints and flat retracing do not',()=>{
 const initial={...startSketch(state),snap:0,entities:[{id:'a',type:'line',x1:0,y1:0,x2:10,y2:0},{id:'b',type:'line',x1:10,y1:0,x2:10,y2:10}]};
 let d=sketchClick(initial,[10,10],0);d=sketchClick(d,[0,0],0);assert.deepEqual(d.pending,[]);
 d=sketchClick({...initial,pending:[[10,10]]},[20,0],0);assert.deepEqual(d.pending,[[20,0]]);
 d=sketchClick({...initial,pending:[[10,0]]},[0,0],0);assert.deepEqual(d.pending,[[0,0]]);
 d=sketchClick({...initial,pending:[[10,10]],construction:true},[0,0],0);assert.deepEqual(d.pending,[[0,0]],'construction cannot close ordinary geometry');
});
test('circle and center arc use exact radii and degree angles',()=>{
 let d={...startSketch(state),tool:'circle'};d=sketchClick(d,[2,3],0);d=sketchClick(d,[5,7],0);assert.equal(d.entities[0].radius,5);
 d={...d,tool:'arc'};d=sketchClick(d,[0,0],0);d=sketchClick(d,[10,0],0);d=sketchClick(d,[0,10],0);assert.equal(d.entities[1].end_angle,90);assert.equal(d.entities[1].radius,10);assert.equal(entityPoints(d.entities[1]).length,65);
});
test('world planes have consistent right-handed orthonormal frames',()=>{
 for(const p of ['XY','XZ','YZ']){const f=sketchBasis(worldSketchFrame(p));assert.equal(f.u.dot(f.normal),0);assert.equal(f.v.length(),1);assert.equal(f.u.clone().cross(f.v).dot(f.normal),1);}
});
test('projection uses occurrence placement and copies construction lines into the plane',()=>{
 const s={...state,occurrences:[{id:'i',matrix:[[1,0,0,10],[0,1,0,20],[0,0,1,3],[0,0,0,1]]}]};
 const d=projectSketchReference(startSketch(state),{definition:'p',occurrence:'i',edge:{start:[0,0,0],end:[5,0,0]}},s);
 assert.deepEqual([d.entities[0].x1,d.entities[0].y1,d.entities[0].x2,d.entities[0].y2],[10,20,15,20]);assert.equal(d.entities[0].construction,true);assert.equal(d.construction,false);
});


test('nearby off-grid lines and circles win over grid rounding',()=>{
 const d={...startSketch(state),snap:5,entities:[{id:'line',type:'line',x1:0,y1:2.3,x2:20,y2:2.3},{id:'circle',type:'circle',x:50,y:0,radius:3.3}]};
 const line=snapSketchPoint(d,[6.8,2.45],.3);assert(Math.abs(line[0]-6.8)<1e-9);assert.equal(line[1],2.3);
 assert.deepEqual(snapSketchPoint(d,[53.45,0],.3),[53.3,0]);
 assert.deepEqual(snapSketchPoint(d,[6.8,4],.3),[5,5]);
});
test('grid toggle preserves spacing and keeps geometric snapping available',()=>{
 const d={...startSketch(state),snap:5,gridSnapEnabled:false,entities:[{id:'e1',type:'line',x1:0,y1:2.3,x2:20,y2:2.3}]};
 assert.deepEqual(snapSketchPoint(d,[6.8,4],.3),[6.8,4]);
 assert.deepEqual(snapSketchPoint(d,[10.1,2.4],.3),[10,2.3]);
 assert.equal(d.snap,5);
});
test('endpoints and midpoints are distinct selectable references',()=>{
 const d={...startSketch(state),tool:'select',entities:[{id:'e1',type:'line',x1:1,y1:2,x2:9,y2:6}]};
 const refs=sketchAnchors(d);assert.equal(refs.length,3);
 let selected=sketchClick(d,[5.1,4.1],.3);assert.equal(selected.selected,'e1');assert.equal(selected.selectedAnchor.kind,'mid');assert.deepEqual(selected.selectedAnchor.point,[5,4]);
 selected=sketchClick(d,[1,2],.3);assert.equal(selected.selectedAnchor.kind,'start');
 assert.equal(sketchClick(selected,[50,50],.3).selectedAnchor,null);
});
test('sketch tool shortcuts clear an unfinished chain without losing geometry or snap settings',()=>{
 const d={...startSketch(state),pending:[[1,2]],cursor:[3,4],gridSnapEnabled:false};
 const next=chooseSketchTool(d,SKETCH_TOOL_KEYS.r);assert.equal(next.tool,'rectangle');assert.deepEqual(next.pending,[]);assert.equal(next.cursor,null);assert.equal(next.entities,d.entities);assert.equal(next.gridSnapEnabled,false);
 assert.equal(new Set(Object.values(SKETCH_TOOL_KEYS)).size,11);
});

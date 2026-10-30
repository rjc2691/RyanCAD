import test from 'node:test';
import assert from 'node:assert/strict';
import {freeRelationshipGeometry,deleteSketchSelection,connectNewSketchLines,anchorReference,editableEndpoint} from '../frontend/src/sketchRelationships.ts';
const line=(id,x1,y1,x2,y2)=>({id,type:'line',x1,y1,x2,y2,fixed:true,construction:false});
test('dimension edits free the entire connected chain while preserving unrelated fixed geometry',()=>{
 const d={entities:[line('a',0,0,10,0),line('b',10,0,10,10),line('c',50,0,60,0)],constraints:[{type:'coincident',a:'a.end',b:'b.start'}]};
 assert.deepEqual(freeRelationshipGeometry(d,['a']).map(e=>e.fixed),[false,false,true]);
});
test('deleting selected geometry removes only its relationships and preserves other dimensions',()=>{
 const d={entities:[line('a',0,0,10,0),line('b',10,0,10,10)],selected:'a',constraints:[{type:'coincident',a:'a.end',b:'b.start'},{type:'distance',a:'b.start',b:'b.end',value:10}]};
 const next=deleteSketchSelection(d);assert.deepEqual(next.entities.map(e=>e.id),['b']);assert.equal(next.constraints.length,1);assert.equal(next.constraints[0].type,'distance');assert.equal(next.selected,null);
});
test('snapped line endpoints create stable connections without redundant joint cycles',()=>{
 const before={entities:[line('a',0,0,10,0)],constraints:[]};
 const first=connectNewSketchLines(before,{...before,entities:[...before.entities,line('b',10,0,10,10)]});
 assert.equal(first.constraints.length,1);assert.equal(first.constraints[0].type,'coincident');
 const next=connectNewSketchLines(first,{...first,entities:[...first.entities,line('c',10,0,20,10)]});
 assert.equal(next.constraints.length,2);assert(next.entities.every(e=>!e.fixed));
});
test('midpoints remain reference markers while point objects and endpoints can connect',()=>{
 assert.equal(editableEndpoint({kind:'mid'}),false);assert.equal(editableEndpoint({kind:'point'}),true);assert.equal(anchorReference({entity:'p',kind:'point'}),'p');assert.equal(anchorReference({entity:'a',kind:'end'}),'a.end');
});

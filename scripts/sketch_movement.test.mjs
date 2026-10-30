import test from 'node:test';
import assert from 'node:assert/strict';
import {sketchMovePoints,sketchMoveOrigin,sketchMoveCandidate} from '../frontend/src/sketchMovement.ts';
const draft=()=>({entities:[{id:'a',type:'line',x1:0,y1:0,x2:20,y2:0,fixed:true},{id:'p',type:'point',x:3,y:4,fixed:true}],constraints:[],selected:'a',selectedEntities:[],selectedPoints:['a:end']});
test('an endpoint moves independently while its opposite endpoint seed is retained',()=>{
 const d=draft();assert.deepEqual(sketchMovePoints(d),['a.end']);assert.deepEqual(sketchMoveOrigin(d),[20,0]);
 const next=sketchMoveCandidate(d,[5,8]);assert.equal(next.entities[0].x1,0);assert.equal(next.entities[0].y1,0);assert.equal(next.entities[0].x2,25);assert.equal(next.entities[0].y2,8);assert.equal(d.entities[0].x2,20);assert.equal(next.entities[1].fixed,true);
});
test('whole-line and midpoint movement translates both endpoints',()=>{
 const d={...draft(),selectedEntities:['a'],selectedPoints:[]};assert.deepEqual(sketchMoveOrigin(d),[10,0]);
 const next=sketchMoveCandidate(d,[2,3]);assert.deepEqual([next.entities[0].x1,next.entities[0].y1,next.entities[0].x2,next.entities[0].y2],[2,3,22,3]);
 assert.deepEqual(sketchMovePoints({...d,selectedEntities:[],selectedPoints:['a:mid']}),['a.start','a.end']);
});
test('standalone point selection and explicit fixed relationships are respected',()=>{
 const d={...draft(),selected:'p',selectedPoints:['p:point']};const next=sketchMoveCandidate(d,[-1,2]);assert.deepEqual([next.entities[1].x,next.entities[1].y],[2,6]);
 assert.throws(()=>sketchMoveCandidate({...d,constraints:[{type:'fix',a:'p'}]},[1,1]),/fixed-point/);
});
test('temporary targets retain the existing distance and connection relationships',()=>{
 const d={...draft(),constraints:[{type:'distance',a:'a.start',b:'a.end',value:20}]};const next=sketchMoveCandidate(d,[5,0]);assert.equal(next.constraints[0],d.constraints[0]);assert.equal(next.constraints[1].type,'fix');assert.equal(next.constraints[1].a,'a.end');
});

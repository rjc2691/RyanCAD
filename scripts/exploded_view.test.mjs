import test from 'node:test';
import assert from 'node:assert/strict';
import {explodedLayout} from '../frontend/src/explodedView.ts';
const matrix=(x=0,y=0,z=0)=>[[1,0,0,x],[0,1,0,y],[0,0,1,z],[0,0,0,1]];
const geom={p:{bounds:{min:[-1,-2,-3],max:[1,2,3]}},q:{bounds:{min:[-2,-1,-1],max:[2,1,1]}}};
const part=(id,definition,x,visible=true)=>({id,definition,kind:'solid',matrix:matrix(x),visible,suppressed:false});
test('separation scales center vectors from the overall bounds center',()=>{
 const rows=[part('a','p',0),part('b','q',10)],layout=explodedLayout(rows,geom,100);
 assert.deepEqual(layout.center.toArray(),[5.5,0,0]);assert.deepEqual(layout.entries.get('a').offset.toArray(),[-5.5,0,0]);assert.deepEqual(layout.entries.get('b').offset.toArray(),[4.5,0,0]);
 const half=explodedLayout(rows,geom,50);assert.deepEqual(half.entries.get('b').offset.toArray(),[2.25,0,0]);
});
test('single centered part stays in place; hidden parts still contribute, suppressed and invalid bounds do not',()=>{
 const only=explodedLayout([part('a','p',4)],geom,200);assert.equal(only.entries.get('a').offset.length(),0);
 const rows=[part('a','p',0),part('b','q',10,false),{...part('c','p',100),suppressed:true},part('d','missing',500)];
 assert.equal(explodedLayout(rows,geom,100).center.x,5.5);
});
test('bounds reflect rotation and translation of each instance independently',()=>{
 const a=part('a','p',0);a.matrix=[[0,-1,0,20],[1,0,0,3],[0,0,1,0],[0,0,0,1]];
 const b=part('b','p',0),layout=explodedLayout([a,b],geom,100),entry=layout.entries.get('a');
 assert.deepEqual(entry.center.toArray(),[20,3,0]);assert.deepEqual(entry.bounds.getSize(entry.center.clone()).toArray(),[4,2,6]);
});

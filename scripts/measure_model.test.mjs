import test from 'node:test';
import assert from 'node:assert/strict';
import {measurePoint,measureVector,captureMeasurePoint} from '../frontend/src/measureModel.ts';
const state={document:{components:{p:{name:'Part'}}},geometry:{p:{edges:[],faces:[]}},occurrences:[{id:'group/p',definition:'p',name:'Part',matrix:[[0,-1,0,10],[1,0,0,20],[0,0,1,-5],[0,0,0,1]]}]};
const base={occurrence:'group/p',definition:'p'};
test('measurement uses exact clicked local face/edge position and placed world coordinates',()=>{
 const face=measurePoint({...base,point:[2,3,4],face:{id:'face0',area:12}},state);
 assert.deepEqual(face.point,[7,22,-1]);assert.equal(face.detail.name,'Face area');assert.equal(face.detail.power,2);
 const edge=measurePoint({...base,point:[4,5,6],edge:{id:'edge0',length:30,midpoint:[0,0,0]}},state);
 assert.deepEqual(edge.point,[5,24,1]);assert.equal(edge.detail.value,30);assert.equal(edge.detail.power,1);
});
test('vertices and midpoints use exact snap coordinates; tree-only components cannot invent a point',()=>{
 assert.deepEqual(measurePoint({...base,point:[100,100,100],vertex:{point:[1,2,3],edge:{id:'edge0'},anchor:'mid'}},state).point,[8,21,-2]);
 assert.equal(measurePoint(base,state),null);assert.equal(measurePoint({...base,point:[NaN,0,0]},state),null);
 assert.equal(measurePoint({...base,occurrence:'deleted',point:[0,0,0]},state),null);
 assert.deepEqual(measurePoint({worldOrigin:true},state).point,[0,0,0]);
});
test('point vector is signed B minus A and handles coincident samples without NaN',()=>{
 assert.deepEqual(measureVector([3,4,0],[0,0,0]),{delta:[-3,-4,0],distance:5,direction:[-.6,-.8,0]});
 assert.deepEqual(measureVector([0,0,0],[0,0,0]),{delta:[0,0,0],distance:0,direction:null});
});
test('two ordinary clicks measure a pair; third starts fresh; shift extends/toggles; replacement preserves chain',()=>{
 const a=measurePoint({...base,point:[0,0,0]},state),b=measurePoint({...base,point:[1,0,0]},state),c=measurePoint({...base,point:[2,0,0]},state);
 const pair=captureMeasurePoint(captureMeasurePoint([],a),b);assert.deepEqual(pair,[a,b]);
 assert.deepEqual(captureMeasurePoint(pair,c),[c]);
 const chain=captureMeasurePoint(pair,c,true);assert.deepEqual(chain,[a,b,c]);
 assert.deepEqual(captureMeasurePoint(chain,b,true),[a,c]);
 assert.deepEqual(captureMeasurePoint(chain,c,false,0),[c,b,c]);assert.deepEqual(pair,[a,b]);
});

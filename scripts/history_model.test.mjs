import test from 'node:test';
import assert from 'node:assert/strict';
import {historyLanes,historyStep} from '../frontend/src/historyModel.ts';
const features=[{id:'a1',owner:'a'},{id:'s',owner:'root'},{id:'b1',owner:'b'},{id:'a2',owner:'a'},{id:'t',owner:'tool'}];
const components={a:{name:'Bracket'},b:{name:'Cover'},root:{name:'Design'},tool:{name:'Cutter',purpose:'tool'}};
test('parallel timelines preserve global columns and root events across owners',()=>{
 const lanes=historyLanes(features,components,true,new Set());
 assert.deepEqual(lanes.find(l=>l.id==='a').features.map(f=>f.column),[0,3]);
 assert.deepEqual(lanes[0].features.map(f=>f.column),[1]);
 assert.equal(lanes.find(l=>l.id==='tool').name,'Cutter');
 assert.equal(lanes.flatMap(l=>l.features).length,features.length);
});
test('hiding lanes merges events into root without compacting or losing columns',()=>{
 const lanes=historyLanes(features,components,true,new Set(['a','tool']));
 assert.deepEqual(lanes[0].features.map(f=>f.column),[0,1,3,4]);
 assert(!lanes.some(l=>l.id==='a'));
 const unified=historyLanes(features,components,false,new Set(['a']));
 assert.equal(unified.length,1);assert.deepEqual(unified[0].features.map(f=>f.column),[0,1,2,3,4]);
});
test('history steps represent actual feature removal, origin, and return to live design',()=>{
 const order=['a','b','c'];
 assert.equal(historyStep(order,null,-1),'b');
 assert.equal(historyStep(order,'b',-1),'a');
 assert.equal(historyStep(order,'a',-1),'origin');
 assert.equal(historyStep(order,'origin',1),'a');
 assert.equal(historyStep(order,'b',1),null);
 assert.equal(historyStep(['a'],null,-1),'origin');
 assert.equal(historyStep(['a'],'origin',1),null);
});

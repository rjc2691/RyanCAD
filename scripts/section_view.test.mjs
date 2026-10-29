import test from 'node:test';
import assert from 'node:assert/strict';
import {updateSectionPlane,sectionKeeps,sectionRange} from '../frontend/src/sectionView.ts';
test('reference plane offset follows a tilted plane normal and flips without moving the cut',()=>{
 const settings={axis:'Y',offset:2,flipped:false,reference:{label:'Tilted sketch',origin:[10,0,4],normal:[1,0,1]}};
 const plane=updateSectionPlane(settings),n=plane.normal.clone();
 const origin={x:10,y:0,z:4};assert(!sectionKeeps(origin,plane));
 const ahead={x:10+n.x*3,y:0,z:4+n.z*3};assert(sectionKeeps(ahead,plane));
 updateSectionPlane({...settings,flipped:true},plane);assert(!sectionKeeps(ahead,plane));assert(sectionKeeps(origin,plane));
 const range=sectionRange(settings,[{id:'i',definition:'p',kind:'solid',visible:true,matrix:[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]}],{p:{bounds:{min:[0,0,0],max:[20,10,8]}}},0);
 assert(Math.abs(range.center)<1e-6);
});
test('all section orientations clip at an exact signed world position and flip sides',()=>{
 for(const axis of ['X','Y','Z']){
  const p={x:0,y:0,z:0};p[axis.toLowerCase()]=12;
  const plane=updateSectionPlane({axis,offset:10,flipped:false});
  assert(sectionKeeps(p,plane));p[axis.toLowerCase()]=8;assert(!sectionKeeps(p,plane));
  const identity=updateSectionPlane({axis,offset:10,flipped:true},plane);
  assert.equal(identity,plane);assert(sectionKeeps(p,plane));
  p[axis.toLowerCase()]=10;assert(sectionKeeps(p,plane));
 }
});
test('section bounds include transformed component placement and provide a safe empty range',()=>{
 const settings={axis:'X',offset:0,flipped:false};
 const geometry={p:{bounds:{min:[0,0,0],max:[10,20,30]}}};
 const occurrence={id:'i',definition:'p',kind:'solid',visible:true,matrix:[[1,0,0,100],[0,1,0,0],[0,0,1,0],[0,0,0,1]]};
 assert.deepEqual(sectionRange(settings,[occurrence],geometry,0),{min:99,max:111,center:105});
 const empty=sectionRange(settings,[],{},0);assert(empty.min<0&&empty.max>0);
});

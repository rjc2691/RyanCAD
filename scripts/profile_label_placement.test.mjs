import test from 'node:test';import assert from 'node:assert/strict';
import {ProfileLabelPlacement} from '../frontend/src/operations/profileLabelPlacement.ts';
const corners=(jitter=0)=>[{x:100,y:0,distance:100+jitter,local:[1,0,0]},{x:-100,y:0,distance:100-jitter,local:[-1,0,0]}];
test('opposite equal-distance corners do not alternate under numeric jitter or changed loop order',()=>{
 const placement=new ProfileLabelPlacement(),positions=new Set();
 for(let i=0;i<1000;i++){const points=corners(i%2?1e-7:-1e-7);if(i%3===0)points.reverse();positions.add(placement.update(points,'rectangle').x);}
 assert.deepEqual([...positions],[100]);
});
test('label changes anchor for meaningful view changes and resets on a new profile',()=>{
 const p=new ProfileLabelPlacement();p.update(corners(),'one');const a=corners();a[1].distance=120;assert.equal(p.update(a,'one').x,-100);
 assert.equal(p.update(corners(),'new-profile').x,100);
 assert.equal(p.update([],'new-profile'),null);
});
test('visibility has a dead band around its size threshold and invalid coordinates are ignored',()=>{
 const p=new ProfileLabelPlacement(),point=distance=>[{x:distance,y:0,distance,local:[1,0,0]}];
 assert.equal(p.update(point(79),'a'),null);assert(p.update(point(81),'a'));
 for(const d of [79,80,79.9,71])assert(p.update(point(d),'a'));
 assert.equal(p.update(point(69),'a'),null);assert.equal(p.update(point(79),'a'),null);
 assert.equal(p.update([{x:NaN,y:0,distance:100,local:[0,0,0]}],'a'),null);
});

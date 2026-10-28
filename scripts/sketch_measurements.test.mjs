import test from 'node:test';
import assert from 'node:assert/strict';
import {sketchMeasurements} from '../frontend/src/sketchMeasurements.ts';
const line=(id,x1,y1,x2,y2)=>({id,type:'line',x1,y1,x2,y2});
test('length dimensions distinguish persistent constraints from measured values',()=>{
 const d={entities:[line('e1',0,0,10,0),line('e2',10,0,10,5)],constraints:[{type:'distance',a:'e1.end',b:'e1.start',value:12}]};
 const result=sketchMeasurements(d);const first=result.find(v=>v.id==='length:e1'),second=result.find(v=>v.id==='length:e2');
 assert.equal(first.constrained,true);assert.equal(first.label,'12 mm');assert.equal(second.constrained,false);assert.equal(second.label,'5 mm');
 const angle=result.find(v=>v.kind==='angle');assert.equal(angle.label,'90 °');assert.equal(angle.constrained,false);
});
test('connected angles are contextual and unrelated line pairs do not create false corners',()=>{
 const d={entities:[line('a',0,0,10,0),line('b',10,0,10,10),line('c',40,40,50,40)],constraints:[{type:'angle',a:'a',b:'b',value:45}]};
 const angles=sketchMeasurements(d).filter(v=>v.kind==='angle');assert.equal(angles.length,1);assert.equal(angles[0].label,'45 °');assert(angles[0].constrained);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectorMeasurements} from '../frontend/src/inspectorMeasurements.ts';
const fixture=()=>({document:{components:{p:{kind:'solid'},q:{kind:'solid'},a:{kind:'assembly'},sheet:{kind:'planar'}}},geometry:{p:{status:'valid',volume:10,area:20},q:{status:'valid',volume:5,area:8},sheet:{status:'planar',volume:null,area:30}},occurrences:[
 {id:'a',definition:'a',kind:'assembly'},
 {id:'a/p',definition:'p',kind:'solid',visible:true},
 {id:'a/p2',definition:'p',kind:'solid',visible:false},
 {id:'a/q',definition:'q',kind:'solid',suppressed:true},
 {id:'other',definition:'q',kind:'solid',visible:true},
]});
test('design totals count linked and hidden instances, excluding suppressed parts',()=>{
 const m=inspectorMeasurements(fixture(),null);assert.equal(m.scope,'design');assert.equal(m.volume,25);assert.equal(m.area,48);assert.equal(m.count,3);
});
test('selected part shows one component instead of every linked use',()=>{
 const m=inspectorMeasurements(fixture(),{definition:'p',occurrence:'a/p'});assert.equal(m.scope,'component');assert.equal(m.volume,10);assert.equal(m.area,20);assert.equal(m.count,1);
});
test('selected assembly totals only that placed subtree',()=>{
 const m=inspectorMeasurements(fixture(),{definition:'a',occurrence:'a'});assert.equal(m.scope,'assembly');assert.equal(m.volume,20);assert.equal(m.count,2);
});
test('planar stock has profile area and no invented solid volume',()=>{
 const s=fixture();s.occurrences.push({id:'sheet',definition:'sheet',kind:'planar'});
 const part=inspectorMeasurements(s,{definition:'sheet',occurrence:'sheet'});assert.equal(part.volume,null);assert.equal(part.area,30);assert.equal(part.areaLabel,'Profile area');
 const all=inspectorMeasurements(s,null);assert.equal(all.volume,25);assert.equal(all.area,78);assert.equal(all.areaLabel,'Surface / profile area');
});
test('build-stage geometry and unfinished parts have honest scope and availability',()=>{
 const s=fixture();const historical={p:{status:'valid',volume:4,area:6}};
 const m=inspectorMeasurements(s,null,historical);assert.equal(m.volume,8);assert.equal(m.area,12);assert.equal(m.incomplete,1);
 const missing=inspectorMeasurements(s,{definition:'q',occurrence:'other'},historical);assert.equal(missing.volume,null);assert.equal(missing.area,null);
 const stale=inspectorMeasurements(s,{definition:'deleted',occurrence:'gone'});assert.equal(stale.scope,'design');assert.equal(stale.volume,25);
});

test('tool-library geometry is excluded from assembly/design statistics but measurable in its workbench',()=>{
 const s=fixture();s.document.components.cutter={name:'Cutter',kind:'solid',purpose:'tool'};
 s.geometry.cutter={status:'valid',volume:100,area:200};s.occurrences.push({id:'tool',definition:'cutter',kind:'solid'});
 assert.equal(inspectorMeasurements(s,null).volume,25);
 const tool=inspectorMeasurements(s,{occurrence:'tool',definition:'cutter'});
 assert.equal(tool.volume,100);assert.equal(tool.count,1);
});

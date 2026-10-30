import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionCandidates,lineSeparation,candidateExpression} from '../frontend/src/sketchDimensions.ts';
import {sketchAngle} from '../frontend/src/sketchAngles.ts';
import {sketchMeasurements} from '../frontend/src/sketchMeasurements.ts';
const line=(id,x1,y1,x2,y2)=>({id,type:'line',x1,y1,x2,y2});
const a=line('a',0,0,20,0),b=line('b',20,8,0,8),c=line('c',0,0,10,10);
const draft=(entities=[a,b,c],constraints=[])=>({entities,constraints,frame:{origin:[0,0,0],u:[1,0,0],normal:[0,0,1]}});

test('parallel pairs default to perpendicular distance and retain angle as an alternative',()=>{
 const choices=dimensionCandidates(draft(),['a','b']);assert.deepEqual(choices.map(c=>c.kind),['distance','angle']);assert.equal(choices[0].measured,8);assert.equal(choices[1].measured,180);
 assert.deepEqual(dimensionCandidates(draft(),['b','a']).map(c=>c.kind),['distance','angle']);
 assert.deepEqual(dimensionCandidates(draft(),['a','c']).map(c=>c.kind),['angle']);
 assert.deepEqual(dimensionCandidates(draft(),['a']).map(c=>c.kind),['length']);
 for(const ids of [[],['missing'],['a','b','c']])assert.equal(dimensionCandidates(draft(),ids).length,0);
});
test('separation is independent of line direction and finite segment overlap',()=>{
 const u=line('u',0,0,10,10),v=line('v',20,30,30,40);assert(Math.abs(lineSeparation(u,v).value-Math.sqrt(50))<1e-8);
 assert.deepEqual(dimensionCandidates(draft([u,v]),['u','v']).map(c=>c.kind),['distance','angle']);
 assert.equal(lineSeparation(a,line('collinear',30,0,40,0)).value,0);
});
test('existing dimension identities and named expressions survive reversed selection order',()=>{
 const constraint={type:'line_distance',a:'a',b:'b',value:12,pendingExpression:'Spacing'};
 const d=draft([a,b],[constraint]);const choices=dimensionCandidates(d,['b','a']);assert.equal(choices[0].constraint,constraint);assert.equal(choices[0].id,'line_distance:a:b');assert.equal(candidateExpression(choices[0],d,{document:{parameters:{}}}),'Spacing');
 const annotation=sketchMeasurements(d).find(m=>m.kind==='distance');assert.equal(annotation.label,'12 mm');assert(annotation.constrained);assert.equal(annotation.start[0],annotation.end[0]);
});
test('candidate registry retains world-axis dimensions and recalculates after selection changes',()=>{
 const d=draft();assert.equal(dimensionCandidates(d,['a'],'Y')[0].measured,90);
 assert.throws(()=>dimensionCandidates(d,['a'],'Z'),/perpendicular/);
 assert.equal(dimensionCandidates(d,['a','b']).length,2);assert.equal(dimensionCandidates(d,['a','c']).length,1);
 const solved={...d,entities:[a,{...b,y1:12,y2:12},c]};assert.equal(dimensionCandidates(solved,['a','b'])[0].measured,12);
});

test('angle guides for separated lines use line directions rather than an endpoint-to-endpoint diagonal',()=>{
 const corner=sketchAngle([a,b],a,b),u=corner.start.map((n,i)=>n-corner.vertex[i]),v=corner.end.map((n,i)=>n-corner.vertex[i]);
 assert(Math.abs(u[0]*v[1]-u[1]*v[0])<1e-8);assert(u[0]*v[0]+u[1]*v[1]<0);
 const annotation=sketchMeasurements(draft([a,b],[{type:'angle',a:'a',b:'b',value:270,angle_frame:{a:'start',b:'start',orientation:1}}])).find(m=>m.kind==='angle');assert.equal(annotation.reflex,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {sketchAngle,sketchAxisAngle,interiorAngleExpression} from '../frontend/src/sketchAngles.ts';
import {sketchMeasurements} from '../frontend/src/sketchMeasurements.ts';
const line=(id,a,b)=>({id,type:'line',x1:a[0],y1:a[1],x2:b[0],y2:b[1]});
const reverse=e=>({...e,x1:e.x2,y1:e.y2,x2:e.x1,y2:e.y1});
test('convex polygon interior is positive and independent of winding, line direction and selection order',()=>{
 const points=[[0,0],[10,0],[5,Math.sqrt(75)]];
 for(const winding of [points,[...points].reverse()])for(let mask=0;mask<8;mask++){
  const es=winding.map((p,i)=>{const e=line(String(i),p,winding[(i+1)%3]);return mask&(1<<i)?reverse(e):e;});
  for(let i=0;i<3;i++)for(const [a,b] of [[es[i],es[(i+1)%3]],[es[(i+1)%3],es[i]]])assert(Math.abs(sketchAngle(es,a,b).value-60)<1e-8);
 }
});
test('concave polygon reports a positive reflex interior instead of its exterior',()=>{
 const points=[[0,0],[4,0],[4,4],[2,2],[0,4]];
 const es=points.map((p,i)=>line(String(i),p,points[(i+1)%points.length]));
 for(const [a,b] of [[es[2],es[3]],[reverse(es[3]),reverse(es[2])]])assert.equal(sketchAngle(es,a,b).value,270);
 const angles=sketchMeasurements({entities:es,constraints:[]}).filter(m=>m.kind==='angle');
 assert.equal(angles.find(m=>m.id==='angle:2:3').label,'270 °');assert(angles.find(m=>m.id==='angle:2:3').reflex);
});
test('legacy signed constraints display interior values and migrate expressions without changing intent',()=>{
 const a=line('a',[0,0],[10,0]),b=line('b',[10,0],[5,-Math.sqrt(75)]),es=[a,b];
 const m=sketchMeasurements({entities:es,constraints:[{type:'angle',a:'a',b:'b',value:-120,parameterName:'corner'}]}).find(m=>m.kind==='angle');
 assert.equal(m.label,'p: 60 °');
 const frame=sketchAngle(es,a,b).frame;assert.equal(interiorAngleExpression('corner',-120,frame),'(corner) + 180 deg');
 const modern=sketchMeasurements({entities:es,constraints:[{type:'angle',a:'a',b:'b',value:60,angle_frame:frame}]}).find(m=>m.kind==='angle');assert.equal(modern.label,'60 °');
});

test('axis dimensions use world directions in every sketch plane and true angles on tilted planes',()=>{
 const line={id:'line',type:'line',x1:0,y1:0,x2:10,y2:10};
 const xy={origin:[0,0,0],u:[1,0,0],normal:[0,0,1]};
 assert(Math.abs(sketchAxisAngle(xy,'X',line).value-45)<1e-8);assert(Math.abs(sketchAxisAngle(xy,'Y',line).value-45)<1e-8);assert.throws(()=>sketchAxisAngle(xy,'Z',line),/perpendicular/);
 const yz={origin:[0,0,0],u:[0,1,0],normal:[1,0,0]};assert.equal(sketchAxisAngle(yz,'Z',{...line,y2:0}).value,90);
 const q=Math.SQRT1_2;const tilted={origin:[0,0,0],u:[q,0,q],normal:[-q,0,q]};assert(Math.abs(sketchAxisAngle(tilted,'X',line).value-60)<1e-8);
 const c={type:'angle',a:'line',b:'world:X',value:30,angle_frame:{a:'start',b:'start',orientation:-1}};
 const annotation=sketchMeasurements({entities:[line],constraints:[c],frame:xy}).find(m=>m.axis==='X');assert.equal(annotation.label,'30 \u00b0 \u00b7 X');assert.equal(annotation.constrained,true);
});
test('legacy constraints stored in reverse line order display the same interior angle',()=>{
 const a=line('a',[0,0],[10,0]),b=line('b',[10,0],[5,-Math.sqrt(75)]);
 const m=sketchMeasurements({entities:[a,b],constraints:[{type:'angle',a:'b',b:'a',value:120}]}).find(m=>m.kind==='angle');assert.equal(m.label,'60 \u00b0');
 assert.equal(interiorAngleExpression('-120',-120,sketchAngle([a,b],a,b).frame),'60');
});

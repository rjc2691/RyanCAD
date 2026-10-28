import test from 'node:test';
import assert from 'node:assert/strict';
import { MeasurementService } from '../frontend/src/measurements/MeasurementService.ts';

const edge=(id,a,b,length=Math.hypot(...a.map((v,i)=>v-b[i])))=>({id,type:'LINE',length,a,b,anchor:a.map((v,i)=>(v+b[i])/2)});
const plate=()=>({id:'plate',definition:'plate-def',bounds:{min:[0,0,0],max:[6,47,47],size:[6,47,47]},
  edges:[edge('long',[0,0,47],[0,47,47]),edge('width',[0,47,47],[6,47,47]),edge('height',[0,47,0],[0,47,47]),edge('repeat',[6,0,47],[6,47,47])],
  faces:[{id:'front',type:'PLANE',area:2209,center:[6,23.5,23.5],normal:[1,0,0],bounds:{min:[6,0,0],max:[6,47,47],size:[0,47,47]}}]});
const project=(_id,p)=>({x:430+p[1]*5+p[0]*3,y:620-p[2]*5-p[1]*2,visible:true});
const context=(changes={})=>({selected:{occurrence:'plate'},hovered:null,now:1000,width:1100,height:850,units:'mm',project,reserved:[],...changes});

test('thin plate exposes meaningful spans including thickness, within a small budget',()=>{
  const service=new MeasurementService(), candidates=service.candidates([plate()]), x=context();
  const placed=service.place(service.rank(candidates,x),x);
  assert.equal(placed.length,3);
  assert(placed.some(p=>p.candidate.value===6));
  assert(placed.some(p=>p.candidate.value===47));
  assert.equal(new Set(placed.map(p=>p.candidate.group)).size,placed.length);
});
test('selection beats a recent unrelated feature and duplicate pressure',()=>{
  const service=new MeasurementService(), part=plate();
  for(let i=0;i<40;i++)part.edges.push(edge('copy'+i,[0,0,i],[0,47,i]));
  const candidates=service.candidates([part]);
  service.observe({occurrence:'plate',entity:'edge:repeat'},'select',1000);
  const ranked=service.rank(candidates,context({selected:{occurrence:'plate',entity:'edge:long'}}));
  assert.equal(ranked[0].candidate.entity,'edge:long');
  assert(ranked[0].signals.competition<0);
});
test('recency decays and policy can explain each signal',()=>{
  const service=new MeasurementService(), candidates=service.candidates([plate()]);
  service.observe({occurrence:'plate',entity:'edge:width'},'select',1000);
  const first=service.rank(candidates,context()).find(x=>x.candidate.entity==='edge:width');
  const later=service.rank(candidates,context({now:25000})).find(x=>x.candidate.entity==='edge:width');
  assert(first.signals.recency>later.signals.recency);
  assert.equal(first.score,Object.values(first.signals).reduce((a,b)=>a+b,0));
  assert(service.explain().length>0);
});
test('reversed and numerically noisy parallel spans do not create repeated labels',()=>{
  const service=new MeasurementService(), p=plate();
  p.edges.push(edge('reverse',[0,47,47],[0.00001,0,47],47));
  const candidates=service.candidates([p]);
  assert.equal(candidates.find(c=>c.entity==='edge:long').group,candidates.find(c=>c.entity==='edge:reverse').group);
  const placed=service.place(service.rank(candidates,context()),context());
  assert.equal(new Set(placed.map(p=>p.candidate.group)).size,placed.length);
});
test('different fine dimensions remain different candidates even on a large part',()=>{
  const service=new MeasurementService(), p=plate();
  p.edges=[edge('a',[0,0,0],[0,1000,0],1000),edge('b',[0,0,1],[0,1000.004,1],1000.004)];
  const candidates=service.candidates([p]);
  assert.notEqual(candidates[0].group,candidates[1].group);
});
test('face-focused context prefers lengths over an area card when spans are available',()=>{
  const service=new MeasurementService(), p=plate(), candidates=service.candidates([p]);
  const x=context({selected:{occurrence:'plate',entity:'face:front',face:p.faces[0],point:[6,20,30]}});
  service.observe(x.selected,'select',1000);
  const placed=service.place(service.rank(candidates,x),x);
  assert(placed.some(p=>p.candidate.value===6));
  assert(placed.every(p=>p.candidate.kind!=='area'));
});
test('hidden geometry, end-on lengths, and invalid outputs are suppressed',()=>{
  const service=new MeasurementService(), candidates=service.candidates([plate()]);
  assert.equal(service.place(service.rank(candidates,context({visibility:()=>0})),context()).length,0);
  const x=context({project:()=>({x:400,y:400,visible:true})});
  assert.equal(service.rank(candidates,x).length,0);
  candidates[0].value=NaN;
  assert(service.rank(candidates,context()).every(c=>Number.isFinite(c.candidate.value)));
});
test('labels respect protected UI regions and compact/hover budgets',()=>{
  const service=new MeasurementService(), candidates=service.candidates([plate()]);
  const hover=context({selected:null,hovered:{occurrence:'plate'}});
  assert(service.place(service.rank(candidates,hover),hover).length<=2);
  const blocked=context({reserved:[{x:0,y:0,width:1100,height:850}]});
  assert.equal(service.place(service.rank(candidates,blocked),blocked).length,0);
});
test('measured values survive projection and unit conversion',()=>{
  const service=new MeasurementService(), candidates=service.candidates([plate()]);
  const x=context({units:'in',selected:{occurrence:'plate',entity:'edge:long'}});
  const placed=service.place(service.rank(candidates,x),x);
  assert(placed.some(p=>p.candidate.value===47&&p.label.includes('1.8504 in')));
  assert(candidates.some(c=>c.value===47));
});
test('curve length uses a compact leader rather than a misleading straight dimension',()=>{
  const service=new MeasurementService(), p=plate();
  p.edges=[{...edge('arc',[6,0,20],[6,10,20],Math.PI*10),type:'CIRCLE',anchor:[6,5,25]}];
  const candidates=service.candidates([p]);
  const x=context({selected:{occurrence:'plate',entity:'edge:arc'}});
  const item=service.place(service.rank(candidates,x),x).find(p=>p.candidate.kind==='curve');
  assert(item.compact);assert(item.label.startsWith('L 31.416'));
});
test('candidate providers and policy weights can evolve without a renderer',()=>{
  const service=new MeasurementService();
  service.providers.set('fit',part=>[{id:'fit-gap',occurrence:part.id,entity:'fit',kind:'length',value:.3,a:[0,0,47],b:[6,47,47],anchor:[3,23.5,47],group:'fit-gap',qualifier:'Explicit fit gap',confidence:1}]);
  service.signals.set('fitAttention',{weight:150,score:c=>c.entity==='fit'?1:0});
  const ranked=service.rank(service.candidates([plate()]),context());
  assert.equal(ranked[0].candidate.id,'fit-gap');
  assert.equal(ranked[0].signals.fitAttention,150);
});

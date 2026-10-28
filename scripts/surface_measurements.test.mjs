import test from 'node:test';
import assert from 'node:assert/strict';
import {placeSurfaceMeasurements, onSurface} from '../frontend/src/measurements/SurfaceMeasurements.ts';
import {MeasurementService} from '../frontend/src/measurements/MeasurementService.ts';

const rectTriangles=(x,y,w,h)=>[[[x,y,0],[x+w,y,0],[x+w,y+h,0]],[[x,y,0],[x+w,y+h,0],[x,y+h,0]]];
const face=()=>({occurrence:'p',id:'top',type:'PLANE',area:8000,center:[50,40,0],normal:[0,0,1],
  bounds:{min:[0,0,0],max:[100,80,0],size:[100,80,0]},triangles:rectTriangles(0,0,100,80)});
const edge=(id='bottom',y=0,length=100)=>({id,occurrence:'p',entity:`edge:${id}`,kind:'length',value:length,
  a:[0,y,0],b:[length,y,0],anchor:[length/2,y,0],group:id,qualifier:'Edge length',confidence:1});
const rank=candidates=>candidates.map(candidate=>({candidate,score:100,signals:{selection:100}}));
const context=(overrides={})=>({selected:{occurrence:'p'},hovered:null,now:1000,units:'mm',width:1800,height:1000,
  reserved:[],project:(_id,p)=>({x:100+p[0]*3+p[1]*1.5,y:500-p[1]*2,visible:true}),
  facing:()=>.8,visiblePoint:()=>true,...overrides});

test('on-face glyphs retain both skew and foreshortening instead of screen-aligned rotation',()=>{
  const [p]=placeSurfaceMeasurements(rank([edge()]),[face()],context());
  assert(p); assert.equal(p.label,'100 mm');
  assert(Math.abs(p.matrix[2])>.1,'vertical text basis carries face skew');
  assert(Math.abs(p.matrix[3])<.9,'text height is foreshortened');
  const [other]=placeSurfaceMeasurements(rank([edge()]),[face()],context({
    project:(_id,p)=>({x:100+p[0]*2-p[1],y:500-p[0]-p[1]*3,visible:true})}));
  assert.notDeepEqual(other.matrix,p.matrix);
  assert.equal(other.candidate.value,100,'camera changes never alter native dimensions');
  for(const item of [p,other]) {
    assert(Math.hypot(item.matrix[0],item.matrix[1])<=1.000001);
    assert(Math.hypot(item.matrix[2],item.matrix[3])<=1.000001,
      'an oblique view compresses text instead of stretching its other axis');
  }
});

test('native face triangles exclude holes, empty bounding-box space and off-plane points',()=>{
  const f=face(); f.triangles=[...rectTriangles(0,0,100,20),...rectTriangles(0,60,100,20),
    ...rectTriangles(0,20,20,40),...rectTriangles(80,20,20,40)];
  assert(onSurface(f,[10,40,0])); assert(!onSurface(f,[50,40,0]));
  assert(!onSurface(f,[10,40,1]));
  const result=placeSurfaceMeasurements(rank([edge('inside-hole',40,70)]),[f],context());
  assert.equal(result.length,0);
});

test('back/edge-on faces, curved surfaces, occluded text and reserved controls do not receive labels',()=>{
  for(const change of [{facing:()=>0},{visiblePoint:()=>false},
    {reserved:[{x:0,y:0,width:1800,height:1000}]}])
    assert.equal(placeSurfaceMeasurements(rank([edge()]),[face()],context(change)).length,0);
  assert.equal(placeSurfaceMeasurements(rank([edge()]),[{...face(),type:'CYLINDER'}],context()).length,0);
});

test('labels remain within the measured face and avoid each other without external leaders',()=>{
  const result=placeSurfaceMeasurements(rank([edge('a',0,100),edge('b',0,90),edge('c',80,100)]),[face()],context());
  assert(result.length>=2);
  for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){
    const a=result[i].rect,b=result[j].rect;
    assert(!(a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height));
  }
  assert.equal(placeSurfaceMeasurements(rank([edge()]),[face()],context({
    project:(_id,p)=>({x:100+p[0]*.1,y:500-p[1]*.1,visible:true})})).length,0,
    'a label that cannot fit on a tiny face is omitted');
});

test('surface budget can display more than three useful dimensions and suppresses equivalent ones',()=>{
  const faces=Array.from({length:6},(_,i)=>({...face(),occurrence:`p${i}`}));
  const candidates=faces.map((f,i)=>({...edge(`edge${i}`,0,90+i),occurrence:f.occurrence}));
  const x=context({project:(id,p)=>({x:100+Number(id.slice(1))*250+p[0]*2,y:500-p[1]*2,visible:true})});
  assert.equal(placeSurfaceMeasurements(rank(candidates),faces,x).length,6);
  const duplicates=[edge(),{...edge(),id:'copy'}];
  assert.equal(placeSurfaceMeasurements(rank(duplicates),[face()],context()).length,1);
});

test('group members participate in attention ranking and inch values remain native measurements',()=>{
  const service=new MeasurementService(),candidate=edge();
  const x=context({selected:{occurrence:'group'},selectedItems:[{occurrence:'p'}],units:'in'});
  const ranked=service.rank([candidate],x);
  assert.equal(ranked.length,1); assert(ranked[0].signals.selection>0);
  const [p]=placeSurfaceMeasurements(ranked,[face()],x);
  assert(p.label.includes('3.937 in')); assert.equal(p.candidate.value,100);
});

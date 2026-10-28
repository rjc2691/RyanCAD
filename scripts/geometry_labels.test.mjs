import test from 'node:test';
import assert from 'node:assert/strict';
import {entityName,referenceLabel,resolveDisplaySelection} from '../frontend/src/geometryLabels.ts';
const edge={id:'edge_12',name:'Edge 13',signature:'e',segment_start:0,segment_count:1},face={id:'face_3',name:'Face 4',signature:'f'};
const geometry={geometry_key:'g1',edges:[edge],faces:[face],vertices:[[0,0,0],[1,0,0]],vertex_info:[{id:'vertex_0',name:'Vertex 1'},{id:'vertex_1',name:'Vertex 2'}]};
const base={definition:'p',occurrence:'i'};
test('numbered entity labels include placed-component context without replacing guarded geometry references',()=>{
 assert.equal(entityName({...base,edge},geometry),'Edge 13');assert.equal(entityName({...base,face},geometry),'Face 4');assert.equal(entityName({...base,vertex:{point:[1,0,0],edge,anchor:'end'}},geometry),'Vertex 2');
 const s={geometry:{p:geometry},document:{components:{p:{name:'Part'}}},occurrences:[{id:'i',name:'Placed part'}]};assert.equal(referenceLabel({...base,edge},s),'Edge 13 · Placed part');
});
test('display hover resolves current native buffers and rejects missing or ambiguous rebuilt entities',()=>{
 assert.equal(resolveDisplaySelection({...base,edge},geometry).edge,edge);assert.equal(resolveDisplaySelection({...base,face:{...face,signature:'gone'}},geometry),null);
 const duplicate={...geometry,edges:[edge,{...edge,id:'edge_13'}]};assert.equal(resolveDisplaySelection({...base,edge},duplicate),null);assert.equal(resolveDisplaySelection({...base,edge,geometryKey:'g1'},duplicate).edge,edge);
 assert.equal(resolveDisplaySelection({...base,edge,geometryKey:'old'},duplicate),null);
});
test('vertex labels use native vertex coordinates; vanished vertices do not highlight another point',()=>{
 const s={...base,vertex:{point:[1,0,0],edge,anchor:'end'}};assert.deepEqual(resolveDisplaySelection(s,geometry).vertex.point,[1,0,0]);assert.equal(resolveDisplaySelection({...s,vertex:{...s.vertex,point:[9,9,9]}},geometry),null);
});
test('midpoint display references resolve the guarded edge midpoint, not the native vertex array',()=>{
 const e={...edge,midpoint:[.5,3,0]},g={...geometry,edges:[e]},s={...base,geometryKey:'g1',vertex:{point:[.5,3,0],edge:e,anchor:'mid'}};
 assert.equal(entityName(s,g),'Midpoint · Edge 13');assert.deepEqual(resolveDisplaySelection(s,g).vertex.point,[.5,3,0]);
 assert.equal(resolveDisplaySelection(s,{...g,edges:[]}),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {initialOperation,applyPreset,operationCommand,operationFrame,operationPathLength,operationProblem,pathMeasure,trimDisplayPath} from '../frontend/src/operations/operationModel.ts';
import {SELECTION_COLOR,HOVER_COLOR} from '../frontend/src/viewportOperationDisplay.ts';
import {OPERATION_COLORS} from '../frontend/src/operations/operationRoles.ts';
const edge={signature:'e',type:'LINE',start:[0,0,0],end:[0,0,20],midpoint:[0,0,10],center:[0,0,10],tangent:[0,0,1],length:20};
const state={document:{components:{p:{id:'p',name:'Path'}},features:{},parameters:{}},geometry:{p:{center:[0,0,10]}},occurrences:[{id:'i',definition:'p',matrix:[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]}],parameter_graph:{}};
const draft=()=>applyPreset(initialOperation({definition:'p',occurrence:'i',edge},state),'sweep');
test('sweep defaults to 100 percent; distance and percent serialize as distinct parametric intent',()=>{
 const d=draft();assert.equal(pathMeasure(d),'percent');assert.equal(operationCommand(d).path_extent,'percent');assert.equal(operationFrame(d,state).travelPath.at(-1).z,20);
 d.pathMeasure='distance';d.values.distance='6';assert.equal(operationCommand(d).path_extent,'distance');assert.equal(operationFrame(d,state).travelPath.at(-1).z,6);
 d.pathMeasure='percent';d.values.path_percent='25';assert.equal(operationFrame(d,state).travelPath.at(-1).z,5);
});
test('percentage length and straight travel use native lengths and retain sign',()=>{
 const d=draft();d.motion='linear';d.pathMeasure='percent';d.values.path_percent='-25';assert.equal(operationPathLength(d,state),20);assert.equal(operationFrame(d,state).distance,-5);
 assert.equal(operationFrame(d,state).travelPath.at(-1).z,-5);d.reverse=true;assert.equal(operationFrame(d,state).travelPath.at(-1).z,5);
});
test('implicit paths cannot claim a total length; through and native finishes have no fractional extent',()=>{
 const d=initialOperation(null,state,'box');d.pathMeasure='percent';assert.match(operationProblem(d),/finite path/);d.extent='through';assert.equal(operationCommand(d).path_extent,'full');
 const finish=initialOperation({definition:'p',occurrence:'i',edge},state);assert.equal(operationCommand(finish).path_extent,'full');
});
test('display path trimming crosses chain corners without replacing them by chords',()=>{
 const points=[[0,0,0],[10,0,0],[10,20,0]].map(p=>new THREE.Vector3(...p));assert.deepEqual(trimDisplayPath(points,.5).map(p=>p.toArray()),[[0,0,0],[10,0,0],[10,5,0]]);
});
test('operation role colors remain separate from selection and hover',()=>{
 assert.equal(new Set(Object.values(OPERATION_COLORS)).size,3);for(const c of Object.values(OPERATION_COLORS))assert(![SELECTION_COLOR,HOVER_COLOR].includes(c));
});

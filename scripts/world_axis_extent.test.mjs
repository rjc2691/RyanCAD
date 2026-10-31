import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {worldAxisScales} from '../frontend/src/worldAxisExtent.ts';

test('world axes extend beyond all viewport edges across zoom, orbit, pan and aspect changes',()=>{
 for(const zoom of [.05,1,100])for(const aspect of [.4,1,3])for(const position of [[150,-220,165],[900,10,15],[-200,700,-80]]){
  const camera=new THREE.OrthographicCamera(-80*aspect,80*aspect,80,-80,.1,10000);
  camera.position.set(...position);camera.up.set(0,0,1);camera.lookAt(30,-15,20);camera.zoom=zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const scales=worldAxisScales(camera),origin=new THREE.Vector3().project(camera);
  scales.forEach((scale,index)=>{assert(Number.isFinite(scale)&&scale>0);for(const sign of [-1,1]){const point=new THREE.Vector3();point.setComponent(index,500*scale*sign);point.project(camera);assert(Math.max(Math.abs(point.x),Math.abs(point.y))>1);}});
 }
});
test('axis viewed directly end-on has no ambiguous line',()=>{
 const camera=new THREE.OrthographicCamera(-100,100,100,-100,.1,10000);camera.position.set(0,0,200);camera.lookAt(0,0,0);camera.updateMatrixWorld();assert.equal(worldAxisScales(camera)[2],0);
});

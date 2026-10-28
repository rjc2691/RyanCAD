import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {sketchPlaneBounds} from '../frontend/src/sketchGrid.ts';
import {worldSketchFrame,sketchBasis} from '../frontend/src/sketchModel.ts';
test('grid bounds contain all four viewport corners for oblique cameras and sketch planes',()=>{
 for(const planeName of ['XY','XZ','YZ']) for(const [x,y] of [[-50,25],[50,25],[30,-40],[-20,-40],[0,0]]){
  const frame=worldSketchFrame(planeName),f=sketchBasis(frame),camera=new THREE.OrthographicCamera(-80,80,45,-45,.1,1000);
  camera.up.copy(f.v);camera.position.copy(f.normal).multiplyScalar(100).addScaledVector(f.u,x).addScaledVector(f.v,y);camera.lookAt(f.origin);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const bounds=sketchPlaneBounds(camera,frame);assert(bounds);
  for(const u of [-1,1]) for(const v of [-1,1]) {const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(u,v),camera);const p=new THREE.Vector3();assert(ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(f.normal,f.origin),p));p.sub(f.origin);const pu=p.dot(f.u),pv=p.dot(f.v);assert(pu>=bounds.minU-1e-7 && pu<=bounds.maxU+1e-7);assert(pv>=bounds.minV-1e-7 && pv<=bounds.maxV+1e-7);}
 }
});

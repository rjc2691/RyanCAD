import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {projectedAxes} from '../frontend/src/viewOrientationModel.ts';
test('orientation axes follow inverse camera rotation and ignore camera position/zoom',()=>{
 const c=new THREE.PerspectiveCamera();c.up.set(0,0,1);c.position.set(150,-200,100);c.lookAt(0,0,0);c.updateMatrixWorld();
 const axes=projectedAxes(c.quaternion);for(let i=0;i<3;i++){const v=new THREE.Vector3(i===0?1:0,i===1?1:0,i===2?1:0).transformDirection(c.matrixWorldInverse);assert(axes[i].distanceTo(v)<1e-9);}
 c.position.multiplyScalar(3);c.zoom=4;assert(axes.every((p,i)=>p.distanceTo(projectedAxes(c.quaternion)[i])<1e-9));
});
test('front and right use their world horizontal axes; top looks along Z',()=>{
 for(const [position,axis] of [[[0,-10,.0001],0],[[10,0,.0001],1]]){
  const c=new THREE.PerspectiveCamera();c.up.set(0,0,1);c.position.set(...position);c.lookAt(0,0,0);c.updateMatrixWorld();const p=projectedAxes(c.quaternion)[axis];assert(p.x>.99);assert(Math.abs(p.y)<.01);
 }
 const c=new THREE.PerspectiveCamera();c.up.set(0,0,1);c.position.set(0,0,10);c.lookAt(0,0,0);const z=projectedAxes(c.quaternion)[2];assert(z.z>.99);assert(Math.hypot(z.x,z.y)<.01);
});

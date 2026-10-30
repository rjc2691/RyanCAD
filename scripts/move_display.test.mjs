import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {placeMoveDistance} from '../frontend/src/moveLabelPlacement.ts';
import {syncMovementGhost} from '../frontend/src/movementGhost.ts';
test('distance label avoids central geometry and remains inside the viewport',()=>{
 const rect=placeMoveDistance({x:400,y:300},[{x:260,y:180,width:280,height:240}],800,600);
 assert(rect.x>=10&&rect.y>=10&&rect.x+rect.width<=790&&rect.y+rect.height<=590);
 assert(rect.x+rect.width<=260||rect.x>=540||rect.y+rect.height<=180||rect.y>=420);
 assert.deepEqual(placeMoveDistance({x:400,y:300},[{x:260,y:180,width:280,height:240}],800,600,rect),rect);
});
test('ghost keeps committed placement, owns only material and excludes other parts',()=>{
 const parts=new THREE.Group(),ghost=new THREE.Group(),source=new THREE.Group(),other=new THREE.Group(),edges=new THREE.BufferGeometry();
 source.userData={occurrence:{id:'part/body',matrix:[[1,0,0,4],[0,1,0,5],[0,0,1,6],[0,0,0,1]]},asset:{edges}};
 source.position.set(90,90,90);other.userData={occurrence:{id:'other'}};parts.add(source,other);
 syncMovementGhost(ghost,parts,{occurrence:'part',definition:'part'});
 assert.equal(ghost.children.length,1);const line=ghost.children[0];assert.equal(line.geometry,edges);assert.deepEqual(line.matrix.elements.slice(12,15),[4,5,6]);assert.equal(line.material.depthTest,false);assert.equal(line.material.opacity,.32);
 const hits=[];line.raycast({},hits);assert.equal(hits.length,0);
 syncMovementGhost(ghost,parts,null);assert.equal(ghost.children.length,0);assert.equal(ghost.visible,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {sketchOrbitOffset} from '../frontend/src/sketchOrbit.ts';
import {worldSketchFrame,sketchBasis} from '../frontend/src/sketchModel.ts';
test('sketch orbit stays on the front of all sketch planes and preserves distance',()=>{
 for(const plane of ['XY','XZ','YZ']) {const f=worldSketchFrame(plane),n=sketchBasis(f).normal;const offset=sketchOrbitOffset(n.clone().multiplyScalar(50),f,100,80);assert(Math.abs(offset.length()-50)<1e-8);assert(offset.clone().normalize().dot(n)>=Math.cos(70*Math.PI/180)-1e-9);}
});
test('orbit approaches the boundary smoothly and can reverse',()=>{
 const f=worldSketchFrame('XY'),n=sketchBasis(f).normal,initial=n.clone().multiplyScalar(50);
 const angle=t=>Math.acos(sketchOrbitOffset(initial,f,t,0).normalize().dot(n));
 assert(angle(2)-angle(1)<angle(1)-angle(0));assert(angle(5)-angle(4)<angle(2)-angle(1));
 const tilted=sketchOrbitOffset(initial,f,2,0), reversed=sketchOrbitOffset(tilted,f,-1,0);
 assert(reversed.clone().normalize().dot(n)>tilted.clone().normalize().dot(n));
});

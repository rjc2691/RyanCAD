import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {normalizeExperiments,defaultAppearance,loadExperiments,saveExperiments,EXPERIMENT_STORAGE_KEY} from '../frontend/src/experiments.ts';
import {applyActiveAppearance} from '../frontend/src/activeAppearance.ts';
test('experimental settings have stable IDs, default off, validate persisted values and tolerate unavailable storage',()=>{
 assert.deepEqual(normalizeExperiments(null)['active-component-appearance'],defaultAppearance());
 assert.deepEqual(normalizeExperiments({version:99})['active-component-appearance'],defaultAppearance());
 const original=globalThis.localStorage;
 try{
  const values=new Map();globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const setting=normalizeExperiments({version:1,'active-component-appearance':{enabled:true,style:'rim-glow',strength:12,tint:'#bbaa11'}});
  assert.equal(setting['active-component-appearance'].strength,1);saveExperiments(setting);assert(values.has(EXPERIMENT_STORAGE_KEY));assert.deepEqual(loadExperiments(),setting);
  values.set(EXPERIMENT_STORAGE_KEY,'{broken');assert(!loadExperiments()['active-component-appearance'].enabled);
  globalThis.localStorage={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}};
  assert(!loadExperiments()['active-component-appearance'].enabled);assert.doesNotThrow(()=>saveExperiments(setting));
 }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
 const invalid=normalizeExperiments({version:1,'active-component-appearance':{enabled:'yes',style:'retired',strength:NaN,tint:'url(unsafe)'}});
 assert.deepEqual(invalid['active-component-appearance'],defaultAppearance());
});
test('shading uses live uniforms without replacing geometry or the standard material and can be disabled',()=>{
 const geometry=new THREE.BoxGeometry(10,20,30),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);
 applyActiveAppearance(mesh,true,defaultAppearance());assert.equal(material.userData.activeAppearance,undefined);
 const settings={...defaultAppearance(),enabled:true};applyActiveAppearance(mesh,true,settings);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader,{});
 assert(shader.fragmentShader.includes('totalEmissiveRadiance += cadActiveTint'));
 assert(shader.vertexShader.includes('vCadActiveHeight = position.z'));
 const uniforms=material.userData.activeAppearance;assert.equal(shader.uniforms.cadActiveMode,uniforms.cadActiveMode);assert.equal(uniforms.cadActiveMode.value,1);
 applyActiveAppearance(mesh,true,{...settings,style:'height-gradient',strength:.9});assert.equal(uniforms.cadActiveMode.value,3);assert.equal(uniforms.cadActiveStrength.value,.9);
 applyActiveAppearance(mesh,false,settings);assert.equal(uniforms.cadActiveMode.value,0);
 assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(uniforms.cadActiveSpanZ.value,30);
 geometry.dispose();material.dispose();
});

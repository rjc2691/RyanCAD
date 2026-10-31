import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import {normalizeExperiments,defaultAppearance,loadExperiments,saveExperiments,EXPERIMENT_STORAGE_KEY} from '../frontend/src/experiments.ts';
import {syncActiveEdgePulse,edgePulseProgress,updateEdgePulseTime} from '../frontend/src/activeAppearance.ts';
test('experimental settings have stable IDs, default off, validate persisted values and tolerate unavailable storage',()=>{
 assert(!('sidebar-toolbar-layout' in normalizeExperiments(null)));
 assert(!('sidebar-toolbar-layout' in normalizeExperiments({version:1,'sidebar-toolbar-layout':{enabled:true,mode:'inset-buttons'}})));
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
test('edge pulse coordinates use distance along each complete native edge',()=>{
 const positions=[0,0,0,1,0,0,1,0,0,10,0,0,0,0,0,0,4,0];
 const p=edgePulseProgress(positions,[{segment_start:0,segment_count:2},{segment_start:2,segment_count:1}]);
 assert(Math.abs(p.start[1]-.1)<1e-6);assert(Math.abs(p.end[0]-.1)<1e-6);assert.equal(p.end[1],1);assert.equal(p.start[2],0);assert.equal(p.end[2],1);
});

test('pulse settings migrate old surface styles and validate animation controls',()=>{
 const old=normalizeExperiments({version:1,'active-component-appearance':{enabled:true,style:'rim-glow',tint:'#aa55ff',strength:.7}})['active-component-appearance'];
 assert.equal(old.enabled,true);assert.equal(old.tint,'#aa55ff');assert.equal(old.speed,.16);assert.equal(old.pulses,3);assert(!('style' in old));
 const invalid=normalizeExperiments({version:1,'active-component-appearance':{speed:-2,pulses:99}})['active-component-appearance'];assert.equal(invalid.speed,.02);assert.equal(invalid.pulses,6);
});

test('edge animation owns its buffers, shares a clock and changes uniforms without rebuilding',()=>{
 const source=new THREE.EdgesGeometry(new THREE.BoxGeometry(10,20,30)),group=new THREE.Group(),other=new THREE.Group();
 syncActiveEdgePulse(group,source,[],true,defaultAppearance());assert.equal(group.userData.edgePulseLayer,undefined);
 const settings={...defaultAppearance(),enabled:true};syncActiveEdgePulse(group,source,[],true,settings);syncActiveEdgePulse(other,source,[],true,settings);
 const pulse=group.userData.edgePulseLayer,stroke=pulse.children[1],material=stroke.material;
 assert.equal(pulse.children.length,2);assert.notEqual(stroke.geometry,source);assert(material.depthTest);assert(!material.depthWrite);
 assert.equal(material.uniforms.cadPulseTime,other.userData.edgePulseLayer.children[1].material.uniforms.cadPulseTime);
 updateEdgePulseTime(12);assert.equal(material.uniforms.cadPulseTime.value,12);
 const clip=[new THREE.Plane(new THREE.Vector3(0,0,1),-2)];syncActiveEdgePulse(group,source,[],true,{...settings,speed:.4,pulses:5,tint:'#aa55ff'},clip);
 assert.equal(group.userData.edgePulseLayer,pulse);assert.equal(stroke.material,material);assert.equal(material.uniforms.cadPulseSpeed.value,.4);assert.equal(material.uniforms.cadPulseCount.value,5);assert.equal(material.color.getHexString(),'aa55ff');assert.equal(material.clippingPlanes,clip);
 syncActiveEdgePulse(group,source,[],false,settings);assert.equal(pulse.visible,false);
 syncActiveEdgePulse(group,source,[],true,{...settings,enabled:false});assert.equal(pulse.visible,false);
});


test('dark palette validates saved choices independently of active appearance',()=>{
 assert.deepEqual(normalizeExperiments(null)['dark-ui-palette'],{enabled:false,theme:'midnight'});
 const settings=normalizeExperiments({version:1,'dark-ui-palette':{enabled:true,theme:'forest'}});
 assert.equal(settings['dark-ui-palette'].theme,'forest');assert(!settings['active-component-appearance'].enabled);
 assert.deepEqual(normalizeExperiments({version:1,'dark-ui-palette':{enabled:'yes',theme:'invalid'}})['dark-ui-palette'],{enabled:false,theme:'midnight'});
});

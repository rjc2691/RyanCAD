import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const pixels=async()=>{await page.waitForTimeout(100);return page.locator('.canvas-host canvas').evaluate(c=>c.toDataURL());};
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await page.evaluate(async()=>{
  const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};
  const s=await(await fetch('/api/state',{headers})).json();
  const args={name:'Hover sketch',plane:'XY',entities:[{id:'a',type:'line',x1:0,y1:0,x2:30,y2:0},{id:'b',type:'line',x1:30,y1:0,x2:30,y2:20},{id:'c',type:'line',x1:30,y1:20,x2:0,y2:20},{id:'d',type:'line',x1:0,y1:20,x2:0,y2:0}]};
  const sub=await(await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({name:'sketch.create',args,expected_revision:s.document.revision})})).json();
  for(let i=0;i<600;i++){const j=await(await fetch('/api/jobs/'+sub.job_id,{headers})).json();if(j.status==='complete')return;if(j.status==='failed')throw Error(JSON.stringify(j.error));await new Promise(r=>setTimeout(r,50));}
 });
 await page.locator('.sketch-tree-name').filter({hasText:'Hover sketch'}).waitFor();await page.reload();await page.locator('.sketch-tree-name').filter({hasText:'Hover sketch'}).waitFor();await page.waitForTimeout(200);
 await page.getByRole('button',{name:/Fit design/}).click();await page.waitForTimeout(250);
 const rect=await page.locator('.canvas-host').boundingBox(),center=new THREE.Vector3(15,10,0),camera=new THREE.OrthographicCamera(-100,100,80,-80,.1,10000);camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(1.4,-1.9,1.35).normalize().multiplyScalar(90));camera.lookAt(center);camera.updateMatrixWorld();
 const bounds=new THREE.Box3();for(const x of [0,30])for(const y of [0,20])bounds.expandByPoint(new THREE.Vector3(x,y,0).applyMatrix4(camera.matrixWorldInverse));
 const size=bounds.getSize(new THREE.Vector3()),aspect=rect.width/rect.height,h=Math.max(size.y,size.x/aspect,10)*.72;camera.left=-h*aspect;camera.right=h*aspect;camera.top=h;camera.bottom=-h;camera.updateProjectionMatrix();
 const p=new THREE.Vector3(15,0,0).project(camera),target=[rect.x+(p.x+1)*rect.width/2,rect.y+(1-p.y)*rect.height/2],empty=[rect.x+20,rect.y+rect.height-100];
 await page.mouse.move(...empty);const baseline=await pixels();await page.mouse.move(...target);await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.hoverKind==='sketch');
 assert(await page.getByRole('tooltip',{name:'Click target'}).getByText('Sketch · Hover sketch',{exact:true}).isVisible());assert.notEqual(await pixels(),baseline);assert.equal(await page.locator('.canvas-host canvas').evaluate(c=>c.style.cursor),'pointer');
 await page.screenshot({path:'artifacts/sketch-hover.png'});
 await page.mouse.move(...empty);assert.equal(await pixels(),baseline,'leaving restores ordinary sketch appearance');
 await page.mouse.click(...target);await page.mouse.move(...empty);const selected=await pixels();assert.notEqual(selected,baseline);
 await page.mouse.move(...target);assert.notEqual(await pixels(),selected,'selected sketches also show distinct hover');await page.mouse.move(...empty);assert.equal(await pixels(),selected,'blue selection survives hover');
 await page.getByRole('button',{name:'Hide sketch Hover sketch',exact:true}).click();assert.equal(await page.locator('.canvas-host').getAttribute('data-hover-kind'),null);
 assert.deepEqual(errors,[]);console.log('Passed: visible cyan hover, named tooltip and pointer, restored ordinary/blue selected appearance, hidden-sketch cleanup; no JS errors.');
}catch(e){await page.screenshot({path:'.cache/sketch-hover/failure.png'});throw e;}finally{await browser.close();}

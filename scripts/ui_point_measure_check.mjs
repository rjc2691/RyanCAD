import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1050}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>fetch('/api/state',{headers:{'X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')}}).then(r=>r.json()));
const panel=page.getByRole('complementary',{name:'Measure workspace'}),button=page.getByRole('button',{name:'Measure',exact:true});
const coords=async i=>panel.locator('.measure-point').nth(i).locator('.measure-coordinates b').allTextContents().then(v=>v.map(Number));
const click=async p=>{await page.mouse.click(...p);await page.waitForTimeout(120);};
const near=(actual,expected)=>actual.forEach((v,i)=>assert(Math.abs(v-expected[i])<.01,`${actual} expected ${expected}`));
async function project(state,id,point){
  const rect=await page.locator('.canvas-host').boundingBox(),box=new THREE.Box3();
  const matrix=o=>new THREE.Matrix4().set(...o.matrix.flat());
  for(const o of state.occurrences.filter(o=>o.visible&&!o.suppressed&&state.geometry[o.definition]?.bounds)){
    const b=state.geometry[o.definition].bounds,m=matrix(o);
    for(const x of [b.min[0],b.max[0]])for(const y of [b.min[1],b.max[1]])for(const z of [b.min[2],b.max[2]])box.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(m));
  }
  const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),distance=Math.max(size.x,size.y,size.z,10);
  const camera=new THREE.OrthographicCamera(-100,100,80,-80,.1,10000);camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(1.4,-1.9,1.35).normalize().multiplyScalar(distance*3));camera.lookAt(center);camera.updateMatrixWorld();
  const projected=new THREE.Box3();for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  const psize=projected.getSize(new THREE.Vector3()),aspect=rect.width/rect.height,half=Math.max(psize.y,psize.x/aspect,10)*.72;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
  const o=state.occurrences.find(o=>o.id===id),p=new THREE.Vector3(...point).applyMatrix4(matrix(o)).project(camera);
  return [rect.x+(p.x+1)*rect.width/2,rect.y+(1-p.y)*rect.height/2];
}
try{
 await fs.mkdir('.cache/measure-ui',{recursive:true});
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await page.evaluate(async()=>{
  const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};
  const s=await(await fetch('/api/state',{headers})).json();
  const r=await(await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({name:'feature.create',expected_revision:s.document.revision,args:{type:'box',name:'Measurement fixture',values:{length:30,width:20,height:18,x:12,y:5}}})})).json();
  for(let i=0;i<600;i++){const j=await(await fetch('/api/jobs/'+r.job_id,{headers})).json();if(j.status==='complete')return;if(j.status==='failed')throw Error(JSON.stringify(j.error));await new Promise(r=>setTimeout(r,50));}throw Error('timeout');
 });
 await page.locator('.component-select').first().waitFor();await page.reload();await page.locator('.component-select').first().waitFor();await page.waitForTimeout(500);
 const state=await read(),before=JSON.stringify(state.document),o=state.occurrences.find(o=>o.kind==='solid'),g=state.geometry[o.definition],b=g.bounds;
 await button.click();await panel.waitFor();assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('button',{name:/Fit design/}).click();await page.waitForTimeout(300);
 const a=[b.min[0],b.min[1],b.max[2]],z=[b.max[0],b.min[1],b.max[2]];
 const world=p=>new THREE.Vector3(...p).applyMatrix4(new THREE.Matrix4().set(...o.matrix.flat())).toArray();
 const ap=await project(state,o.id,a),bp=await project(state,o.id,z);
 await click(ap);await click(bp);assert.equal(await panel.locator('.measure-point').count(),2);near(await coords(0),world(a));near(await coords(1),world(z));
 assert.equal((await panel.locator('.measure-distance').textContent()).trim(),'30 mm');assert.equal(await page.locator('.measure-viewport-guide [data-point]').count(),2);
 await page.keyboard.down('Shift');await click(await project(state,o.id,[b.max[0],b.max[1],b.max[2]]));await page.keyboard.up('Shift');assert.equal(await panel.locator('.measure-point').count(),3);assert(await panel.getByText('Total chain length',{exact:true}).isVisible());
 await page.keyboard.down('Shift');await click(bp);await page.keyboard.up('Shift');assert.equal(await panel.locator('.measure-point').count(),2);
 await panel.getByRole('button',{name:'Clear points'}).click();
 const edge=[b.min[0]+7,b.min[1],b.max[2]],face=[b.max[0]-8,b.min[1],b.min[2]+5];
 await click(await project(state,o.id,edge));near(await coords(0),world(edge));assert(await panel.getByText('Edge length',{exact:true}).isVisible());
 await click(await project(state,o.id,face));near(await coords(1),world(face));assert(await panel.getByText('Face area',{exact:true}).isVisible());
 await panel.getByRole('button',{name:'Replace point A'}).click();await click(ap);near(await coords(0),world(a));assert.equal(await panel.locator('.measure-point').count(),2);
 await panel.getByRole('button',{name:'Replace point A'}).hover();await page.waitForTimeout(250);assert.equal(await page.locator('.canvas-host').getAttribute('data-hover-source'),'panel');
 await page.screenshot({path:'artifacts/point-measure-sidebar.png'});
 await click(ap);assert.equal(await panel.locator('.measure-point').count(),1,'plain third click starts a fresh pair');
 await panel.getByRole('button',{name:'Clear points'}).click();
 const midpoint=[(b.min[0]+b.max[0])/2,b.min[1],b.max[2]];
 await click(await project(state,o.id,midpoint));near(await coords(0),world(midpoint));assert(await panel.getByText(/Midpoint/).isVisible());
 await click(await project(state,o.id,midpoint));assert.equal((await panel.locator('.measure-distance').textContent()).trim(),'0 mm');assert(await panel.getByText('Undefined · coincident points',{exact:true}).isVisible());
 await panel.getByRole('button',{name:'Clear points'}).click();
 await page.getByRole('button',{name:'Use world origin',exact:true}).click();near(await coords(0),[0,0,0]);
 await panel.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await panel.count(),0);
 await button.click();await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
 assert.equal(JSON.stringify((await read()).document),before,'measure creates no document/history edits');
 await page.setViewportSize({width:390,height:844});await button.click();await panel.waitFor();const bounds=await panel.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);assert(await panel.getByRole('button',{name:'Done',exact:true}).isVisible());
 await page.screenshot({path:'artifacts/point-measure-mobile.png'});
 assert.deepEqual(errors,[]);console.log('Passed: nonmodal sidebar, exact vertices, shift chain/toggle, edge/face click coordinates, replacement, reference hover, world origin, Done/Escape, unchanged document, mobile bounds; no JS errors.');
}catch(e){await page.screenshot({path:'.cache/measure-ui/failure.png'});throw e;}finally{await browser.close();}

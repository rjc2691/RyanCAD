import {operationSize} from './ui_operation_setup.mjs';
// Human keyboard and path-reference regression. Use an EMPTY ISOLATED project.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:980}});
const errors=[],checks=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const read=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
const panel=page.getByRole('complementary',{name:'Tool operation workspace'});
const tool=async()=>{await page.locator('button[aria-label="Tool operation"]').click();await panel.waitFor();};
const stage=label=>panel.locator(`[data-tool-section="${({Origin:'origin',Profile:'profile','Travel & rotation':'path',Result:'effect'})[label]}"]`).scrollIntoViewIfNeeded();
const ready=async()=>{await page.locator('.operation-preview-status').filter({hasText:'Preview validated'}).waitFor({timeout:45000});await page.waitForFunction(()=>!document.querySelector('.operation-commit-row .primary')?.disabled);};
async function settled(){await panel.waitFor({state:'hidden',timeout:45000});await page.locator('.job-card').waitFor({state:'hidden'});const s=await read();await page.locator(`.canvas-host[data-ready-revision="${s.document.revision}"]`).waitFor();return s;}
async function topFace(){await page.getByRole('button',{name:'Top',exact:true}).click();const r=await page.locator('.canvas-host').boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2);await page.keyboard.press('t');await panel.waitFor();}
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
  await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8794');await page.locator('.structure-root').waitFor();let state=await read();const base=state.document.revision;
  assert.equal(Object.keys(state.document.features).length,0,'Use an empty isolated test project.');await fs.mkdir('artifacts',{recursive:true});
  await tool();await panel.getByLabel('Profile width',{exact:true}).fill('40');await panel.getByLabel('Profile height',{exact:true}).fill('30');await stage('Travel & rotation');
  await panel.getByLabel('Path distance',{exact:true}).fill('6');await panel.getByLabel('Path distance',{exact:true}).press('Enter');
  state=await settled();const part=Object.keys(state.geometry)[0],occ=state.occurrences.find(o=>o.definition===part);
  assert.equal(state.document.revision,base+1);assert(Math.abs(state.geometry[part].volume-7200)<1e-5);checks.push('Enter in a dock field waits for the newest visible preview and commits exactly once');

  await topFace();await stage('Result');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('cut');await stage('Travel & rotation');
  assert.equal(await panel.getByRole('checkbox',{name:'Reverse reference direction'}).isChecked(),false);
  await panel.getByLabel('Path distance',{exact:true}).fill('-2');await ready();await page.getByRole('button',{name:'ISO',exact:true}).click();
  assert.equal(await page.locator('.operation-guide').getAttribute('data-path-style'),'implicit');assert.match(await page.getByRole('note',{name:'Tool Path reference'}).innerText(),/Face normal/);
  await page.screenshot({path:'artifacts/operation-negative-cut-preview.png'});
  await operationSize(panel).fill('-1.5');await operationSize(panel).press('Enter');state=await settled();
  assert.equal(state.document.revision,base+2);assert(Math.abs(state.geometry[part].volume-40*30*4.5)<1e-5);checks.push('Remove result preserves direction; a negative face extrusion cuts inward; Enter works in the Tool Path input');

  await topFace();await stage('Result');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('cut');await stage('Travel & rotation');await panel.getByLabel('Path distance',{exact:true}).fill('2');
  await page.locator('.operation-preview-status.invalid').waitFor();await panel.getByLabel('Path distance',{exact:true}).press('Enter');assert.equal((await read()).document.revision,base+2);
  await panel.getByLabel('Path distance',{exact:true}).press('Escape');await panel.waitFor({state:'hidden'});checks.push('Enter cannot commit invalid geometry; Escape cancels from an input');

  await page.getByRole('button',{name:'ISO',exact:true}).click();await page.getByRole('button',{name:'Fit design · F',exact:true}).click();
  const edge=state.geometry[part].edges.find(e=>e.type==='LINE'&&Math.abs(e.tangent[0])>.99&&Math.abs(e.center[1]+15)<1e-5&&Math.abs(e.center[2]-4.5)<1e-5);assert(edge);
  await page.mouse.click(...await project(state,occ.id,edge.midpoint));await page.keyboard.press('t');await panel.waitFor();await ready();
  assert.equal(await page.locator('.operation-guide').getAttribute('data-path-style'),'direct');assert.match(await page.getByRole('note',{name:'Tool Path reference'}).innerText(),/highlighted edge/);
  await page.screenshot({path:'artifacts/operation-direct-path.png'});
  await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('circle').then(()=>panel.locator('[data-tool-section="path"]').getByLabel('Tool Path Type',{exact:true}).selectOption('sweep'));await stage('Result');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('new');await stage('Origin');await panel.getByLabel('Along U',{exact:true}).fill('5');await ready();
  assert.equal(await page.locator('.operation-guide').getAttribute('data-path-style'),'parallel');assert.notEqual(await page.locator('[data-guide="offset"]').getAttribute('d'),'');await page.screenshot({path:'artifacts/operation-parallel-path.png'});
  await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.equal((await read()).document.revision,base+2);checks.push('Direct reference edge, translated parallel travel and implicit normal have distinct labeled styles');

  await tool();await panel.getByRole('button',{name:'Tool Path reference',exact:false}).click();await page.locator('.operation-pick-prompt').waitFor();await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
  await tool();await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('polygon');await page.locator('.operation-pick-prompt').waitFor();await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
  assert.equal((await read()).document.revision,base+2);checks.push('One Escape cancels during reference picking or inline profile drawing, without a revision');

  await page.route('**/api/previews',async route=>{await new Promise(r=>setTimeout(r,200));await route.continue();});
  await tool();await operationSize(panel).fill('1.1');await operationSize(panel).press('Enter');await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});await page.waitForTimeout(700);assert.equal((await read()).document.revision,base+2);
  await tool();await operationSize(panel).fill('1.1');await operationSize(panel).press('Enter');await operationSize(panel).fill('1.2');await ready();assert.equal((await read()).document.revision,base+2);await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
  checks.push('Escape cancels a queued Enter; editing after Enter clears the earlier confirmation intent');
  await page.unroute('**/api/previews');

  await topFace();await operationSize(panel).fill('1');await operationSize(panel).press('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');state=await settled();
  assert.equal(state.document.revision,base+3);checks.push('Repeated confirmation never creates duplicate actions');
  assert.deepEqual(errors,[]);const report={checks,errors,revision:state.document.revision};await fs.writeFile('artifacts/operation-controls-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:'artifacts/operation-controls-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}

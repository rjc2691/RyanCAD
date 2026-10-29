import {setupOperation,operationSize} from './ui_operation_setup.mjs';
// Isolated empty project only. Exercises human operation setup through the UI.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[],checks=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const read=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
const panel=page.getByRole('complementary',{name:'Tool operation workspace'});
const ready=async()=>{await page.locator('.operation-preview-status').filter({hasText:'Preview validated'}).waitFor({timeout:45000});await page.waitForFunction(()=>!document.querySelector('.operation-commit-row .primary')?.disabled);};
const stage=label=>panel.locator(`[data-tool-section="${({Origin:'origin',Profile:'profile','Travel & rotation':'path',Result:'effect'})[label]}"]`).scrollIntoViewIfNeeded();
const preset=label=>setupOperation(page,panel,label);
async function apply(){await ready();await panel.getByRole('button',{name:'Apply operation',exact:true}).click();await panel.waitFor({state:'hidden'});await page.locator('.job-card').waitFor({state:'hidden'});const state=await read();await page.locator(`.canvas-host[data-ready-revision="${state.document.revision}"]`).waitFor();return state;}
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
  await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8793');await page.locator('.structure-root').waitFor();
  assert.equal(Object.keys((await read()).document.features).length,0,'Use an empty isolated test project.');
  const base=(await read()).document.revision;
  await fs.mkdir('artifacts',{recursive:true});
  await page.getByRole('button',{name:'Tool operation',exact:true}).click();await panel.waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  await panel.getByLabel('Profile width',{exact:true}).fill('80');await panel.getByLabel('Profile height',{exact:true}).fill('40');
  await stage('Travel & rotation');await panel.getByLabel('Path distance',{exact:true}).fill('6');
  await stage('Result');await panel.getByLabel('Feature Name',{exact:true}).fill('Mounting plate');await ready();
  assert.equal((await read()).document.revision,base);
  await page.screenshot({path:'artifacts/operation-new-part-preview.png'});
  let state=await apply(),part=Object.values(state.document.components).find(c=>c.name==='Mounting plate'),occ=state.occurrences.find(o=>o.definition===part.id);
  assert(Math.abs(state.geometry[part.id].volume-80*40*6)<1e-6);assert.equal(state.document.revision,base+1);
  checks.push('One Tool button; visible viewport; automatic preview; one atomic saved operation');

  await page.getByRole('button',{name:'Top',exact:true}).click();
  let canvas=await page.locator('.canvas-host').boundingBox();await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
  await page.keyboard.press('t');await panel.waitFor();await ready();
  await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('circle').then(()=>panel.getByRole('button',{name:/^Hole setup/}).click());await page.locator('.operation-pick-prompt').filter({hasText:'Place on the face'}).waitFor();
  canvas=await page.locator('.canvas-host').boundingBox();await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
  await operationSize(panel).fill('6');await ready();
  assert.equal((await read()).document.revision,base+1);
  await page.screenshot({path:'artifacts/operation-hole-preview.png'});
  state=await apply();assert(Math.abs(state.geometry[part.id].volume-(19200-Math.PI*9*6))<1e-5);
  assert.equal(state.document.revision,base+2);checks.push('Face + T → hole; exact on-plane placement and panel diameter; original target retained');

  await page.getByRole('button',{name:'ISO',exact:true}).click();
  const edge=state.geometry[part.id].edges.find(e=>e.type==='LINE'&&Math.abs(e.tangent[0])>.99&&Math.abs(e.center[1]+20)<1e-5&&Math.abs(e.center[2]-6)<1e-5);
  assert(edge);await page.mouse.click(...await project(state,occ.id,edge.midpoint));await page.keyboard.press('t');await panel.waitFor();
  await operationSize(panel).fill('1');await ready();
  await operationSize(panel).fill('100');await page.locator('.operation-preview-status.invalid').waitFor();
  assert.equal(await panel.getByRole('button',{name:'Apply operation'}).isEnabled(),false);assert.equal((await read()).document.revision,base+2);
  await operationSize(panel).fill('1');await ready();
  await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('chamfer');await ready();
  await page.screenshot({path:'artifacts/operation-edge-finish-preview.png'});
  checks.push('Edge + T; panel finish size; round↔bevel without leaving; invalid sizes cannot apply');

  await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('polygon');
  await panel.getByRole('button',{name:'Look straight at Tool Profile plane',exact:true}).click();
  canvas=await page.locator('.canvas-host').boundingBox();const cx=canvas.x+canvas.width/2,cy=canvas.y+canvas.height/2;
  await page.mouse.click(cx,cy);await page.mouse.click(cx+16,cy);await page.mouse.click(cx,cy+16);
  for(const [i,point]of [[1,[0,0]],[2,[2,0]],[3,[0,-Math.sign(edge.tangent[0])*2]]])for(const [j,axis]of ['U','V'].entries())await panel.getByLabel(`Point ${i} ${axis}`,{exact:true}).fill(String(point[j]));
  await panel.getByRole('button',{name:'Close profile',exact:true}).click();await stage('Result');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('cut');await panel.getByLabel('Feature Name',{exact:true}).fill('Custom edge section');await ready();
  assert.equal(await page.getByRole('dialog').count(),0);await page.screenshot({path:'artifacts/operation-custom-sweep-preview.png'});
  const before=state.geometry[part.id].volume;state=await apply();assert(state.geometry[part.id].volume<before);assert.equal(state.document.revision,base+3);
  checks.push('Round/bevel → custom polygon on perpendicular plane → swept subtraction, with the same origin/path');

  await page.getByRole('button',{name:'Tool operation',exact:true}).click();await preset('Helical sweep');
  await stage('Result');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('new');await panel.getByLabel('Feature Name',{exact:true}).fill('Spring study');
  await stage('Travel & rotation');await panel.getByLabel('Axial rise',{exact:true}).fill('20');await panel.getByLabel('Rotation angle',{exact:true}).fill('720');await operationSize(panel).fill('2');await ready();
  await page.screenshot({path:'artifacts/operation-helix-preview.png'});
  state=await apply();const spring=Object.values(state.document.components).find(c=>c.name==='Spring study');assert(spring);assert.equal(state.occurrences.length,2);assert(state.geometry[spring.id].volume>300);
  checks.push('Combined rotation and travel creates a native helical solid as its own component');

  await page.getByRole('button',{name:'Tool operation',exact:true}).click();await preset('Body Boolean');await stage('Profile');
  await panel.getByRole('button',{name:'Tool Profile reference',exact:false}).click();await page.locator('.component-select').filter({hasText:'Mounting plate'}).click();
  await stage('Result');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('cut');
  await page.locator('.operation-preview-status.invalid').waitFor();assert.equal(await panel.getByRole('button',{name:'Apply operation'}).isEnabled(),false);
  await stage('Result');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('intersect');await ready();
  const springBefore=state.geometry[spring.id].volume;state=await apply();assert(state.geometry[spring.id].volume<springBefore);
  assert.equal(state.document.features[state.document.feature_order.at(-1)].owner,spring.id);
  checks.push('Placed body Boolean retains target ownership; disconnected cut is rejected; intersection applies');

  await page.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('.job-card').waitFor({state:'hidden'});
  await page.reload();await page.locator('.component-select').first().waitFor();state=await read();assert.equal(state.occurrences.length,2);assert(Math.abs(state.geometry[spring.id].volume-springBefore)<1e-5);
  assert.deepEqual(errors,[]);checks.push('Authored history, undo, and native reload preserve the unified operations');
  const savedRevision=state.document.revision;
  for(const [width,height] of [[1280,800],[1100,760]]){
    await page.setViewportSize({width,height});await page.getByRole('button',{name:'Tool operation',exact:true}).click();await panel.waitFor();await preset('Box');await ready();
    const dock=await panel.boundingBox(),view=await page.locator('.canvas-host').boundingBox();
    assert(view.width>=340);assert(view.x+view.width<=dock.x+1);assert(dock.x+dock.width<=width+1);assert(dock.y+dock.height<=height+1);
    assert(await panel.getByRole('button',{name:'Apply operation'}).isVisible());assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.getByRole('slider',{name:'Exploded display'}).isEnabled(),false);
    assert.equal(await page.getByRole('button',{name:'Export',exact:true}).isEnabled(),false);
    await page.screenshot({path:`artifacts/operation-workspace-${width}.png`});await panel.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal((await read()).document.revision,savedRevision);
  }
  checks.push('1280/1100 px windows retain a visible viewport, dock and Apply; cancel preserves revision; preview export/explode guarded');
  const report={checks,errors,revision:state.document.revision};await fs.writeFile('artifacts/operation-ui-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:'artifacts/operation-ui-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}

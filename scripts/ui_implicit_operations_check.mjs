import {operationSize} from './ui_operation_setup.mjs';
// Requires an empty isolated project. Human picks drive operation inference.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:980}});
const errors=[],checks=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/previews'))requests.push(r.postDataJSON())});
const panel=page.getByRole('complementary',{name:'Tool operation workspace'});
const ready=async()=>{await page.locator('.operation-preview-status').filter({hasText:'Preview validated'}).waitFor({timeout:45000});await page.waitForFunction(()=>!document.querySelector('.operation-commit-row .primary')?.disabled);};
const stage=label=>panel.locator(`[data-tool-section="${({Origin:'origin',Profile:'profile','Travel & rotation':'path',Result:'effect'})[label]}"]`).scrollIntoViewIfNeeded();
const read=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
const auto=()=>page.getByRole('note',{name:'Automatic Tool Effect'});
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
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8797');await page.locator('.structure-root').waitFor();const base=(await read()).document.revision;assert.equal(Object.keys((await read()).document.features).length,0);
 await page.locator('button[aria-label="Tool operation"]').click();await panel.getByLabel('Profile width',{exact:true}).fill('60');await panel.getByLabel('Profile height',{exact:true}).fill('40');await stage('Travel & rotation');await panel.getByLabel('Path distance',{exact:true}).fill('6');await ready();await panel.getByRole('button',{name:'Apply operation',exact:true}).click();await panel.waitFor({state:'hidden'});
 let state=await read();const part=Object.keys(state.geometry)[0],occ=state.occurrences.find(o=>o.definition===part);await page.locator(`.canvas-host[data-ready-revision="${state.document.revision}"]`).waitFor();
 await topFace();await ready();assert.equal(await auto().getAttribute('data-mode'),'add');
 await operationSize(panel).fill('-2');await ready();assert.equal(await auto().getAttribute('data-mode'),'cut');
 await page.getByRole('button',{name:'ISO',exact:true}).click();await page.screenshot({path:'artifacts/implicit-auto-cut.png'});
 await operationSize(panel).fill('2');await ready();assert.equal(await auto().getAttribute('data-mode'),'add');
 const beforeCache=requests.length;await operationSize(panel).fill('-2');await ready();assert.equal(requests.length,beforeCache);checks.push('Auto switches Add/Remove with exact tool overlap; revisiting a validated draft reuses its candidate');
 await stage('Result');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('add');await page.locator('.operation-preview-status.invalid').waitFor();assert.equal(await auto().count(),0);
 await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('auto');await ready();assert.equal(await auto().getAttribute('data-mode'),'cut');checks.push('Manual result pins intent; Auto can be restored without leaving the operation');

 await page.route('**/api/previews',async route=>{await new Promise(r=>setTimeout(r,300));await route.continue();});
 await operationSize(panel).fill('-1.5');await page.locator('.operation-stale-note').waitFor();assert.equal(await panel.getByRole('button',{name:'Apply operation'}).isEnabled(),false);await page.screenshot({path:'artifacts/implicit-stale-preview.png'});await ready();await page.unroute('**/api/previews');checks.push('Previous native preview stays visible and marked stale; it cannot be committed while a replacement is pending');

 await page.getByRole('button',{name:'ISO',exact:true}).click();
 const front=state.geometry[part].faces.find(f=>f.type==='PLANE'&&f.normal[1]<-.99);assert(front);
 await page.mouse.click(...await project(state,occ.id,front.center));await ready();assert.equal(requests.at(-1).args.profile_reference.face,front.signature);assert.equal(requests.at(-1).args.reference.face,front.signature);assert.equal(requests.at(-1).args.target,part);assert.equal(requests.at(-1).args.values.distance,'-1.5');checks.push('A face click replaces profile and inferred origin while Result is open, preserving target and dimensions');

 const long=state.geometry[part].edges.find(e=>e.type==='LINE'&&Math.abs(e.tangent[0])>.99&&Math.abs(e.center[1]+20)<1e-5&&Math.abs(e.center[2]-6)<1e-5);
 const vertical=state.geometry[part].edges.find(e=>e.type==='LINE'&&Math.abs(e.tangent[2])>.99&&Math.abs(e.center[0]-30)<1e-5&&Math.abs(e.center[1]+20)<1e-5);assert(long&&vertical);
 await page.mouse.click(...await project(state,occ.id,long.midpoint));await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('fillet');await ready();
 await page.mouse.click(...await project(state,occ.id,vertical.midpoint));await ready();assert.equal(requests.at(-1).args.path_reference.edge,vertical.signature);assert.equal(requests.at(-1).args.target,part);checks.push('A new edge replaces the path from any setup page without entering a picking slot');

 await stage('Profile');await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('circle');await stage('Result');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('new');await stage('Origin');await panel.getByLabel('Along U',{exact:true}).fill('4');await ready();
 await page.mouse.click(...await project(state,occ.id,long.midpoint));await ready();assert.equal(requests.at(-1).args.path_reference.edge,long.signature);assert.equal(requests.at(-1).args.reference.edge,long.signature);assert.equal(requests.at(-1).args.plane,'perpendicular');assert.equal(requests.at(-1).args.profile,'circle');await page.screenshot({path:'artifacts/implicit-path-replacement.png'});
 await page.mouse.click(...await project(state,occ.id,long.start));await page.getByRole('checkbox',{name:'Keep this origin when replacing faces or paths'}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'Keep this origin when replacing faces or paths'}).isChecked(),true);checks.push('Custom sections follow a replacement path; a vertex pick sets and locks an exact origin');
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.equal((await read()).document.revision,base+1);

 await topFace();await operationSize(panel).fill('-2');await ready();
 let intercepted=false;await page.route('**/api/previews/*/commit',async route=>{if(!intercepted){intercepted=true;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{code:'expired_preview',message:'This preview expired; create it again.'}})});}else await route.continue();});
 await operationSize(panel).press('Enter');await ready();assert(intercepted);assert.equal((await read()).document.revision,base+1);
 await operationSize(panel).press('Enter');await panel.waitFor({state:'hidden'});state=await read();assert.equal(state.document.revision,base+2);const feature=state.document.features[state.document.feature_order.at(-1)];assert.equal(feature.options.result,'cut');assert.equal(feature.options.auto_selection.mode,'cut');assert(Math.abs(state.geometry[part].volume-60*40*4)<1e-5);checks.push('Expired cached proposals revalidate and require a fresh confirmation; Auto commits one fixed Remove feature');
 const expectedNetworkError='Failed to load resource: the server responded with a status of 400 (Bad Request)';assert.equal(errors.filter(e=>e===expectedNetworkError).length,1,'Only the deliberately expired preview should return HTTP 400');
 const unexpected=errors.filter(e=>e!==expectedNetworkError);assert.deepEqual(unexpected,[]);const report={checks,errors:unexpected,expected_http_failure:'One simulated expired-preview HTTP 400',revision:state.document.revision};await fs.writeFile('artifacts/implicit-operations-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:'artifacts/implicit-operations-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}

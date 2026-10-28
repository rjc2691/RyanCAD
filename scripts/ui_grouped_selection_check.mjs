import {operationSize} from './ui_operation_setup.mjs';
// Real Shift-click input and native preview/commit. Run only on an empty isolated project.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[],checks=[],requests=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/previews'))requests.push(r.postDataJSON());});
const panel=page.getByRole('complementary',{name:'Tool operation workspace'});
const read=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
const ready=async()=>{await page.locator('.operation-preview-status').filter({hasText:'Preview validated'}).waitFor({timeout:45000});await page.waitForFunction(()=>!document.querySelector('.operation-commit-row .primary')?.disabled);};
async function command(name,args){return page.evaluate(async({name,args})=>{const s=await fetch('/api/state').then(r=>r.json());let r=await fetch('/api/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args,expected_revision:s.document.revision,request_id:crypto.randomUUID()})}).then(r=>r.json());if(r.error)throw Error(JSON.stringify(r));for(let i=0;i<900;i++){const job=await fetch('/api/jobs/'+r.job_id).then(r=>r.json());if(job.status==='complete')return job.result;if(['failed','cancelled'].includes(job.status))throw Error(JSON.stringify(job));await new Promise(r=>setTimeout(r,50));}throw Error('Job timeout');},{name,args});}
async function pick(state,occ,point,shift=false){const xy=await project(state,occ,point);if(shift)await page.keyboard.down('Shift');await page.mouse.click(...xy);if(shift)await page.keyboard.up('Shift');}
async function apply(){await operationSize(panel).press('Enter');await panel.waitFor({state:'hidden',timeout:45000});let s=await read();await page.locator(`.canvas-host[data-ready-revision="${s.document.revision}"]`).waitFor();return s;}
async function fit(){await page.getByRole('button',{name:'ISO',exact:true}).click();await page.getByRole('button',{name:/Fit design/}).click();}
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
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8808');await page.locator('.structure-root').waitFor();assert.equal(Object.keys((await read()).document.features).length,0,'Use an empty isolated project');
 const part=await command('operation.create',{name:'Grouped test part',profile:'rectangle',values:{width:40,height:30,distance:6}});
 for(const x of [-9,9])await command('operation.create',{name:'Support boss',target:part.component_id,target_occurrence:part.instance_id,profile:'circle',result:'add',values:{origin_x:x,origin_z:6,diameter:6,distance:4}});
 await page.reload();await page.locator('.structure-root').waitFor();let state=await read(),base=state.document.revision,occ=state.occurrences.find(o=>o.definition===part.component_id);
 await page.locator(`.canvas-host[data-ready-revision="${base}"]`).waitFor();await fit();
 const tops=state.geometry[part.component_id].faces.filter(f=>f.type==='PLANE'&&f.normal[2]>.99&&Math.abs(f.center[2]-10)<1e-5);assert.equal(tops.length,2);assert.notEqual(tops[0].signature,tops[1].signature);
 await pick(state,occ.id,tops[0].center);await pick(state,occ.id,tops[1].center,true);assert.match(await page.locator('.viewport-selection-summary').innerText(),/2 faces selected/);assert.equal(await page.getByRole('heading',{name:'Selected faces (2)',exact:true}).count(),1);assert.match(await page.locator('.selected-face').innerText(),/Combined face area/);
 await page.keyboard.press('t');await ready();assert.match(await panel.getByLabel('Selected tool profiles',{exact:true}).innerText(),/2 profiles/);
 await operationSize(panel).fill('-2');await ready();assert.equal(requests.at(-1).args.profile_references.length,2);assert.equal(requests.at(-1).args.target,part.component_id);
 await pick(state,occ.id,tops[1].center,true);await ready();assert.match(await panel.getByLabel('Selected tool profiles',{exact:true}).innerText(),/1 profile/);
 await pick(state,occ.id,tops[1].center,true);await ready();assert.match(await panel.getByLabel('Selected tool profiles',{exact:true}).innerText(),/2 profiles/);
 await panel.getByRole('button',{name:'Remove profile 2',exact:true}).click();await ready();assert.match(await page.locator('.viewport-selection-summary').innerText(),/Face \d+ selected/);await pick(state,occ.id,tops[1].center,true);await ready();
 const side=state.geometry[part.component_id].faces.find(f=>f.type==='PLANE'&&f.normal[0]>.99);assert(side);await pick(state,occ.id,side.center,true);await page.locator('.operation-preview-status').filter({hasText:'parallel'}).waitFor();assert.equal(await panel.getByRole('button',{name:'Apply operation',exact:true}).isEnabled(),false);await pick(state,occ.id,side.center,true);await ready();
 await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/grouped-face-preview.png'});state=await apply();assert.equal(state.document.revision,base+1);assert(Math.abs(state.geometry[part.component_id].volume-(7200+2*Math.PI*9*2))<1e-4);
 assert.equal(state.document.features[state.document.feature_order.at(-1)].references.profile_references.length,2);checks.push('Shift selects distinct coplanar faces on one part; toggles and remove controls work; nonparallel faces block Apply; one native cut edits both bosses');
 await page.reload();await page.locator(`.canvas-host[data-ready-revision="${state.document.revision}"]`).waitFor();assert.equal((await read()).document.features[state.document.feature_order.at(-1)].options.recipe_version,2);await fit();
 const g=state.geometry[part.component_id];const e1=g.edges.find(e=>e.type==='LINE'&&Math.abs(e.tangent[0])>.99&&Math.abs(e.center[1]+15)<1e-5&&Math.abs(e.center[2]-6)<1e-5),e2=g.edges.find(e=>e.type==='LINE'&&Math.abs(e.tangent[1])>.99&&Math.abs(e.center[0]-20)<1e-5&&Math.abs(e.center[2]-6)<1e-5);assert(e1&&e2);
 await pick(state,occ.id,e1.midpoint);await pick(state,occ.id,e2.midpoint,true);assert.match(await page.locator('.viewport-selection-summary').innerText(),/2 edges selected/);assert.equal(await page.getByRole('heading',{name:'Selected edges (2)',exact:true}).count(),1);assert.match(await page.locator('.selected-face').innerText(),/Combined curve length/);await page.keyboard.press('t');await ready();assert.match(await panel.getByLabel('Selected path edges',{exact:true}).innerText(),/2 edges/);
 await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('circle').then(()=>panel.getByLabel('Tool Path Type',{exact:true}).selectOption('sweep'));await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('new');await operationSize(panel).fill('2');await ready();
 const branch=g.edges.find(e=>e.type==='LINE'&&Math.abs(e.tangent[2])>.99&&Math.abs(e.center[0]-20)<1e-5&&Math.abs(e.center[1]+15)<1e-5);assert(branch);await pick(state,occ.id,branch.midpoint,true);await page.locator('.operation-preview-status').filter({hasText:'branches'}).waitFor();assert.equal(await panel.getByRole('button',{name:'Apply operation',exact:true}).isEnabled(),false);await pick(state,occ.id,branch.midpoint,true);await ready();
 assert.equal(requests.at(-1).args.path_references.length,2);assert.match(await page.getByRole('note',{name:'Tool Path reference'}).innerText(),/2 connected edges/);await page.screenshot({path:'artifacts/grouped-path-preview.png'});
 // This preset exposes diameter beside the model. Confirm from the dock because
 // the inline field controls diameter, not the generic path distance.
 await panel.getByRole('button',{name:'Apply operation',exact:true}).click();await panel.waitFor({state:'hidden',timeout:45000});state=await read();assert.equal(state.document.revision,base+2);
 const tube=state.document.features[state.document.feature_order.at(-1)].owner;assert(Math.abs(state.geometry[tube].volume-Math.PI*70)<1e-4);checks.push('Shift edge selection launches a grouped finisher; the same chain drives a complete native L-shaped sweep; a branch is rejected and can be removed');
 const regions=[];for(const x of [-9,9])regions.push(await command('feature.create',{name:'Planar tool region',type:'circle',values:{diameter:3,x,y:7,z:6}}));
 await page.reload();await page.locator('.structure-root').waitFor();state=await read();await page.locator(`.canvas-host[data-ready-revision="${state.document.revision}"]`).waitFor();await page.locator('.component-select').filter({hasText:'Grouped test part'}).click();await page.locator('button[aria-label="Tool operation"]').click();await panel.waitFor();
 for(let i=0;i<regions.length;i++){const c=state.document.components[regions[i].component_id];if(i)await page.keyboard.down('Shift');await page.locator('.component-select').nth(state.occurrences.findIndex(o=>o.definition===c.id)).click();if(i)await page.keyboard.up('Shift');}
 await panel.getByLabel('Path distance',{exact:true}).fill('2');await ready();assert.equal(requests.at(-1).args.profile_references.length,2);assert(requests.at(-1).args.profile_references.every(r=>r.sketch));assert.equal(requests.at(-1).args.target,part.component_id);assert.match(await page.locator('.component-row.selected').innerText(),/Grouped test part/);await page.screenshot({path:'artifacts/grouped-sketch-preview.png'});
 const revision=state.document.revision;await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.equal((await read()).document.revision,revision);checks.push('Multiple closed planar shapes from the tree share one extrusion preview; active-component lock and cancel remain intact');
 assert.deepEqual(errors,[]);const report={checks,errors,revision};await fs.writeFile('artifacts/grouped-selection-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:'artifacts/grouped-selection-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}

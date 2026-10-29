// Empty isolated project only. Verifies the owner-requested form hierarchy and action row.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[],checks=[],layouts=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const read=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
const panel=page.getByRole('complementary',{name:'Tool operation workspace'});
const ready=async()=>{await panel.locator('.operation-preview-status').filter({hasText:'Preview validated'}).waitFor({timeout:45000});await page.waitForFunction(()=>!document.querySelector('.operation-commit-row .primary')?.disabled);};
const tool=()=>page.locator('button[aria-label="Tool operation"]').click();
async function footerLayout(){
 const result=await page.evaluate(()=>{
  const panel=document.querySelector('.operation-panel'),footer=panel.querySelector('.operation-footer'),row=footer.querySelector('.operation-commit-row'),buttons=[...row.querySelectorAll('button')],status=row.querySelector('[role=status]'),name=footer.querySelector('input');
  const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
  return {panel:box(panel),row:box(row),buttons:buttons.map(box),names:buttons.map(el=>el.innerText),status:box(status),name:box(name),window:{width:innerWidth,height:innerHeight},rowColumns:getComputedStyle(row).gridTemplateColumns};
 });assert.deepEqual(result.names,['Apply operation','Cancel']);assert(result.buttons[0].x+result.buttons[0].width<=result.buttons[1].x);assert(result.buttons[1].x+result.buttons[1].width<=result.status.x);assert(result.status.x+result.status.width<=result.panel.x+result.panel.width+1);assert(Math.abs(result.buttons[0].y+result.buttons[0].height/2-result.status.y-result.status.height/2)<2);assert(result.name.y+result.name.height<=result.row.y);assert(result.row.y+result.row.height<=result.window.height);layouts.push(result);return result;
}
async function command(name,args){return page.evaluate(async({name,args})=>{const s=await fetch('/api/state').then(r=>r.json());let r=await fetch('/api/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args,expected_revision:s.document.revision,request_id:crypto.randomUUID()})}).then(r=>r.json());if(r.error)throw Error(JSON.stringify(r));for(let i=0;i<900;i++){const job=await fetch('/api/jobs/'+r.job_id).then(r=>r.json());if(job.status==='complete')return job.result;if(['failed','cancelled'].includes(job.status))throw Error(JSON.stringify(job));await new Promise(r=>setTimeout(r,50));}throw Error('Job timeout');},{name,args});}
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
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8819');await page.locator('.structure-root').waitFor();assert.equal(Object.keys((await read()).document.features).length,0,'Use an empty isolated project');await fs.mkdir('artifacts',{recursive:true});await tool();await ready();
 assert.equal(await panel.locator('.operation-scope').count(),0);assert.equal(await panel.getByText('ACTIVE COMPONENT',{exact:true}).count(),0);assert.equal(await panel.getByText('Enter applies · Esc cancels the operation · previews are unsaved',{exact:true}).count(),0);assert.equal(await panel.getByText(/Commit creates one authored operation/).count(),0);
 const placement=await page.evaluate(()=>{
  const p=document.querySelector('.operation-panel'),field=label=>p.querySelector(`[aria-label="${label}"]`);
  return {originTypePresent:!!field('Origin Type'),shapeInBox:!!field('Tool Profile Shape').closest('.operation-reference-control'),pathInBox:!!field('Tool Path Type').closest('.operation-reference-control'),extentBorder:getComputedStyle(p.querySelector('.operation-path-extent')).borderTopWidth,effectTag:field('Tool Effect Type').tagName};
 });assert.deepEqual(placement,{originTypePresent:false,shapeInBox:false,pathInBox:false,extentBorder:'0px',effectTag:'SELECT'});
 assert.deepEqual(await panel.getByLabel('Tool Effect Type',{exact:true}).locator('option').evaluateAll(els=>els.map(el=>el.value)),['auto','new','add','cut','intersect']);assert.notEqual(await panel.getByLabel('Tool Effect Type',{exact:true}).locator('option[value="cut"]').getAttribute('disabled'),null);
 assert.equal(await panel.getByRole('button',{name:'Pick world origin',exact:true}).count(),0);assert.equal(await panel.getByRole('button',{name:'Exact coordinates',exact:true}).count(),0);await ready();assert.equal(await panel.getByRole('group',{name:'Reference point offset'}).count(),0);assert.deepEqual(await panel.locator('[data-tool-section]').evaluateAll(nodes=>nodes.map(node=>node.dataset.toolSection)),['effect','profile','path','origin']);await page.screenshot({path:'artifacts/tool-form-origin.png'});
 await panel.getByLabel('Profile width',{exact:true}).fill('40');await panel.getByLabel('Profile height',{exact:true}).fill('30');await panel.getByLabel('Path distance',{exact:true}).fill('6');await panel.getByLabel('Feature Name',{exact:true}).fill('Form test part');await ready();assert.match(await panel.locator('.operation-commit-row').innerText(),/Preview validated · ready to apply/);await footerLayout();await page.screenshot({path:'artifacts/tool-form-path.png'});
 await panel.getByRole('button',{name:'Apply operation',exact:true}).click();await panel.waitFor({state:'hidden'});let state=await read();assert.equal(state.document.revision,1);const part=Object.keys(state.geometry)[0],occ=state.occurrences.find(o=>o.definition===part);await page.locator('.canvas-host[data-ready-revision="1"]').waitFor();
 checks.push('Type controls are outside reference boxes; origin follows path and offset inputs are omitted; extent has no divider; obsolete header/footer prose is absent; feature naming and Apply/Cancel/status share the new footer');
 await page.getByRole('button',{name:'ISO',exact:true}).click();await page.getByRole('button',{name:/Fit design/}).click();const top=state.geometry[part].faces.find(f=>f.normal[2]>.99);await page.mouse.click(...await project(state,occ.id,top.center));await page.keyboard.press('t');await ready();await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('cut');await panel.locator('.operation-preview-status.invalid').waitFor();await footerLayout();await page.screenshot({path:'artifacts/tool-form-validation.png'});
 await panel.getByLabel('Path distance',{exact:true}).fill('-2');await ready();await panel.getByLabel('Feature Name',{exact:true}).fill('Shallow cut');await ready();await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('auto');await ready();assert.equal(await panel.getByRole('note',{name:'Automatic Tool Effect'}).getAttribute('data-mode'),'cut');assert.equal(await panel.locator('[data-tool-section="effect"]').getByRole('note',{name:'Automatic Tool Effect'}).count(),1);await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('cut');await ready();await panel.getByLabel('Feature Name',{exact:true}).press('Enter');await panel.waitFor({state:'hidden',timeout:45000});state=await read();assert.equal(state.document.revision,2);assert(Math.abs(state.geometry[part].volume-4800)<1e-5);assert.equal(state.document.features[state.document.feature_order.at(-1)].name,'Shallow cut');checks.push('Effect dropdown retains Auto/Remove behavior, invalid preview disables Apply without overflowing the footer, and Enter from Feature Name commits exactly once');
 for(const [width,height] of [[1280,800],[1100,760]]){
  await page.setViewportSize({width,height});await page.locator('.structure-root').click();await tool();await ready();await panel.getByLabel('Tool Path Type',{exact:true}).scrollIntoViewIfNeeded();await footerLayout();await page.screenshot({path:`artifacts/tool-form-${width}.png`});await panel.getByRole('button',{name:'Cancel',exact:true}).click();await panel.waitFor({state:'hidden'});assert.equal((await read()).document.revision,2);
 }checks.push('1280/1100 windows keep all footer controls inside the panel on one horizontal row; cancel preserves the design');
 assert.deepEqual(errors,[]);const result={checks,errors,layouts,revision:2};await fs.writeFile('artifacts/tool-form-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify({checks,errors,layouts:layouts.length,revision:2},null,2));
}catch(e){await page.screenshot({path:'artifacts/tool-form-failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}

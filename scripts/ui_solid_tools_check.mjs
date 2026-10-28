// Use a fresh isolated project: verifies actual WebGL pixels during tool edits.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:980}});
const errors=[],checks=[],requests=[];
page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/previews'))requests.push(r.postDataJSON())});
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
const panel=page.getByRole('complementary',{name:'Tool operation workspace'});
const read=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
const ready=async()=>{await page.locator('.operation-preview-status').filter({hasText:'Preview validated'}).waitFor({timeout:45000});await page.waitForFunction(()=>!document.querySelector('.operation-commit-row .primary')?.disabled);};
const tool=()=>page.locator('button[aria-label="Tool operation"]').click();
async function makeBox(x,name){
 await page.locator('.structure-root').click();await tool();
 await panel.getByLabel('Profile width',{exact:true}).fill('40');await panel.getByLabel('Profile height',{exact:true}).fill('30');await panel.getByLabel('Path distance',{exact:true}).fill('10');
 await page.getByRole('button',{name:'Use world origin',exact:true}).click();await panel.getByLabel('Along U',{exact:true}).fill(String(x));await panel.getByLabel('Feature Name',{exact:true}).fill(name);
 await ready();await panel.getByRole('button',{name:'Apply operation',exact:true}).click();await panel.waitFor({state:'hidden'});
 const s=await read();await page.locator(`.canvas-host[data-ready-revision="${s.document.revision}"]`).waitFor();return s;
}
async function samples(points,count=1){
 return page.evaluate(async({points,count})=>{
  const canvas=document.querySelector('.canvas-host canvas'),r=canvas.getBoundingClientRect();
  const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
  const ctx=copy.getContext('2d',{willReadFrequently:true}),values=[];
  for(let i=0;i<count;i++){
   await new Promise(requestAnimationFrame);ctx.drawImage(canvas,0,0);
   values.push(points.map(p=>{const x=Math.round((p[0]-r.x)*canvas.width/r.width),y=Math.round((p[1]-r.y)*canvas.height/r.height);const data=ctx.getImageData(x-1,y-1,3,3).data;let sum=0;for(let j=0;j<data.length;j+=4)sum+=data[j]+data[j+1]+data[j+2];return sum/27;}));
  }return values;
 },{points,count});
}
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
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8802');await page.locator('.structure-root').waitFor();
 assert.equal(Object.keys((await read()).document.features).length,0,'Use a fresh isolated project');
 await makeBox(0,'Edited part');let state=await makeBox(70,'Context part');
 const target=Object.values(state.document.components).find(c=>c.name==='Edited part'),context=Object.values(state.document.components).find(c=>c.name==='Context part');assert(target&&context);
 const occ=state.occurrences.find(o=>o.definition===target.id),other=state.occurrences.find(o=>o.definition===context.id);
 await page.getByRole('button',{name:'ISO',exact:true}).click();await page.getByRole('button',{name:/Fit design/}).click();await page.mouse.move(10,10);
 const centers=[target,context].map(c=>{const b=state.geometry[c.id].bounds;return [(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,b.max[2]];});
 const points=[await project(state,occ.id,centers[0]),await project(state,other.id,centers[1])];
 const baseline=(await samples(points,3)).at(-1);
 const edges=state.geometry[target.id].edges.filter(e=>e.type==='LINE'&&((Math.abs(e.center[1]+15)<1e-5&&Math.abs(e.center[2]-10)<1e-5)||(Math.abs(e.center[0]-20)<1e-5&&Math.abs(e.center[1]+15)<1e-5)));
 assert(edges.length>=2);
 const before=await page.locator('.canvas-host').boundingBox();
 await page.mouse.click(...await project(state,occ.id,edges[0].midpoint));await page.keyboard.press('t');await ready();await page.mouse.move(10,10);
 assert.deepEqual(await page.locator('.canvas-host').boundingBox(),before,'Tool and inspector leave exactly the same viewport bounds');
 assert.equal(await panel.locator('.operation-steps').count(),0);
 assert.deepEqual(await panel.getByRole('heading',{level:3}).allTextContents(),['Tool Origin','Tool Profile','Tool Path','Tool Effect']);
 const focused=(await samples(points,4)).at(-1);
 assert(focused[0]>baseline[0]*.85,'Edited component stays solid');assert(focused[1]<baseline[1]*.8,'Other component becomes transparent');
 await page.route('**/api/geometry/*?preview_token=*',async route=>{await new Promise(r=>setTimeout(r,260));await route.continue();});
 const frames=[];
 for(const edge of [...edges.slice(1),edges[0],edges[1]]){
  const capture=samples(points,45);
  await page.mouse.click(...await project(state,occ.id,edge.midpoint));await ready();await page.mouse.move(10,10);frames.push(...await capture);
 }
 await panel.getByLabel('Radius',{exact:true}).fill('1.4');await ready();
 const capture=samples(points,45);await panel.getByLabel('Radius',{exact:true}).fill('1.8');await ready();frames.push(...await capture);
 // Return to an already displayed draft while another candidate's mesh loads.
 // Readiness must recover even though the retained root does not need swapping.
 await page.unroute('**/api/geometry/*?preview_token=*');
 await page.route('**/api/geometry/*?preview_token=*',async route=>{await new Promise(r=>setTimeout(r,800));await route.continue();});
 const retainedToken=await page.locator('.canvas-host').getAttribute('data-preview-token');
 const replacement=page.waitForRequest(r=>r.url().includes('/api/geometry/')&&r.url().includes('preview_token='));
 const raceFrames=samples(points,60);
 await panel.getByLabel('Radius',{exact:true}).fill('1.9');await replacement;
 await panel.getByLabel('Radius',{exact:true}).fill('1.8');await ready();
 assert.equal(await page.locator('.canvas-host').getAttribute('data-preview-token'),retainedToken);
 frames.push(...await raceFrames);
 assert.equal(await page.locator('.canvas-host').getAttribute('data-preview-token'),retainedToken,'Superseded mesh cannot replace the restored draft');
 checks.push('Returning to the retained draft during another mesh load restores Apply and aborts the obsolete replacement');
 const targetValues=frames.map(f=>f[0]),contextValues=frames.map(f=>f[1]);
 assert(Math.min(...targetValues)>focused[0]*.85,`Target dropped from ${focused[0]} to ${Math.min(...targetValues)}`);
 assert(Math.max(...targetValues)<focused[0]*1.15,'No bright double surfaces during replacement');
 assert(Math.max(...contextValues)<baseline[1]*.8,'Context remains transparent through replacements');
 checks.push('Repeated real edge picks and delayed mesh replacements keep one solid target surface visible; inactive context stays transparent');
 await panel.locator('[data-tool-section="effect"]').scrollIntoViewIfNeeded();await panel.getByLabel('Feature Name',{exact:true}).fill('Retained draft');
 await panel.locator('[data-tool-section="profile"]').scrollIntoViewIfNeeded();assert.equal(await panel.getByLabel('Radius',{exact:true}).inputValue(),'1.8');
 await panel.locator('[data-tool-section="effect"]').scrollIntoViewIfNeeded();assert.equal(await panel.getByLabel('Feature Name',{exact:true}).inputValue(),'Retained draft');await ready();
 checks.push('All four semantic sections share one scroll area and retain edits without stage navigation');
 const locked=panel.locator('[data-locked-target]');
 assert.equal(await locked.getAttribute('data-locked-target'),target.id);
 assert.equal(await panel.getByRole('button',{name:/Target component/}).count(),0);
 await page.locator('.component-select').filter({hasText:'Context part'}).click();
 assert.match(await page.locator('.component-row.selected').innerText(),/Edited part/);assert.equal(await locked.getAttribute('data-locked-target'),target.id);
 await page.locator('.timeline-feature').filter({hasText:'Context part'}).click();assert.match(await page.locator('.component-row.selected').innerText(),/Edited part/);
 await page.locator('.structure-root').click();assert.match(await page.locator('.component-row.selected').innerText(),/Edited part/);
 await page.getByRole('button',{name:'Move Component',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
 await page.locator('.timeline-feature').filter({hasText:'Context part'}).dblclick();assert.equal(await page.locator('.history-banner').count(),0);assert.equal(await locked.getAttribute('data-locked-target'),target.id);
 const otherEdge=state.geometry[context.id].edges.find(e=>e.type==='LINE'&&Math.abs(e.tangent[0])>.99&&Math.abs(e.center[1]+15)<1e-5&&Math.abs(e.center[2]-10)<1e-5);assert(otherEdge);
 await page.mouse.click(...await project(state,other.id,otherEdge.midpoint));await page.locator('.operation-preview-status.invalid').waitFor();
 assert.equal(requests.at(-1).args.target,target.id);assert.equal(requests.at(-1).args.path_reference.component,context.id);
 assert.equal(await locked.getAttribute('data-locked-target'),target.id);assert.match(await page.locator('.component-row.selected').innerText(),/Edited part/);
 await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('circle').then(()=>panel.locator('[data-tool-section="path"]').getByLabel('Tool Path Type',{exact:true}).selectOption('sweep'));await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('new');await ready();
 assert.equal(requests.at(-1).args.target,target.id);assert.equal(requests.at(-1).args.path_reference.component,context.id);
 checks.push('Tree, timeline, blank-space and cross-component edge picks preserve the locked active component; external edges update the path and can drive a custom sweep');
 await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('fillet');await page.mouse.click(...await project(state,occ.id,edges[1].midpoint));await ready();await page.mouse.move(10,10);
 await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/solid-tool-preview.png'});
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});await page.mouse.move(10,10);const restored=(await samples(points,4)).at(-1);
 assert(Math.abs(restored[1]-baseline[1])<2,'Cancel restores context color');
 await page.locator('.component-select').filter({hasText:'Context part'}).click();assert.match(await page.locator('.component-row.selected').innerText(),/Context part/);checks.push('Cancel unlocks active-component selection; normal opaque colors return');
 for(const [width,height] of [[1800,1050],[1280,800],[1100,760]]){
  await page.setViewportSize({width,height});const rect=await page.locator('.canvas-host').boundingBox(),inspector=await page.locator('.inspector-panel').boundingBox();
  await tool();await panel.waitFor();assert.deepEqual(await page.locator('.canvas-host').boundingBox(),rect);assert.equal((await panel.boundingBox()).width,inspector.width);
  const apply=await panel.getByRole('button',{name:'Apply operation',exact:true}).boundingBox();assert(apply.y+apply.height<=height);assert(apply.x+apply.width<=width);
  await panel.locator('[data-tool-section="origin"]').scrollIntoViewIfNeeded();await panel.locator('[data-tool-section="effect"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:`artifacts/solid-tools-${width}.png`});await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.deepEqual(await page.locator('.canvas-host').boundingBox(),rect);
 }
 checks.push('Identical inspector/tool widths at 1800, 1280 and 1100 px; Apply stays visible; Escape restores original presentation');
 assert.equal((await read()).document.revision,state.document.revision,'Preview and cancel do not edit the document');assert.deepEqual(errors,[]);
 const report={checks,errors,baseline,focused,restored,frames:frames.length,targetRange:[Math.min(...targetValues),Math.max(...targetValues)],contextRange:[Math.min(...contextValues),Math.max(...contextValues)]};await fs.writeFile('artifacts/solid-tools-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:'artifacts/solid-tools-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}

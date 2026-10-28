// Run only on an empty isolated project. Includes read-only panel hover and exact native extent commits.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[],checks=[],requests=[],reports=new Map();
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
page.on('request',r=>{if(r.method()==='POST')requests.push({url:r.url(),body:r.postDataJSON()})});
page.on('response',async r=>{if(r.url().includes('/api/jobs/')){try{const j=await r.json();if(j.result?.preview_token)reports.set(j.result.preview_token,j.result);}catch{}}});
const read=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
const panel=page.getByRole('complementary',{name:'Tool operation workspace'}),extent=panel.locator('[data-tool-section="path"]');
const ready=async()=>{await page.locator('.operation-preview-status').filter({hasText:'Preview validated'}).waitFor({timeout:45000});await page.waitForFunction(()=>!document.querySelector('.operation-commit-row .primary')?.disabled);};
async function report(){await ready();const token=await page.locator('.canvas-host').getAttribute('data-preview-token');for(let i=0;i<50;i++){if(reports.has(token))return reports.get(token);await page.waitForTimeout(10);}throw Error('No displayed preview report');}
async function cyan(point){return page.evaluate(async point=>{await new Promise(requestAnimationFrame);const c=document.querySelector('.canvas-host canvas'),r=c.getBoundingClientRect(),copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;const ctx=copy.getContext('2d');ctx.drawImage(c,0,0);const x=Math.round((point[0]-r.x)*c.width/r.width),y=Math.round((point[1]-r.y)*c.height/r.height),data=ctx.getImageData(x-12,y-12,25,25).data;let n=0;for(let i=0;i<data.length;i+=4)if(data[i+1]-data[i]>50&&data[i+2]-data[i]>70&&data[i+1]>200)n++;return n;},point);}
async function fit(){await page.getByRole('button',{name:'ISO',exact:true}).click();await page.getByRole('button',{name:/Fit design/}).click();}
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
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8817');await page.locator('.structure-root').waitFor();assert.equal(Object.keys((await read()).document.features).length,0,'Use an empty isolated project');await fs.mkdir('artifacts',{recursive:true});
 const part=await command('operation.create',{name:'Extent plate',profile:'rectangle',values:{width:40,height:30,distance:6}});
 await page.reload();await page.locator('.component-select').waitFor();let state=await read(),occ=state.occurrences.find(o=>o.definition===part.component_id),g=state.geometry[part.component_id];await page.locator(`.canvas-host[data-ready-revision="${state.document.revision}"]`).waitFor();await fit();
 const top=g.faces.find(f=>f.normal[2]>.99),first=g.edges.find(e=>Math.abs(e.tangent[0])>.99&&Math.abs(e.center[1]+15)<1e-5&&Math.abs(e.center[2]-6)<1e-5),second=g.edges.find(e=>Math.abs(e.tangent[1])>.99&&Math.abs(e.center[0]-20)<1e-5&&Math.abs(e.center[2]-6)<1e-5);
 for(const [key,prefix] of [['faces','Face'],['edges','Edge'],['vertex_info','Vertex']]){assert.equal(new Set(g[key].map(e=>e.id)).size,g[key].length);assert(g[key].every(e=>new RegExp(`^${prefix} [0-9]+$`).test(e.name)));}
 const topPoint=await project(state,occ.id,top.center),p1=await project(state,occ.id,first.midpoint),p2=await project(state,occ.id,second.midpoint);
 await page.mouse.click(...topPoint);await page.keyboard.press('t');await ready();
 assert.equal(await page.locator('.operation-inline-value').count(),0);assert.equal(await page.getByLabel('On-canvas operation size').count(),0);
 assert.equal(await extent.getByLabel('Path distance',{exact:true}).count(),1);assert.notEqual(await extent.getByLabel('Path extent units',{exact:true}).locator('option[value="percent"]').getAttribute('disabled'),null);await extent.getByLabel('Path distance',{exact:true}).fill('-2');await ready();assert(Math.abs((await report()).components[part.component_id].volume-4800)<1e-5);
 const profileName=panel.getByLabel('Selected tool profiles',{exact:true}).getByRole('button',{name:/^Highlight Face/});assert.match(await profileName.innerText(),new RegExp(top.name));const beforeHover=requests.length;
 await profileName.hover();await page.locator('.canvas-host[data-hover-source="panel"][data-hover-kind="face"]').waitFor();assert((await cyan(p1))>5);await page.screenshot({path:'artifacts/path-extent-face-hover.png'});await panel.locator('.operation-header').hover();await page.waitForFunction(()=>!document.querySelector('.canvas-host').dataset.hoverSource);assert.equal(requests.length,beforeHover);assert.equal((await read()).document.revision,1);
 await page.screenshot({path:'artifacts/path-extent-distance.png'});await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});checks.push('Distance lives only under Tool Path; implicit normals explain why percent is unavailable; signed cuts preview correctly; face-name hover is cyan and read-only');
 await page.mouse.move(...await project(state,occ.id,[20,-15,6]));await page.getByRole('tooltip',{name:'Click target'}).waitFor();assert.match(await page.getByRole('tooltip',{name:'Click target'}).innerText(),/Vertex \d+/);
 await page.mouse.click(...p1);await page.keyboard.down('Shift');await page.mouse.click(...p2);await page.keyboard.up('Shift');await page.keyboard.press('t');await panel.getByLabel('Radius',{exact:true}).fill('1');await ready();
 assert.match(await extent.innerText(),/Full selected edges/);
 const pathNames=panel.getByLabel('Selected path edges',{exact:true}).getByRole('button',{name:/^Highlight Edge/});assert.equal(await pathNames.count(),2);assert.match(await pathNames.nth(0).innerText(),new RegExp(first.name));
 await page.mouse.move(...p1);await page.locator('.canvas-host[data-hover-source="viewport"][data-hover-kind="edge"]').waitFor();const direct=await cyan(p1);const requestsBeforeNames=requests.length;
 await pathNames.nth(0).hover();await page.locator('.canvas-host[data-hover-source="panel"]').waitFor();const viaList=await cyan(p1);assert(direct>5&&viaList>5);assert.equal(await cyan(p2),0);await page.screenshot({path:'artifacts/path-extent-edge-hover.png'});
 await pathNames.nth(1).hover();await page.locator('.canvas-host[data-hover-source="panel"]').waitFor();await page.waitForTimeout(50);assert((await cyan(p2))>5);assert.equal(await cyan(p1),0);assert.equal(requests.length,requestsBeforeNames);assert.equal((await read()).document.revision,1);
 await panel.locator('.operation-header').hover();await page.waitForFunction(()=>!document.querySelector('.canvas-host').dataset.hoverSource);checks.push('Numbered edge names target each selected edge independently with the same cyan rendering as viewport hover; other edges remain selected, and no previews/history edits are issued');
 await panel.getByLabel('Tool Profile Shape',{exact:true}).selectOption('circle');await panel.getByLabel('Profile diameter',{exact:true}).fill('2');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('new');await ready();
 assert.equal(await extent.getByLabel('Path extent units',{exact:true}).inputValue(),'percent');assert.equal(await extent.getByLabel('Path percentage',{exact:true}).inputValue(),'100');assert.match(await extent.innerText(),/70 mm/);
 await extent.getByLabel('Path percentage',{exact:true}).fill('50');let r=await report();const newId=r.changes.component_id;assert(Math.abs(r.components[newId].volume-Math.PI*35)<1e-4);assert.equal(r.feature_values.path_percent,50);await page.screenshot({path:'artifacts/path-extent-percent.png'});
 await extent.getByLabel('Path extent units',{exact:true}).selectOption('distance');await extent.getByLabel('Path distance',{exact:true}).fill('12');r=await report();assert(Math.abs(r.components[r.changes.component_id].volume-Math.PI*12)<1e-4);
 await extent.getByLabel('Path distance',{exact:true}).fill('71');await page.locator('.operation-preview-status.invalid').waitFor();assert.equal(await panel.getByRole('button',{name:'Apply operation',exact:true}).isEnabled(),false);
 await extent.getByLabel('Path extent units',{exact:true}).selectOption('percent');await extent.getByLabel('Path percentage',{exact:true}).fill('50');await ready();await extent.getByLabel('Path percentage',{exact:true}).press('Enter');await panel.waitFor({state:'hidden',timeout:45000});state=await read();assert.equal(state.document.revision,2);const feature=state.document.features[state.document.feature_order.at(-1)],tool=feature.owner;assert.equal(feature.options.recipe_version,3);assert.equal(feature.options.path_extent,'percent');assert.equal(state.document.parameters[feature.parameters.path_percent].kind,'ratio');assert(Math.abs(state.geometry[tool].volume-Math.PI*35)<1e-4);checks.push('Connected 70 mm path previews exact 35 mm at 50 percent and 12 mm in Distance mode; oversize travel is rejected; Enter saves explicit percentage intent');
 await command('parameter.set',{id:state.document.features[part.feature_id].parameters.width,value:60});await page.reload();await page.locator('.component-select').first().waitFor();state=await read();assert(Math.abs(state.geometry[tool].volume-Math.PI*45)<1e-4);checks.push('Saved percentage follows the reference when total path changes from 70 to 90 mm, including reload');
 for(const [width,height]of [[1280,800],[1100,760]]){
  await page.setViewportSize({width,height});await page.locator('.structure-root').click();await page.locator('button[aria-label="Tool operation"]').click();await extent.getByLabel('Path distance',{exact:true}).fill('4');await ready();await extent.scrollIntoViewIfNeeded();assert(await extent.getByLabel('Path distance',{exact:true}).isVisible());const apply=await panel.getByRole('button',{name:'Apply operation',exact:true}).boundingBox();assert(apply.y+apply.height<=height);assert.equal(await page.locator('.operation-inline-value').count(),0);await page.screenshot({path:`artifacts/path-extent-${width}.png`});await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 }
 assert.equal((await read()).document.revision,3);assert.deepEqual(errors,[]);checks.push('1280/1100 layouts retain extent inputs inside the scrolling panel and visible Apply/Cancel; Escape does not save a draft');
 const result={checks,errors,directHoverPixels:direct,panelHoverPixels:viaList,revision:state.document.revision};await fs.writeFile('artifacts/path-extent-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:'artifacts/path-extent-failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}

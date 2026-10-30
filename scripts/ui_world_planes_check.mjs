import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1550,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const request=(path,body)=>page.evaluate(async({path,body})=>{
 const id=sessionStorage.getItem('ryancad-active-design'),headers={'Content-Type':'application/json',...(id?{'X-RyanCAD-Design':id}:{})};
 const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;
},{path,body});
async function command(name,args={}){const state=await request('/state'),submitted=await request('/commands',{name,args,expected_revision:state.document.revision});for(let n=0;n<1000;n++){const job=await request('/jobs/'+submitted.job_id);if(job.status==='complete')return job.result;if(['failed','cancelled'].includes(job.status))throw Error(JSON.stringify(job));await page.waitForTimeout(40);}throw Error('Job timeout');}
const picking=async(value)=>page.waitForFunction(value=>Boolean(document.querySelector('.canvas-host')?.dataset.worldPlanePicking)===value,value);
async function findPlanes(){
 const r=await page.locator('.canvas-host').boundingBox(),found={};
 for(const y of [-100,-60,-30,-15,15,30,60,100])for(const x of [-100,-60,-30,-15,15,30,60,100]){
  const p=[r.x+r.width/2+x,r.y+r.height/2+y];await page.mouse.move(...p);await page.waitForTimeout(25);
  const tip=page.locator('.viewport-hover-target'),m=(await tip.textContent()).match(/World (XY|XZ|YZ) plane/);
  if(m&&await tip.isVisible())found[m[1]]=p;
  if(Object.keys(found).length===3)return found;
 }
 return found;
}
try{
 await page.goto('http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();await picking(false);assert.deepEqual(await findPlanes(),{});await page.screenshot({path:'artifacts/world-planes-idle-hidden.png'});
 for(const plane of ['XY','XZ','YZ']){
  await page.keyboard.press('e');await page.getByRole('complementary',{name:'Sketch workspace',exact:true}).waitFor();await picking(true);const found=await findPlanes();assert.deepEqual(Object.keys(found).sort(),['XY','XZ','YZ']);
  await page.mouse.click(...found[plane]);await picking(false);assert((await page.locator('.sketch-plane-reference').textContent()).includes(`World ${plane} plane`));assert(await page.getByRole('button',{name:'Sketch Line',exact:true}).isEnabled());
  await page.getByRole('button',{name:'Cancel sketch',exact:true}).first().click();await picking(false);
 }
 // Explicit plane acquisition stays available when the ordinary world grid is hidden.
 await page.getByRole('button',{name:'Toggle grid · Shift G',exact:true}).click();await page.keyboard.press('e');await picking(true);assert.equal(Object.keys(await findPlanes()).length,3);await page.keyboard.press('Escape');await picking(false);
 await page.getByRole('button',{name:'Section view',exact:true}).click();await picking(false);await page.locator('.section-reference-pick').click();await picking(true);let found=await findPlanes();assert.equal(Object.keys(found).length,3);await page.mouse.click(...found.XZ);await picking(false);assert.equal(await page.getByLabel('Section plane',{exact:true}).inputValue(),'Y');
 await page.locator('.section-reference-pick').click();await picking(true);await page.getByRole('button',{name:'Cancel picking',exact:true}).click();await picking(false);await page.getByRole('button',{name:'Close section view',exact:true}).click();
 // Tool plane picking can use the same world markers instead of its dropdown.
 await page.keyboard.press('t');const tool=page.getByRole('complementary',{name:'Tool operation workspace',exact:true});await tool.waitFor();await picking(false);await tool.getByLabel('Tool Profile Shape',{exact:true}).selectOption('rectangle');await tool.getByLabel('Profile plane',{exact:true}).selectOption('face');await tool.getByRole('button',{name:/Support plane/}).click();await picking(true);found=await findPlanes();await page.mouse.click(...found.YZ);await picking(false);assert.equal(await tool.getByLabel('Profile plane',{exact:true}).inputValue(),'YZ');await tool.getByRole('button',{name:'Cancel tool operation',exact:true}).click();await picking(false);
 await page.reload();await page.locator('.design-inspector').waitFor();await picking(false);assert.deepEqual(await findPlanes(),{});assert.deepEqual(errors,[]);
 console.log('Passed: world-plane markers hidden in idle/main views and after cancel/selection, available only in sketch, section and tool plane-picking workflows, including grid-off selection.');
}catch(e){await page.screenshot({path:'.cache/world-plane-workflow-failure.png'});throw e;}finally{await browser.close();}

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
const point=async(id)=>page.locator(`[data-sketch="${id}"]`).evaluate(el=>{const r=el.ownerSVGElement.getBoundingClientRect(),v=el.getAttribute('transform').match(/[-+]?[0-9]*\.?[0-9]+/g).map(Number);return [r.x+v[0],r.y+v[1]];});
const line=async(id)=>page.locator(`path[data-sketch="${id}"]`).evaluate(el=>{const r=el.ownerSVGElement.getBoundingClientRect(),v=el.getAttribute('d').match(/[-+]?[0-9]*\.?[0-9]+/g).map(Number);return [r.x+v[0]*.7+v[2]*.3,r.y+v[1]*.7+v[3]*.3];});
try{
 await page.goto('http://127.0.0.1:8898');await page.locator('.project-structure').waitFor();
 await command('sketch.create',{name:'Live relationships',entities:[{id:'a',type:'line',x1:0,y1:0,x2:20,y2:0,fixed:true},{id:'b',type:'line',x1:25,y1:5,x2:25,y2:15,fixed:true},{id:'p',type:'point',x:8,y:8,fixed:true}]});
 await page.reload();await page.getByRole('button',{name:'Live relationships',exact:true}).dblclick();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Sketch plane',exact:true}).count(),0);
 await page.getByRole('button',{name:'Sketch Select',exact:true}).click();
 await page.mouse.move(...await line('a'));await page.waitForFunction(()=>document.querySelector('path[data-sketch="a"]')?.classList.contains('hovered'));
 await page.keyboard.press('k');await page.mouse.click(...await point('a:end'));await page.mouse.click(...await point('b:start'));
 await page.waitForFunction(()=>[...document.querySelectorAll('.sketch-constraint-row')].some(e=>e.textContent.includes('coincident')));
 const joinedA=await point('a:end'),joinedB=await point('b:start');assert(Math.hypot(joinedA[0]-joinedB[0],joinedA[1]-joinedB[1])<.1);
 assert.equal((await request('/state')).document.revision,1);
 await page.keyboard.press('d');const length=page.getByLabel('Viewport dimension length',{exact:true});await length.waitFor();await length.fill('0');await page.getByText('Dimension must be greater than zero.',{exact:true}).waitFor();await length.fill('18');
 await page.waitForFunction(()=>document.querySelector('[data-measurement="length:b"] text')?.textContent.includes('18 mm'));
 await page.keyboard.press('Enter');await length.waitFor({state:'detached'});
 await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');
 await page.mouse.click(...await line('a'));await page.keyboard.down('Shift');await page.mouse.click(...await line('b'));await page.keyboard.up('Shift');await page.keyboard.press('d');
 const angle=page.getByLabel('Viewport dimension angle',{exact:true});await angle.waitFor();await angle.fill('60');
 await page.waitForFunction(()=>document.querySelector('[data-measurement="angle:a:b"] text')?.textContent.includes('60'));
 await page.keyboard.press('Enter');await angle.waitFor({state:'detached'});
 // The same tool switches from one-line length to two-line angle without leaving.
 await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');
 await page.mouse.click(...await line('a'));await page.keyboard.press('d');await length.waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.mouse.click(...await line('b'));await angle.waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-measurement="angle:a:b"] text')?.textContent.includes('60'));
 assert(!(await page.locator('[data-measurement="length:a"]').getAttribute('class')).includes('constrained'));
 await page.keyboard.press('Escape');await angle.waitFor({state:'detached'});

 await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');
 await page.mouse.click(...await point('p:point'));await page.waitForFunction(()=>document.querySelector('[data-sketch="p:point"]')?.classList.contains('selected'));await page.keyboard.press('Delete');await page.locator('path[data-sketch="p"]').waitFor({state:'detached'});
 await page.keyboard.press('Control+z');await page.locator('path[data-sketch="p"]').waitFor();await page.mouse.click(...await point('p:point'));await page.waitForFunction(()=>document.querySelector('[data-sketch="p:point"]')?.classList.contains('selected'));await page.keyboard.press('Delete');await page.locator('path[data-sketch="p"]').waitFor({state:'detached'});
 await page.keyboard.press('u');await page.mouse.click(...await point('a:end'));
 await page.waitForFunction(()=>![...document.querySelectorAll('.sketch-constraint-row')].some(e=>e.textContent.includes('coincident')));
 await page.screenshot({path:'artifacts/sketch-live-relationships.png'});
 await page.getByRole('button',{name:'Finish sketch',exact:true}).first().click();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor({state:'detached'});
 const state=await request('/state'),feature=Object.values(state.document.features).find(f=>f.name==='Live relationships');
 assert.equal(feature.options.entities.length,2);assert(feature.options.constraints.some(c=>c.type==='angle'));assert(feature.options.constraints.some(c=>c.type==='distance'));assert(!feature.options.constraints.some(c=>c.type==='coincident'));
 assert.deepEqual(errors,[]);console.log('Passed: plane reference only, hover picking, immediate Connect/Disconnect solving, viewport length and angle constraints, Delete, and saved constraint integrity.');
}catch(e){await page.screenshot({path:'.cache/sketch-workflow-failure.png'});throw e;}finally{await browser.close();}

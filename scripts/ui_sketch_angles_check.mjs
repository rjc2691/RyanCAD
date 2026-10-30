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
 await command('sketch.create',{name:'Polygon selection check',entities:[{id:'a',type:'line',x1:0,y1:0,x2:20,y2:0},{id:'b',type:'line',x1:20,y1:0,x2:10,y2:-Math.sqrt(300)},{id:'c',type:'line',x1:10,y1:-Math.sqrt(300),x2:0,y2:0},{id:'p',type:'point',x:8,y:8}],constraints:[{type:'coincident',a:'a.end',b:'b.start'},{type:'coincident',a:'b.end',b:'c.start'},{type:'coincident',a:'c.end',b:'a.start'}]});
 await page.reload();await page.getByRole('button',{name:'Polygon selection check',exact:true}).dblclick();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor();
 const select=async()=>{await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');};
 const selected=async(id)=>page.locator(`[data-sketch="${id}"]`).evaluate(el=>el.classList.contains('selected'));
 const click=async(id,modifier)=>{if(modifier)await page.keyboard.down(modifier);await page.mouse.click(...await line(id));if(modifier)await page.keyboard.up(modifier);};
 await select();await click('a');await click('b','Shift');assert(await selected('a'));assert(await selected('b'));
 await click('a','Control');assert(!(await selected('a')));assert(await selected('b'));
 await click('c','Control');assert(!(await selected('c')));assert(await selected('b'));
 await click('b','Control');assert(!(await selected('b')));
 await page.mouse.click(...await point('p:point'));assert(await selected('p:point'));await page.keyboard.down('Control');await page.mouse.click(...await point('p:point'));await page.keyboard.up('Control');assert(!(await selected('p:point')));
 await click('a');await click('b','Shift');await page.keyboard.press('d');const angle=page.getByLabel('Viewport dimension angle',{exact:true});await angle.waitFor();assert(Math.abs(Number(await angle.inputValue())-60)<.001);
 await angle.fill('70');await page.waitForFunction(()=>document.querySelector('[data-measurement="angle:a:b"]')?.classList.contains('constrained')&&document.querySelector('[data-measurement="angle:a:b"] text')?.textContent.includes('70'));
 await page.keyboard.press('Enter');await angle.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Finish sketch',exact:true}).first().click();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor({state:'detached'});
 let state=await request('/state'),feature=Object.values(state.document.features).find(f=>f.name==='Polygon selection check');const constraint=feature.options.constraints.find(c=>c.type==='angle');assert(constraint.angle_frame);assert.equal(Number(state.document.parameters[feature.parameters[constraint.parameter_key]].expression),70);
 // The saved angle reopens with the same positive value.
 await page.getByRole('button',{name:'Polygon selection check',exact:true}).dblclick();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor();await select();await page.locator('[data-measurement="angle:a:b"] text').click();await angle.waitFor();assert.equal(Number(await angle.inputValue()),70);
 await angle.fill('75');await page.waitForFunction(()=>document.querySelector('[data-measurement="angle:a:b"] text')?.textContent.includes('75'));await page.keyboard.press('Enter');await angle.waitFor({state:'detached'});await page.getByRole('button',{name:'Finish sketch',exact:true}).first().click();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor({state:'detached'});
 // A world axis uses the same dimension input, including exact horizontal/vertical values.
 await command('sketch.create',{name:'Axis angle check',entities:[{id:'axisline',type:'line',x1:-30,y1:10,x2:30,y2:20}]});await page.reload();await page.getByRole('button',{name:'Axis angle check',exact:true}).dblclick();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor();await select();await click('axisline');await page.keyboard.press('d');await page.getByLabel('Viewport dimension length',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Use world Z axis',exact:true}).locator('text').click();await page.getByText('World Z is perpendicular to this sketch plane. Choose an axis with a direction in the plane.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Use world X axis',exact:true}).locator('text').click();await angle.waitFor();assert(Number(await angle.inputValue())>0);await angle.fill('0');await page.waitForFunction(()=>document.querySelector('[data-measurement="angle:axisline:world:X"] text')?.textContent.includes('0'));await page.keyboard.press('Enter');await angle.waitFor({state:'detached'});
 await select();await page.locator('[data-measurement="angle:axisline:world:X"] text').click();await angle.waitFor();assert.equal(Number(await angle.inputValue()),0);await angle.fill('30');await page.waitForFunction(()=>document.querySelector('[data-measurement="angle:axisline:world:X"] text')?.textContent.includes('30'));await page.keyboard.press('Enter');await angle.waitFor({state:'detached'});await page.getByRole('button',{name:'Finish sketch',exact:true}).first().click();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor({state:'detached'});
 state=await request('/state');feature=Object.values(state.document.features).find(f=>f.name==='Axis angle check');assert.equal(feature.options.entities.length,1);assert.equal(feature.options.constraints.find(c=>c.type==='angle').b,'world:X');
 assert.deepEqual(errors,[]);console.log('Passed: removal-only Ctrl-click for multi-selected lines and points, positive polygon angle editing, persistence, re-editing, and world-axis angle dimensions.');
}catch(e){await page.screenshot({path:'.cache/sketch-angles-failure.png'});throw e;}finally{await browser.close();}

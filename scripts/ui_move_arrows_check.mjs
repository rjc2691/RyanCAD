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
try{
 await page.goto('http://127.0.0.1:8898');await page.locator('.project-structure').waitFor();
 await command('part.primitive',{shape:'box',name:'Slide block',place:true});await page.reload();
 await page.getByRole('tree',{name:'Layout parts',exact:true}).getByText('Slide block',{exact:true}).click();
 await page.keyboard.press('m');const panel=page.getByRole('complementary',{name:'Move Part workspace'});await panel.waitFor();
 const handle=page.locator('[data-slide-axis="X"]');await handle.waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-slide-axis="X"] [data-hit]')?.getAttribute('d')?.length>10);
 const coords=await handle.locator('[data-hit]').evaluate(el=>{const r=el.ownerSVGElement.getBoundingClientRect(),v=el.getAttribute('d').match(/[-+]?[0-9]*\.?[0-9]+/g).map(Number);return {x:r.x+(v[0]+v[2])/2,y:r.y+(v[1]+v[3])/2,dx:(v[2]-v[0])*.8,dy:(v[3]-v[1])*.8};});
 await page.mouse.move(coords.x,coords.y);await page.mouse.down();await page.mouse.move(coords.x+coords.dx,coords.y+coords.dy,{steps:12});await page.mouse.up();
 await page.waitForFunction(()=>{const input=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Movement distance'))?.querySelector('input');return input&&Number(input.value)>0;});
 await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Apply move');return button&&!button.disabled;});
 await page.getByLabel('Viewport movement distance',{exact:true}).fill('7.5');
 await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Apply move');return button&&!button.disabled;});
 await panel.getByRole('button',{name:'Apply move',exact:true}).click();await panel.waitFor({state:'detached'});
 const state=await request('/state');const part=state.occurrences.find(o=>o.layout&&o.structure_role==='part');assert.equal(part.matrix[0][3],7.5);assert.equal(part.matrix[1][3],0);assert.equal(part.matrix[2][3],0);
 assert.deepEqual(errors,[]);console.log('Passed: world X arrow drag updates distance, previews and applies an axis-only part movement.');
}catch(e){await page.screenshot({path:'.cache/move-arrows-failure.png'});throw e;}finally{await browser.close();}

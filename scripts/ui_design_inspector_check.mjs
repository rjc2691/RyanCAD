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
 await page.goto('http://127.0.0.1:8898');await page.getByRole('region',{name:'Design overview'}).count();await page.locator('.design-inspector').waitFor();
 const overview=page.locator('.design-inspector');
 assert.equal(await overview.locator('[data-design-count="parts"] > strong').textContent(),'0');assert.equal(await overview.locator('[data-design-count="layouts"] > strong').textContent(),'1');
 await command('document.rename',{name:'Mold tooling'});
 const made=await command('part.primitive',{shape:'box',name:'Mold shell',values:{length:25.4,width:10,height:5},place:true});
 let state=await request('/state');const part=Object.values(state.document.components).find(c=>c.name==='Mold shell'&&c.structure_role==='part');
 await command('part.insert',{part:part.id});await command('layout.create',{name:'Test arrangement'});await command('part.insert',{part:part.id});
 await command('sketch.create',{name:'Split line',entities:[{id:'a',type:'line',x1:0,y1:0,x2:10,y2:0}]});
 await command('parameter.create',{name:'Wall thickness',value:2});
 await page.reload();await overview.waitFor();await overview.getByRole('heading',{name:'Mold tooling',exact:true}).waitFor();
 assert.equal(await page.getByText('Entire design',{exact:true}).count(),0);
 assert.equal(await overview.locator('[data-design-count="layouts"] > strong').textContent(),'2');assert.equal(await overview.locator('[data-design-count="parts"] > strong').textContent(),'1');assert.equal(await overview.locator('[data-design-count="sketches"] > strong').textContent(),'1');
 assert((await overview.locator('[data-design-count="parts"] .design-card-detail').textContent()).includes('1 component'));
 await overview.getByText('Test arrangement',{exact:true}).waitFor();assert((await overview.locator('.design-layout-counts').textContent()).includes('1 part placement'));
 const before=await request('/state');const desc=page.getByLabel('Design description',{exact:true});await desc.fill('Split mold for silicone casting.\nPrototype A.');await desc.press('Control+Enter');
 await page.waitForFunction(()=>document.querySelector('[aria-label="Design description"]')?.disabled===false);assert.equal((await request('/state')).document.notes,'Split mold for silicone casting.\nPrototype A.');
 await command('history.undo');await page.waitForFunction(()=>document.querySelector('[aria-label="Design description"]')?.value==='');await command('history.redo');await page.waitForFunction(()=>document.querySelector('[aria-label="Design description"]')?.value==='Split mold for silicone casting.\nPrototype A.');
 const units=page.getByLabel('Design display units',{exact:true});await units.selectOption('in');await page.waitForFunction(()=>document.querySelector('.inspector-footer')?.textContent.trim().endsWith('in'));
 const after=await request('/state');assert.deepEqual(after.summary,before.summary);assert.equal(after.document.display_units,'in');
 const measurement=overview.locator('[data-measurement="volume"]');assert.equal(Number(await measurement.getAttribute('data-value')),after.summary.volume_mm3);assert((await measurement.textContent()).includes('in'));
 await desc.fill('Discard this draft');await desc.press('Escape');assert.equal(await desc.inputValue(),'Split mold for silicone casting.\nPrototype A.');
 await page.reload();await overview.waitFor();assert.equal(await page.getByLabel('Design description',{exact:true}).inputValue(),'Split mold for silicone casting.\nPrototype A.');assert.equal(await page.getByLabel('Design display units',{exact:true}).inputValue(),'in');
 await page.screenshot({path:'artifacts/design-inspector.png'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/Inspector/i}).last().click();await overview.waitFor();assert(await page.getByLabel('Design description',{exact:true}).isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/design-inspector-mobile.png'});
 assert.deepEqual(errors,[]);console.log('Passed: blank/design structure counts, active-layout totals, description save/cancel/reload, per-design units without rescaling, and mobile access.');
}catch(e){await page.screenshot({path:'.cache/design-inspector-failure.png'});throw e;}finally{await browser.close();}

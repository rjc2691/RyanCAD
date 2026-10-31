// Isolated profile/server only; never attaches to the user's browser.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const origin=()=>page.getByRole('button',{name:'Select world origin',exact:true});
const state=()=>page.evaluate(async()=>{const id=sessionStorage.getItem('ryancad-active-design');return(await fetch('/api/state',{headers:{'X-RyanCAD-Design':id}})).json();});
async function command(name,args){const s=await state();return page.evaluate(async({name,args,revision})=>{const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};const j=await(await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({name,args,expected_revision:revision})})).json();for(let i=0;i<500;i++){const job=await(await fetch('/api/jobs/'+j.job_id,{headers})).json();if(job.status==='complete')return job.result;if(job.status==='failed')throw Error(JSON.stringify(job.error));await new Promise(r=>setTimeout(r,30));}throw Error('timeout');},{name,args,revision:s.document.revision});}
try{
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();await origin().waitFor();const revision=(await state()).document.revision;
 await origin().click();assert.equal(await origin().getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('complementary',{name:'Tool operation workspace',exact:true}).count(),0);await origin().click({modifiers:['Control']});assert.equal(await origin().getAttribute('aria-pressed'),'false');
 await page.getByRole('button',{name:'Use world origin',exact:true}).click();assert.equal(await origin().getAttribute('aria-pressed'),'true');await page.keyboard.press('Escape');assert.equal(await origin().getAttribute('aria-pressed'),'false');assert.equal((await state()).document.revision,revision);
 await page.getByTitle(/Toggle grid/).click();assert(await origin().isVisible());
 await origin().click();await page.getByRole('button',{name:'Tool operation',exact:true}).click();const tool=page.getByRole('complementary',{name:'Tool operation workspace',exact:true});await tool.waitFor();assert.equal(await tool.getAttribute('data-locked-target'),'new');await tool.getByRole('button',{name:/Travel target point/}).click();await origin().click();await tool.getByRole('button',{name:'Travel target point World origin',exact:true}).waitFor();await page.getByRole('button',{name:'Cancel tool operation',exact:true}).click();
 await page.getByRole('button',{name:'Measure',exact:true}).click();await origin().click();await page.locator('.measure-points').getByText('World origin',{exact:true}).waitFor();await page.getByRole('button',{name:'Done',exact:true}).click();
 await command('part.primitive',{name:'Origin fixture',shape:'box',values:{length:'20',width:'20',height:'20'},place:true});await page.getByRole('tree',{name:'Layout parts',exact:true}).getByText('Origin fixture',{exact:true}).click();await page.getByRole('button',{name:'Move Part',exact:true}).click();const move=page.getByRole('complementary',{name:'Move Part workspace',exact:true});await move.waitFor();
 for(const role of ['origin','target']){const field=move.locator(`[data-move-role=${role}]`);await field.locator('button.operation-pick-slot').click();await origin().click();await field.getByText('World origin',{exact:true}).waitFor();}
 await page.getByRole('button',{name:'Cancel Move Part',exact:true}).click();assert.deepEqual(errors,[]);await page.screenshot({path:'.cache/world-origin-reference.png'});
 console.log('Passed: viewport/corner selection, no automatic operation, Ctrl/Escape deselection, grid hidden, Tool travel target, measurement, movement origin and target.');
}catch(e){await page.screenshot({path:'.cache/world-origin-failure.png'});throw e;}finally{await browser.close();}

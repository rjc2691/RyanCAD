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
 const p=await command('part.create',{name:'Mounting plate'}),body=await command('part.component.create',{part:p.component_id,name:'Body'}),width=await command('parameter.create',{name:'Plate width',value:20});
 await command('feature.create',{owner:body.component_id,type:'box',values:{length:{parameter:width.parameter_id},width:12,height:5}});
 await command('part.insert',{part:p.component_id});
 await page.reload();
 await page.getByRole('tree',{name:'Reusable parts',exact:true}).getByText('Mounting plate',{exact:true}).waitFor();
 const library=page.getByRole('tree',{name:'Reusable parts',exact:true});
 await library.getByText('Mounting plate',{exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'Create variation',exact:true}).click();
 await page.getByLabel('Variation name',{exact:true}).fill('Wide');
 await page.locator('.variation-parameter input[type=checkbox]').check();await page.getByLabel('Plate width override',{exact:true}).fill('32');await page.getByRole('button',{name:'Save variation',exact:true}).click();
 await page.locator('.structure-variation').getByText('Wide',{exact:true}).waitFor();
 await page.locator('.structure-variation').getByRole('button',{name:'Place',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Layout parts"]')?.textContent.includes('Wide'));
 let state=await request('/state');assert.equal(state.summary.instances,2);assert.equal(state.document.feature_order.length,1);assert.equal(Object.keys(state.document.variations).length,1);
 await library.getByText('Mounting plate',{exact:true}).dblclick();await page.waitForFunction(()=>document.querySelector('.viewport-context .eyebrow')?.textContent==='Part Editor');
 await library.getByText('Body',{exact:true}).dblclick();await page.waitForFunction(()=>document.querySelector('.viewport-context .eyebrow')?.textContent==='Component Editor');
 await page.keyboard.press('t');await page.getByRole('complementary',{name:'Tool operation workspace'}).waitFor();await page.keyboard.press('Escape');await page.getByRole('complementary',{name:'Tool operation workspace'}).waitFor({state:'detached'});
 await page.locator('.group-edit-banner').getByRole('button',{name:'Done'}).click();await page.waitForFunction(()=>document.querySelector('.viewport-context .eyebrow')?.textContent==='Part Editor');
 await page.locator('.group-edit-banner').getByRole('button',{name:'Done'}).click();await page.waitForFunction(()=>document.querySelector('.viewport-context .eyebrow')?.textContent==='Layout Editor');
 await page.getByRole('button',{name:'add layout',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Layout parts"]')?.textContent==='');
 state=await request('/state');assert.equal(state.summary.instances,0);assert.equal(Object.values(state.document.components).filter(c=>c.structure_role==='layout').length,2);
 await page.locator('.structure-layout').first().locator('button').first().click();await page.waitForFunction(()=>document.querySelector('[aria-label="Layout parts"]')?.textContent.includes('Wide'));
 await page.getByRole('button',{name:/Fit design/}).click();
 await page.screenshot({path:'artifacts/parts-layouts.png'});
 await page.reload();await page.locator('.structure-variation').getByText('Wide',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/parts-layouts-mobile.png'});
 assert.deepEqual(errors,[]);console.log('Passed: new structure, variation values, linked placement, editor scopes, tool launch, independent layouts, reload, and mobile rendering.');
}catch(e){await page.screenshot({path:'.cache/project-structure-failure.png'});throw e;}finally{await browser.close();}

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
 await page.goto('http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();
 const axis=key=>page.getByRole('button',{name:`Use world ${key} axis`,exact:true}).locator('text');
 for(const key of ['X','Y','Z']){await axis(key).click();assert.equal(await page.locator('.move-component-panel,.operation-panel').count(),0);}
 assert.equal(await page.getByRole('button',{name:'Move Part',exact:true}).count(),1);
 await page.keyboard.press('m');const panel=page.getByRole('complementary',{name:'Move Part workspace',exact:true});await panel.waitFor();await page.getByLabel('Part to move',{exact:true}).waitFor();await axis('X').click();assert(await panel.isVisible());await panel.getByRole('button',{name:'Cancel',exact:true}).click();
 await command('part.primitive',{shape:'box',name:'Move terminology part',place:true});await page.reload();
 await page.getByRole('tree',{name:'Layout parts',exact:true}).getByText('Move terminology part',{exact:true}).click();await axis('Y').click();assert.equal(await panel.count(),0);
 await page.keyboard.press('m');await panel.waitFor();await panel.getByRole('heading',{name:'Part',exact:true}).waitFor();await axis('Y').click();await panel.getByText('World Y axis',{exact:true}).waitFor();assert((await page.locator('.viewport-context .eyebrow').textContent()).includes('MOVE PART'));
 await panel.getByRole('button',{name:'Clear part',exact:true}).click();const options=await panel.getByLabel('Part to move',{exact:true}).locator('option').allTextContents();assert.equal(options.length,2);assert(options[1].includes('Move terminology part'));assert(!options.some(o=>o.includes('Component')));
 await panel.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('tree',{name:'Reusable parts',exact:true}).getByText('Move terminology part',{exact:true}).dblclick();await page.waitForFunction(()=>document.querySelector('.viewport-context .eyebrow')?.textContent==='Part Editor');await page.getByRole('button',{name:'Move Component',exact:true}).waitFor();
 await page.getByRole('tree',{name:'Reusable parts',exact:true}).getByText('Component',{exact:true}).dblclick();await page.waitForFunction(()=>document.querySelector('.viewport-context .eyebrow')?.textContent==='Component Editor');await page.keyboard.press('m');const componentPanel=page.getByRole('complementary',{name:'Move Component workspace',exact:true});await componentPanel.waitFor();await axis('Z').click();await componentPanel.getByText('World Z axis',{exact:true}).waitFor();await componentPanel.getByRole('button',{name:'Cancel',exact:true}).click();
 await axis('X').click();assert.equal(await componentPanel.count(),0);
 await page.getByRole('button',{name:'Workspace settings',exact:true}).click();await page.getByRole('button',{name:'Edit shortcut for Move Component',exact:true}).waitFor();await page.getByRole('dialog',{name:'Workspace preferences',exact:true}).getByRole('button',{name:'Done',exact:true}).click();
 assert.deepEqual(errors,[]);console.log('Passed: idle axis clicks never launch movement, active axis picking remains available, Layout Editor uses Move Part and placed-part targets, inner editors retain Move Component.');
}catch(e){await page.screenshot({path:'.cache/move-terminology-failure.png'});throw e;}finally{await browser.close();}

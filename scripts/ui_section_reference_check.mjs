import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await mkdir('.cache/section-reference-ui',{recursive:true});
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await page.evaluate(async()=>{
  const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};
  for(const spec of [{name:'feature.create',args:{type:'box',name:'Reference box',values:{length:30,width:20,height:15}}},{name:'sketch.create',args:{name:'Tilted plane',plane:'XY',frame:{origin:[0,0,4],u:[0,1,0],normal:[Math.SQRT1_2,0,Math.SQRT1_2]},entities:[{id:'l',type:'line',x1:0,y1:0,x2:5,y2:0}]}}]){
   const s=await(await fetch('/api/state',{headers})).json();const job=await(await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({...spec,expected_revision:s.document.revision})})).json();
   for(let i=0;i<600;i++){const j=await(await fetch('/api/jobs/'+job.job_id,{headers})).json();if(j.status==='complete')break;if(j.status==='failed')throw Error(JSON.stringify(j.error));await new Promise(r=>setTimeout(r,50));}
  }
 });
 await page.locator('.component-select').first().waitFor();
 await page.getByRole('button',{name:'Front',exact:true}).click();
 await page.getByRole('button',{name:'Section view',exact:true}).click();
 await page.locator('.section-reference-pick').click();
 await page.waitForTimeout(180);
 const box=await page.locator('.canvas-host').boundingBox();
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await page.waitForFunction(()=>document.querySelector('.section-reference-pick')?.textContent?.includes('Reference box'));
 assert.equal(await page.getByLabel('Section position',{exact:true}).inputValue(),'0');
 assert.equal(await page.getByLabel('Section plane',{exact:true}).inputValue(),'reference');
 await page.locator('.section-reference-pick').click();
 await page.getByRole('button',{name:'Cancel picking',exact:true}).click();
 await page.locator('.section-reference-pick').click();
 await page.locator('.sketch-tree-name').filter({hasText:'Tilted plane'}).click();
 await page.waitForFunction(()=>document.querySelector('.section-reference-pick')?.textContent?.includes('Tilted plane'));
 await page.getByLabel('Section position',{exact:true}).fill('2');
 await page.waitForFunction(()=>document.querySelector('.section-offset-label')?.textContent==='Offset 2 mm');
 assert.equal(await page.locator('.section-reference-pick > svg').count(),2);
 const base=await page.locator('.section-reference-plane').getAttribute('points'),path=await page.locator('.section-offset-path').getAttribute('d');
 await page.getByLabel('Section position',{exact:true}).fill('-2');
 await page.waitForFunction(()=>document.querySelector('.section-offset-label')?.textContent==='Offset -2 mm');
 assert.equal(await page.locator('.section-reference-plane').getAttribute('points'),base);
 assert.notEqual(await page.locator('.section-offset-path').getAttribute('d'),path);
 await page.getByLabel('Section position',{exact:true}).fill('2');
 await page.screenshot({path:'.cache/section-reference-ui/reference.png'});
 await page.getByRole('button',{name:'Clear section plane reference'}).click();assert.equal(await page.getByLabel('Section plane',{exact:true}).inputValue(),'Y');
 await page.getByRole('button',{name:'Account menu',exact:true}).click();
 await page.getByRole('menu',{name:'Account',exact:true}).waitFor();
 await page.getByRole('menuitem',{name:/Sign in/}).click();
 const dialog=page.getByRole('dialog',{name:'Sign in',exact:true});await dialog.waitFor();
 assert(await dialog.getByRole('button',{name:'Sign in',exact:true}).isDisabled());
 assert.equal(await dialog.locator('input:not(:disabled)').count(),0);
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await page.setViewportSize({width:320,height:740});
 await page.getByRole('button',{name:'Account menu',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'.cache/section-reference-ui/account-mobile.png'});
 await page.getByRole('menuitem',{name:'External agents',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 assert.deepEqual(errors,[]);
 console.log('Passed: viewport face plane, tilted sketch plane, relative offset, cancel/clear, account dropdown, disabled authentication mockup, mobile bounds and Agents access.');
}catch(e){await page.screenshot({path:'.cache/section-reference-ui/failure.png'});throw e;}finally{await browser.close();}

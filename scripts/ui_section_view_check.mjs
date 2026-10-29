import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await mkdir('.cache/section-ui',{recursive:true});
const documentState=()=>page.evaluate(async()=>JSON.stringify((await(await fetch('/api/state',{headers:{'X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')}})).json()).document));
const pixels=async()=>{await page.waitForTimeout(180);return page.locator('canvas').first().evaluate(c=>c.toDataURL());};
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await page.evaluate(async()=>{
  const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};
  let j=await(await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({name:'feature.create',expected_revision:0,args:{type:'box',values:{length:30,width:20,height:15}}})})).json();
  const id=j.job_id;
  for(let i=0;i<600;i++){j=await(await fetch('/api/jobs/'+id,{headers})).json();if(j.status==='complete')return;if(j.status==='failed')throw Error(JSON.stringify(j.error));await new Promise(r=>setTimeout(r,50));}
 });
 await page.locator('.component-select').first().waitFor();await page.waitForTimeout(700);
 const before=await documentState();
 await page.getByRole('button',{name:'Section view',exact:true}).click();
 const position=page.getByLabel('Section position',{exact:true});
 for(const axis of ['X','Y','Z']){
  await page.getByLabel('Section plane',{exact:true}).selectOption(axis);
  await position.fill('100');const hidden=await pixels();
  await position.fill('-100');const visible=await pixels();assert.notEqual(hidden,visible,axis+' cut must move');
  await page.getByRole('button',{name:'Center',exact:true}).click();
  const middle=await pixels();await page.getByLabel('Flip cut side',{exact:true}).check();
  assert.notEqual(await pixels(),middle,'Flip must change the retained side');
  await page.getByLabel('Flip cut side',{exact:true}).uncheck();
 }
 await page.screenshot({path:'.cache/section-ui/section-controls.png'});
 assert.equal(await documentState(),before);
 await page.getByRole('button',{name:'Close section view',exact:true}).click();
 await page.getByRole('button',{name:'Section view',exact:true}).click();assert.equal(await position.inputValue(),'7.5');
 await page.setViewportSize({width:390,height:844});
 const bounds=await page.getByRole('region',{name:'Section view controls'}).boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390);
 assert.deepEqual(errors,[]);console.log('Passed: live clipping on X/Y/Z, exact position, centering, flip, retained settings, mobile bounds, unchanged document and no JS errors.');
}catch(e){await page.screenshot({path:'.cache/section-ui/failure.png'});throw e;}finally{await browser.close();}

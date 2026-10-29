import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1050}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await mkdir('.cache/experiments-ui',{recursive:true});
const pixels=async()=>{await page.waitForTimeout(250);return page.locator('canvas').first().evaluate(c=>c.toDataURL());};
const readDocument=()=>page.evaluate(async()=>JSON.stringify((await(await fetch('/api/state',{headers:{'X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')}})).json()).document));
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await page.evaluate(async()=>{
  const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};let owner;
  for(const spec of [{type:'box',name:'Active housing',values:{length:30,width:24,height:18,x:-18}},{type:'fillet',values:{radius:2},options:{selector:{group:'vertical'}}},{type:'cylinder',name:'Other component',values:{diameter:16,height:22,x:28}}]){
   if(spec.type==='fillet')spec.owner=owner;
   const s=await(await fetch('/api/state',{headers})).json();const submission=await(await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({name:'feature.create',expected_revision:s.document.revision,args:spec})})).json();
   for(let i=0;i<600;i++){const j=await(await fetch('/api/jobs/'+submission.job_id,{headers})).json();if(j.status==='complete'){if(spec.type==='box')owner=j.result.component_id;break;}if(j.status==='failed')throw Error(JSON.stringify(j.error));await new Promise(r=>setTimeout(r,50));}
  }
 });
 await page.locator('.component-select').nth(1).waitFor();await page.locator('.component-select').first().click();await page.keyboard.press('f');await page.waitForTimeout(600);
 const before=await readDocument(),baseline=await pixels();
 const button=page.getByRole('button',{name:'Experimental features',exact:true});
 const parameters=await page.locator('.parameters-tool').boundingBox(),position=await button.boundingBox();assert(position.x>=parameters.x+parameters.width);
 await button.click();const panel=page.getByRole('dialog',{name:'Experimental features',exact:true}),enabled=panel.getByRole('switch',{name:'Active component appearance',exact:true}),disclosure=panel.getByRole('button',{name:'Active component appearance settings',exact:true});
 assert.equal(await enabled.getAttribute('aria-checked'),'false');assert.equal(await disclosure.getAttribute('aria-expanded'),'false');assert.equal(await panel.getByRole('checkbox').count(),0);
 await enabled.click();assert.equal(await enabled.textContent(),'On');assert.equal(await disclosure.getAttribute('aria-expanded'),'false','toggle does not expand section');
 await disclosure.click();assert(await panel.getByText('active-component-appearance',{exact:true}).isVisible());let previous=baseline;
 for(const style of ['soft-glow','rim-glow','height-gradient']){
  await panel.getByLabel('Active component appearance style',{exact:true}).selectOption(style);
  const image=await pixels();assert.notEqual(image,baseline,style+' must change the rendered surface');assert.notEqual(image,previous,style+' must be distinguishable');previous=image;
  await page.screenshot({path:'.cache/experiments-ui/'+style+'.png'});
 }
 await disclosure.click();assert.equal(await panel.getByLabel('Active component appearance style',{exact:true}).count(),0);
 await enabled.click();assert.equal(await pixels(),baseline,'Disabling restores the original rendering');
 await enabled.click();await disclosure.click();assert.equal(await panel.getByLabel('Active component appearance style',{exact:true}).inputValue(),'height-gradient');await panel.getByLabel('Active component shading strength',{exact:true}).focus();await page.keyboard.press('End');
 await page.reload();await page.locator('.component-select').first().waitFor();await page.locator('.component-select').first().click();await button.click();
 assert.equal(await enabled.getAttribute('aria-checked'),'true');await disclosure.click();assert.equal(await panel.getByLabel('Active component appearance style',{exact:true}).inputValue(),'height-gradient');assert.equal(Number(await panel.getByLabel('Active component shading strength',{exact:true}).inputValue()),1);
 await page.getByRole('button',{name:'Close experimental features'}).click();
 await page.getByRole('button',{name:'Tool operation',exact:true}).click();await page.getByLabel('Tool Profile Shape',{exact:true}).selectOption('rectangle');await page.getByLabel('Profile plane',{exact:true}).selectOption('XY');await page.getByLabel('Path distance',{exact:true}).fill('5');await page.getByLabel('Tool Effect Type',{exact:true}).selectOption('new');
 await page.waitForFunction(()=>[...document.querySelectorAll('.operation-panel-host button')].some(b=>b.textContent.trim()==='Apply operation'&&!b.disabled));
 await page.screenshot({path:'.cache/experiments-ui/preview.png'});
 await page.getByRole('button',{name:'Cancel tool operation',exact:true}).click();assert.equal(await readDocument(),before);
 await page.setViewportSize({width:390,height:844});await button.click();const box=await panel.boundingBox();assert(box.x>=0&&box.x+box.width<=390);await disclosure.click();await panel.getByRole('button',{name:'Reset this experiment'}).click();assert.equal(await enabled.getAttribute('aria-checked'),'false');
 await page.keyboard.press('Escape');assert.equal(await panel.count(),0);assert.equal(await page.locator('.component-select.selected').count(),0);
 assert.deepEqual(errors,[]);console.log('Passed: toolbar position, three distinct GPU styles, exact baseline restoration, persisted settings, valid native preview, unchanged document, reset and phone layout; no shader/JS errors.');
}catch(e){await page.screenshot({path:'.cache/experiments-ui/failure.png'});throw e;}finally{await browser.close();}

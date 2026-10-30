import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}});
await mkdir('.cache/history-resize-ui',{recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const height=async()=>(await page.locator('.timeline-panel').boundingBox()).height;
async function drag(delta){const box=await page.getByRole('separator',{name:'Resize feature history'}).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-delta,{steps:10});await page.mouse.up();}
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await page.evaluate(async()=>{
  const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};
  for(let i=0;i<12;i++){
   const s=await(await fetch('/api/state',{headers})).json();const job=await(await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({name:'feature.create',expected_revision:s.document.revision,args:{type:'box',name:'Part '+i}})})).json();
   for(let t=0;t<600;t++){const j=await(await fetch('/api/jobs/'+job.job_id,{headers})).json();if(j.status==='complete')break;if(j.status==='failed')throw Error(JSON.stringify(j.error));await new Promise(r=>setTimeout(r,50));}
  }
 });
 await page.waitForFunction(()=>document.querySelectorAll('.history-slot').length===12);
 const initial=await height();await drag(180);assert(Math.abs(await height()-initial-180)<3);
 await page.getByRole('button',{name:'Separate part timelines'}).click();assert(Math.abs(await height()-initial-180)<3);
 await drag(-120);const smaller=await height();assert(smaller<initial+80);
 const scroll=await page.locator('.feature-history-scroll').evaluate(e=>({vertical:e.scrollHeight>e.clientHeight,horizontal:e.scrollWidth>e.clientWidth,width:getComputedStyle(e).scrollbarWidth}));
 assert(scroll.vertical&&scroll.horizontal);assert.equal(scroll.width,'auto');
 await page.locator('.feature-history-scroll').evaluate(e=>{e.scrollTop=140;e.scrollLeft=120;});
 const offset=await page.locator('.feature-history-scroll').evaluate(e=>[e.scrollLeft,e.scrollTop]);assert(offset.every(n=>n>0));
 await page.screenshot({path:'.cache/history-resize-ui/resized.png'});
 const handle=page.getByRole('separator',{name:'Resize feature history'});await handle.focus();await page.keyboard.press('ArrowUp');assert(Math.abs(await height()-smaller-20)<3);
 await handle.dblclick();assert.equal(await page.locator('.app-shell').getAttribute('data-history-sized'),null);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Show history',exact:true}).click();const phone=await height();await drag(60);assert(Math.abs(await height()-phone-60)<3);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Passed: drag up/down, split-lane sizing, horizontal/vertical overflow scrolling, keyboard resizing, reset, portrait phone sizing and no JavaScript errors.');
}catch(e){await page.screenshot({path:'.cache/history-resize-ui/failure.png'});throw e;}finally{await browser.close();}

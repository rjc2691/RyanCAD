import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1550,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await page.getByRole('button',{name:'Tool operation',exact:true}).click();await page.getByLabel('Tool Profile Shape',{exact:true}).selectOption('rectangle');await page.getByLabel('Profile plane',{exact:true}).selectOption('XY');await page.getByLabel('Profile width',{exact:true}).fill('80');await page.getByLabel('Profile height',{exact:true}).fill('80');await page.getByLabel('Path distance',{exact:true}).fill('5');
 await page.waitForFunction(()=>[...document.querySelectorAll('.operation-panel-host button')].some(b=>b.textContent.trim()==='Apply operation'&&!b.disabled));await page.getByRole('button',{name:/Fit design/}).click();await page.waitForTimeout(300);
 const sample=()=>page.locator('[data-guide=profile-label]').evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y')),text:el.textContent}));
 const initial=await sample();assert.equal(initial.text,'Tool Profile');
 const rect=await page.locator('.canvas-host').boundingBox();let previous=initial;
 await page.mouse.move(rect.x+rect.width*.72,rect.y+rect.height*.72);await page.mouse.down();for(let i=1;i<=15;i++){await page.mouse.move(rect.x+rect.width*.72+i*.3,rect.y+rect.height*.72+i*.2);await page.waitForTimeout(20);const current=await sample();assert(Math.hypot(current.x-previous.x,current.y-previous.y)<40,'label jumped across opposite corners');previous=current;}await page.mouse.up();
 const points=await page.evaluate(()=>new Promise(resolve=>{const samples=[];function sample(){const e=document.querySelector('[data-guide=profile-label]');samples.push([Number(e.getAttribute('x')),Number(e.getAttribute('y'))]);if(samples.length===120)resolve(samples);else requestAnimationFrame(sample);}requestAnimationFrame(sample);}));
 for(let i=1;i<points.length;i++)assert(Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])<40);
 await page.screenshot({path:'artifacts/stable-tool-profile-label.png'});await page.getByRole('button',{name:'Cancel tool operation',exact:true}).click();assert.deepEqual(errors,[]);console.log('Passed: symmetric profile label remains on one corner through slight orbit, damping and 120 rendered frames; no JS errors.');
}catch(e){await page.screenshot({path:'.cache/profile-label-stability/failure.png'});throw e;}finally{await browser.close();}

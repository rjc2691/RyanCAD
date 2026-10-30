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
const point=async(id)=>page.locator(`[data-sketch="${id}"]`).evaluate(el=>{const r=el.ownerSVGElement.getBoundingClientRect(),v=el.getAttribute('transform').match(/[-+]?[0-9]*\.?[0-9]+/g).map(Number);return [r.x+v[0],r.y+v[1]];});
const line=async(id)=>page.locator(`path[data-sketch="${id}"]`).evaluate(el=>{const r=el.ownerSVGElement.getBoundingClientRect(),v=el.getAttribute('d').match(/[-+]?[0-9]*\.?[0-9]+/g).map(Number);return [r.x+v[0]*.7+v[2]*.3,r.y+v[1]*.7+v[3]*.3];});
try{
 await page.goto('http://127.0.0.1:8898');await page.locator('.project-structure').waitFor();
 await command('sketch.create',{name:'Move sketch',entities:[{id:'a',type:'line',x1:0,y1:0,x2:20,y2:0},{id:'b',type:'line',x1:20,y1:0,x2:20,y2:10},{id:'p',type:'point',x:8,y:8,fixed:true}],constraints:[{type:'coincident',a:'a.end',b:'b.start'},{type:'distance',a:'a.start',b:'a.end',value:20}]});
 await page.reload();await page.getByRole('button',{name:'Move sketch',exact:true}).dblclick();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor();
 await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');
 await page.mouse.click(...await point('a:end'));await page.waitForFunction(()=>document.querySelector('[data-sketch="a:end"]')?.classList.contains('selected'));
 assert(!(await page.locator('path[data-sketch="a"]').getAttribute('class')).includes('selected'));
 await page.keyboard.press('m');await page.getByRole('button',{name:'Move to coordinates',exact:true}).waitFor();await page.getByLabel('Sketch U',{exact:true}).fill('25');await page.getByLabel('Sketch V',{exact:true}).fill('5');await page.getByRole('button',{name:'Move to coordinates',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');
 assert(Math.abs(Number(await page.getByLabel('Entity x2',{exact:true}).inputValue())-25)<1e-5);assert(Math.abs(Number(await page.getByLabel('Entity y2',{exact:true}).inputValue())-5)<1e-5);
 const a=await point('a:end'),b=await point('b:start');assert(Math.hypot(a[0]-b[0],a[1]-b[1])<.01);
 // Move a standalone point, then translate a whole line.
 await page.mouse.click(...await point('p:point'));await page.keyboard.press('m');await page.getByRole('button',{name:'Move to coordinates',exact:true}).waitFor();await page.getByLabel('Sketch U',{exact:true}).fill('12');await page.getByLabel('Sketch V',{exact:true}).fill('12');await page.getByRole('button',{name:'Move to coordinates',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');assert(Math.abs(Number(await page.getByLabel('Entity x',{exact:true}).inputValue())-12)<1e-5);
 await page.mouse.click(...await line('b'));await page.waitForFunction(()=>document.querySelector('path[data-sketch="b"]')?.classList.contains('selected'));
 const bx1=Number(await page.getByLabel('Entity x1',{exact:true}).inputValue()),by1=Number(await page.getByLabel('Entity y1',{exact:true}).inputValue()),bx2=Number(await page.getByLabel('Entity x2',{exact:true}).inputValue()),by2=Number(await page.getByLabel('Entity y2',{exact:true}).inputValue());
 await page.keyboard.press('m');await page.getByRole('button',{name:'Move to coordinates',exact:true}).waitFor();await page.getByLabel('Sketch U',{exact:true}).fill(String((bx1+bx2)/2+5));await page.getByLabel('Sketch V',{exact:true}).fill(String((by1+by2)/2+5));await page.getByRole('button',{name:'Move to coordinates',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');assert(Math.abs(Number(await page.getByLabel('Entity x1',{exact:true}).inputValue())-(bx1+5))<1e-5);
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 const before=await page.locator('path[data-sketch="b"]').getAttribute('d');await page.keyboard.press('m');await page.mouse.move(950,420);await page.waitForTimeout(250);await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');await page.waitForFunction(expected=>document.querySelector('path[data-sketch="b"]')?.getAttribute('d')===expected,before);
 // Space also cancels the viewport dimension editor while its input is focused.
 await page.mouse.click(...await line('a'));await page.keyboard.press('d');const dimension=page.getByLabel('Viewport dimension length',{exact:true});await dimension.waitFor();await dimension.fill('24');await page.waitForFunction(()=>document.querySelector('[data-measurement="length:a"] text')?.textContent.includes('24 mm'));await page.keyboard.press('Space');await dimension.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('[data-measurement="length:a"] text')?.textContent.includes('20 mm'));
 // Space clears an unfinished drawing chain without closing the sketch.
 await page.keyboard.press('l');await page.mouse.click(900,550);await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=sketch_select]')?.getAttribute('aria-pressed')==='true');assert.equal(await page.locator('.sketch-viewport-guide path.sketch-entity').count(),3);
 await page.getByRole('button',{name:'Finish sketch',exact:true}).first().click();await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor({state:'detached'});
 const state=await request('/state'),feature=Object.values(state.document.features).find(f=>f.name==='Move sketch');assert(!feature.options.constraints.some(c=>c.type==='fix'));assert(feature.options.constraints.some(c=>c.type==='coincident'));assert.deepEqual(errors,[]);console.log('Passed: separate endpoint selection, constrained point and whole-line moves, standalone points, Space cancellation, and no persistent temporary constraints.');
}catch(e){await page.screenshot({path:'.cache/sketch-move-failure.png'});throw e;}finally{await browser.close();}

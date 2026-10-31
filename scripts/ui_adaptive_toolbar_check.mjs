import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:2600,height:1100}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const request=(path,body)=>page.evaluate(async({path,body})=>{
 const id=sessionStorage.getItem('ryancad-active-design'),headers={'Content-Type':'application/json',...(id?{'X-RyanCAD-Design':id}:{})};
 const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;
},{path,body});
async function command(name,args={}){const state=await request('/state'),submitted=await request('/commands',{name,args,expected_revision:state.document.revision});for(let n=0;n<1000;n++){const job=await request('/jobs/'+submitted.job_id);if(job.status==='complete')return job.result;if(['failed','cancelled'].includes(job.status))throw Error(JSON.stringify(job));await page.waitForTimeout(40);}throw Error('Job timeout');}
const bounds=async()=>{const a={};for(const [key,selector]of Object.entries({header:'.app-header',left:'.left-panel',right:'.inspector-panel',tools:'.tool-strip',content:'.tool-strip-content',viewport:'.viewport-area'})){a[key]=await page.locator(selector).boundingBox();}return a;};
const layout=async(mode)=>page.waitForFunction(mode=>document.querySelector('.app-shell')?.dataset.toolbarLayout===mode,mode);
try{
 await page.addInitScript(()=>localStorage.setItem('ryancad-experiments-v1',JSON.stringify({version:1,'sidebar-toolbar-layout':{enabled:false,mode:'inset-buttons'}})));
 await page.goto('http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();await layout('between');
 let b=await bounds();assert.equal(b.tools.x,0);assert.equal(b.tools.width,2600);assert.equal(b.tools.y,b.header.y+b.header.height);assert.equal(b.left.y,b.tools.y+b.tools.height);assert.equal(b.right.y,b.left.y);assert.equal(b.content.x,b.left.width);assert.equal(b.content.x+b.content.width,b.right.x);
 await page.getByRole('button',{name:'Experimental features',exact:true}).click();assert.equal(await page.getByRole('switch',{name:'Toolbar between sidebars',exact:true}).count(),0);assert.equal(await page.getByRole('switch',{name:'Active component appearance',exact:true}).getAttribute('aria-checked'),'false');await page.getByRole('button',{name:'Close experimental features',exact:true}).click();
 await page.screenshot({path:'.cache/toolbar-adaptive-wide.png'});
 await page.setViewportSize({width:1600,height:1000});await layout('inset');b=await bounds();assert(b.content.x>0&&b.content.x<b.left.width);assert(b.content.x+b.content.width>b.right.x&&b.content.x+b.content.width<1600);assert.equal(b.tools.x,0);assert.equal(b.tools.width,1600);assert.equal(b.left.y,b.tools.y+b.tools.height);assert.equal(b.right.y,b.left.y);assert(b.tools.width>b.viewport.width);
 await page.screenshot({path:'.cache/toolbar-adaptive-compact.png'});
 await page.setViewportSize({width:1100,height:900});await layout('full-width');let tools=await page.locator('.tool-strip-content').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert(tools.scroll>tools.client);await page.getByRole('button',{name:'Workspace settings',exact:true}).scrollIntoViewIfNeeded();assert(await page.getByRole('button',{name:'Workspace settings',exact:true}).isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1600,height:1000});await page.getByRole('button',{name:'Hide component panel',exact:true}).click();await page.getByRole('button',{name:'Hide inspector',exact:true}).click();await layout('between');await page.getByRole('button',{name:'Show structure',exact:true}).click();await page.getByRole('button',{name:'Show inspector',exact:true}).click();await layout('inset');
 await page.setViewportSize({width:2600,height:1100});await layout('between');await page.getByRole('button',{name:'Measure',exact:true}).click();const panel=page.getByRole('complementary',{name:'Measure workspace'});await panel.waitFor();const pb=await panel.boundingBox(),t=await page.locator('.tool-strip').boundingBox();assert.equal(pb.y,t.y+t.height);await panel.getByRole('button',{name:'Done',exact:true}).click();
 // The same measured layout follows the larger sketch toolbar and its return to modeling.
 await command('sketch.create',{name:'Adaptive sketch',entities:[{id:'a',type:'line',x1:0,y1:0,x2:20,y2:0}]});await page.reload();await page.getByRole('button',{name:'Adaptive sketch',exact:true}).dblclick();await page.getByRole('navigation',{name:'Sketch tools',exact:true}).waitFor();await page.setViewportSize({width:1100,height:900});await layout('full-width');assert.equal((await page.locator('.tool-strip').boundingBox()).width,1100);await page.getByRole('button',{name:'Cancel sketch',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Cancel sketch',exact:true}).click();await page.getByRole('navigation',{name:'Modeling tools',exact:true}).waitFor();
 await page.setViewportSize({width:1000,height:900});await layout("full-width");assert.equal((await page.locator(".tool-strip").boundingBox()).width,1000);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const mobile=await page.locator('.tool-strip').boundingBox();assert.equal(mobile.x,0);assert.equal(mobile.width,390);
 await page.setViewportSize({width:2600,height:1100});await layout('between');await page.reload();await layout('between');assert.deepEqual(errors,[]);
 console.log('Passed: permanent toolbar layout, ignored legacy preferences, measured full-row overflow, horizontal scrolling, hidden sidebars, operation and sketch panels, resize restoration, and mobile layout.');
}catch(e){await page.screenshot({path:'.cache/adaptive-toolbar-failure.png'});throw e;}finally{await browser.close();}

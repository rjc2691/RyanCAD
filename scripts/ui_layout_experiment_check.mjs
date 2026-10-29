import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const open=()=>page.getByRole('button',{name:'Experimental features',exact:true}).click();
const toggle=page.getByRole('switch',{name:'Toolbar between sidebars',exact:true});
const bounds=async()=>{const a={};for(const [key,selector]of Object.entries({header:'.app-header',left:'.left-panel',right:'.inspector-panel',tools:'.tool-strip',viewport:'.viewport-area'})){a[key]=await page.locator(selector).boundingBox();}return a;};
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 const original=await bounds();await open();assert.equal(await toggle.getAttribute('aria-checked'),'false');await toggle.click();
 const b=await bounds();assert.equal(b.left.y,b.header.y+b.header.height);assert.equal(b.right.y,b.left.y);assert.equal(b.tools.x,b.left.x+b.left.width);assert.equal(b.tools.x+b.tools.width,b.right.x);assert.equal(b.tools.y,b.left.y);
 assert.equal(await page.getByRole('switch',{name:'Active component appearance',exact:true}).getAttribute('aria-checked'),'false');
 await page.getByRole('button',{name:'Close experimental features'}).click();await page.screenshot({path:'artifacts/toolbar-between-sidebars.png'});
 await page.reload();await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.sidebarToolbarLayout==='true');
 await page.getByRole('button',{name:'Measure',exact:true}).click();const operation=await page.getByRole('complementary',{name:'Measure workspace'}).boundingBox(),header=await page.locator('.app-header').boundingBox();assert.equal(operation.y,header.y+header.height);await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const tool=await page.locator('.tool-strip').boundingBox();assert.equal(tool.x,0);assert.equal(tool.width,390);
 await page.setViewportSize({width:1600,height:1000});await open();await toggle.click();const restored=await bounds();assert.deepEqual(restored,original);assert.deepEqual(errors,[]);
 console.log('Passed: sidebars reach header, toolbar spans middle, independent/default-off/persistent setting, operation panel alignment, mobile fallback and exact layout restoration.');
}finally{await browser.close();}


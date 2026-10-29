import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const blocked=await browser.newContext({viewport:{width:1400,height:950}}),page=await blocked.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){
     if(['webgl','webgl2','experimental-webgl'].includes(type))return null;
     return original.call(this,type,...args);
   };
 });
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898');
 await page.getByRole('heading',{name:'3D graphics unavailable',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 assert.equal(await page.locator('.canvas-host canvas').count(),0);
 await page.getByRole('button',{name:'Import',exact:true}).click();
 assert(await page.getByRole('menuitem',{name:/Reference designs/}).isVisible());
 await page.screenshot({path:'artifacts/webgl-unavailable.png'});
 assert.deepEqual(errors,[],'Missing WebGL must not throw an uncaught error or unmount the app');
 const normal=await browser.newPage();await normal.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898');
 await normal.locator('.canvas-host canvas').waitFor();assert.equal(await normal.getByRole('heading',{name:'3D graphics unavailable'}).count(),0);
 console.log('Passed: blocked WebGL shows recovery guidance, workspace and menus remain accessible, no uncaught error; normal renderer still starts.');
}finally{await browser.close();}

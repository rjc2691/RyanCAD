// Isolated headless browser only. Instrument actual canvas clears and GPU draws.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{
 const stats=window.resizeStats={enabled:false,inFrame:0,clears:0,outside:0,blank:0,reset:false,drawn:false};
 const raf=window.requestAnimationFrame.bind(window);
 window.requestAnimationFrame=callback=>raf(time=>{stats.inFrame++;stats.reset=false;stats.drawn=false;try{return callback(time);}finally{if(stats.enabled&&stats.reset&&!stats.drawn)stats.blank++;stats.inFrame--;}});
 for(const key of ['width','height']){
  const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key);
  Object.defineProperty(HTMLCanvasElement.prototype,key,{...descriptor,set(value){if(stats.enabled&&this.matches('.canvas-host canvas')){stats.clears++;stats.reset=true;if(!stats.inFrame)stats.outside++;}return descriptor.set.call(this,value);}});
 }
 for(const ctor of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(ctor)for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
  const original=ctor.prototype[name];if(!original)continue;ctor.prototype[name]=function(...args){if(this.canvas.matches('.canvas-host canvas'))stats.drawn=true;return original.apply(this,args);};
 }
});
try{
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();await page.waitForTimeout(300);
 await page.evaluate(()=>{window.originalCanvas=document.querySelector('.canvas-host canvas');window.resizeStats.enabled=true;});
 for(let i=0;i<14;i++){await page.setViewportSize({width:1250+i*25,height:830+i*9});await page.waitForTimeout(25);}
 const handle=page.getByRole('separator',{name:'Resize feature history'}),box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y-150,{steps:20});await page.mouse.up();
 await page.getByRole('button',{name:'Hide component panel',exact:true}).click();await page.getByRole('button',{name:'Show structure',exact:true}).click();
 await page.getByRole('button',{name:'Hide inspector',exact:true}).click();await page.getByRole('button',{name:'Show inspector',exact:true}).click();await page.waitForTimeout(250);
 const stats=await page.evaluate(()=>({...window.resizeStats,sameCanvas:window.originalCanvas===document.querySelector('.canvas-host canvas')}));assert(stats.clears>=8);assert.equal(stats.outside,0);assert.equal(stats.blank,0);assert(stats.sameCanvas);
 const size=await page.locator('.canvas-host canvas').evaluate(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,dpr:Math.min(devicePixelRatio,2)}));assert.equal(size.width,Math.floor(size.cssWidth*size.dpr));assert.equal(size.height,Math.floor(size.cssHeight*size.dpr));assert.deepEqual(errors,[]);
 await page.screenshot({path:'.cache/viewport-resize-fixed.png'});console.log('Passed: window/history/sidebar resizing; all buffer clears occur inside rendered frames, no blank resized frames, same canvas retained, backing size matches layout.',JSON.stringify(stats));
}finally{await browser.close();}

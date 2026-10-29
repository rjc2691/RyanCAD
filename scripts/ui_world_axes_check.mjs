import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1550,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');await page.waitForTimeout(200);
 const r=await page.locator('.canvas-host').boundingBox(),camera=new THREE.OrthographicCamera(-80*r.width/r.height,80*r.width/r.height,80,-80,.1,10000);camera.up.set(0,0,1);camera.position.set(150,-220,165);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const project=p=>{const v=new THREE.Vector3(...p).project(camera);return [(v.x+1)*r.width/2,(1-v.y)*r.height/2];};
 const samples=[];for(let axis=0;axis<3;axis++)for(const sign of [1,-1]){const p=[0,0,0];p[axis]=35*sign;samples.push({axis,sign,p:project(p)});}
 const values=await page.locator('.canvas-host canvas').evaluate((c,samples)=>{const copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;const ctx=copy.getContext('2d');ctx.drawImage(c,0,0);return samples.map(s=>{const x=Math.round(s.p[0]*c.width/c.clientWidth),y=Math.round(s.p[1]*c.height/c.clientHeight),pixels=ctx.getImageData(x-2,y-2,5,5).data;let contrast=0;for(let i=0;i<pixels.length;i+=4)contrast=Math.max(contrast,Math.abs(pixels[i]-23)+Math.abs(pixels[i+1]-29)+Math.abs(pixels[i+2]-38));return {...s,contrast};});},samples);
 for(let i=0;i<3;i++){const p=values.find(s=>s.axis===i&&s.sign===1),n=values.find(s=>s.axis===i&&s.sign===-1);assert(p.contrast>n.contrast+25);assert(n.contrast>10,'negative axis must remain visible');}
 for(const s of samples){await page.mouse.move(r.x+s.p[0],r.y+s.p[1]);await page.waitForTimeout(50);assert((await page.locator('.viewport-hover-target').textContent()).includes(`World ${'XYZ'[s.axis]} axis`));}
 await page.mouse.move(r.x+10,r.y+r.height-10);await page.screenshot({path:'artifacts/world-axis-visibility.png'});assert.deepEqual(errors,[]);console.log('Passed: all positive axes are stronger than visible negative counterparts; both halves retain axis hover targets; no JS errors.');
}finally{await browser.close();}

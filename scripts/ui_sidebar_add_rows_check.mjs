import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 const rows=page.locator('.left-panel .sidebar-add-row');assert.deepEqual((await rows.allTextContents()).map(s=>s.trim()),['add component','add sketch','add tool']);
 const styles=await rows.evaluateAll(els=>els.map(e=>({padding:getComputedStyle(e).padding,height:e.getBoundingClientRect().height,left:e.getBoundingClientRect().left,border:getComputedStyle(e).borderTopStyle,font:getComputedStyle(e.querySelector('span')).fontStyle})));
 assert(styles.every(s=>s.height===26&&s.border==='dashed'&&s.font==='italic'&&s.left===styles[0].left&&s.padding===styles[0].padding));
 assert.equal(await page.locator('.structure-section .sidebar-add-row').count(),0);
 await page.getByRole('button',{name:'New sketch',exact:true}).click();await page.getByLabel('Sketch plane',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('treeitem',{name:'add component',exact:true}).click();await page.locator('.component-select').first().waitFor();
 await page.getByRole('button',{name:'New 3D tool body',exact:true}).click();await page.locator('.tool-library-row').first().waitFor();
 assert.equal(await rows.count(),3);await page.screenshot({path:'artifacts/sidebar-add-rows.png'});assert.deepEqual(errors,[]);
 console.log('Passed: matched compact italic/dashed add rows, aligned indentation, no header add duplicates, sketch/component/tool actions.');
}finally{await browser.close();}

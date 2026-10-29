// Run only against an isolated server/project. Each example gets its own browser workspace.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
try{
 for(const [label,expected,parts] of [
  ['Silicone mold tooling','Silicone mold · printed tooling',4],
  ['Mounting plate & pins','Mounting plate · fit study',3],
 ]){
  const context=await browser.newContext(),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(process.env.RYANCAD_UI_URL || 'http://127.0.0.1:8898');
  await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
  const original=await page.evaluate(()=>sessionStorage.getItem('ryancad-active-design'));
  await page.getByRole('button',{name:'Import',exact:true}).click();
  await page.getByRole('menuitem',{name:/Reference designs/}).click();
  await page.getByRole('button',{name:new RegExp(label)}).click();
  await page.waitForFunction(name=>document.querySelector('.error-card')||document.querySelector('.design-tree-name')?.textContent===name,expected,{timeout:60000});
  assert.equal(await page.locator('.error-card').count(),0,await page.locator('.error-card').allTextContents());
  const result=await page.evaluate(async original=>{
   const current=sessionStorage.getItem('ryancad-active-design');
   const get=async id=>(await fetch('/api/state',{headers:{'X-RyanCAD-Design':id}})).json();
   const [before,after]=await Promise.all([get(original),get(current)]);
   return {different:current!==original,before:before.document.revision,parts:after.summary.instances,
    shapes:Object.values(after.geometry).filter(g=>g.status==='valid').length};
  },original);
  assert(result.different);assert.equal(result.before,0);assert.equal(result.parts,parts);assert(result.shapes>0);
  await page.reload();
  await page.waitForFunction(name=>document.querySelector('.design-tree-name')?.textContent===name,expected);
  assert.deepEqual(errors,[]);
  console.log(`Passed: ${label} loads through the menu, builds geometry, keeps the original design and survives refresh.`);
  await context.close();
 }
}finally{await browser.close();}

// Warm input-to-visible-preview latency. Isolated project only; first run creates a plate.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:980}});
const panel=page.getByRole('complementary',{name:'Tool operation workspace'});
const ready=async()=>{await page.locator('.operation-preview-status').filter({hasText:'Preview validated'}).waitFor({timeout:45000});await page.waitForFunction(()=>!document.querySelector('.operation-commit-row .primary')?.disabled);};
try{
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8796');await page.locator('.structure-root').waitFor();
 const state=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
 assert(Object.keys(state.document.features).length<=1,'Use the isolated latency fixture.');
 if(!Object.keys(state.document.features).length){
   await page.locator('button[aria-label="Tool operation"]').click();await panel.getByLabel('Profile width',{exact:true}).fill('60');await panel.getByLabel('Profile height',{exact:true}).fill('40');
   await panel.locator('[data-tool-section="path"]').scrollIntoViewIfNeeded();await panel.getByLabel('Path distance',{exact:true}).fill('6');await ready();await panel.getByRole('button',{name:'Apply operation',exact:true}).click();await panel.waitFor({state:'hidden'});
 }
 const saved=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));await page.locator(`.canvas-host[data-ready-revision="${saved.document.revision}"]`).waitFor();
 await page.getByRole('button',{name:'Top',exact:true}).click();const b=await page.locator('.canvas-host').boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.keyboard.press('t');await panel.waitFor();
 await panel.locator('[data-tool-section="effect"]').scrollIntoViewIfNeeded();await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('add');await panel.locator('[data-tool-section="path"]').scrollIntoViewIfNeeded();await ready();
 const samples=[];for(const value of ['7.1','8.2','9.3','10.4','11.5','12.6']){const start=performance.now();await panel.getByLabel('Path distance',{exact:true}).fill(value);await ready();samples.push(performance.now()-start);}
 const sorted=[...samples].sort((a,b)=>a-b),result={label:process.env.BENCH_LABEL||'current',samples_ms:samples,median_ms:sorted[Math.floor(sorted.length/2)],max_ms:sorted.at(-1),fixture:'60×40×6 mm plate, whole-face addition; 1440×980 headless Edge; warm worker; unique inputs; includes debounce, native evaluation, polling and mesh display'};
 await page.keyboard.press('Escape');assert.equal((await page.evaluate(()=>fetch('/api/state').then(r=>r.json()))).document.revision,saved.document.revision);
 await fs.mkdir('artifacts',{recursive:true});await fs.writeFile(`artifacts/preview-latency-${result.label}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}

import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1700,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const settings=page.getByRole('dialog',{name:'Workspace preferences'});
const order=()=>page.locator('.tool-strip [data-toolbar-action]').evaluateAll(els=>els.map(e=>e.dataset.toolbarAction));
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await page.getByRole('button',{name:'Workspace settings',exact:true}).click();await settings.getByRole('button',{name:'Edit shortcut for Measure',exact:true}).click();await page.keyboard.press('o');assert.equal(await settings.getByRole('button',{name:'Edit shortcut for Measure',exact:true}).textContent(),'O');
 await settings.getByRole('button',{name:'Edit shortcut for Parameters',exact:true}).click();await page.keyboard.press('o');assert(await settings.getByRole('alert').textContent().then(t=>t.includes('Measure')));assert.equal(await settings.getByRole('button',{name:'Edit shortcut for Measure',exact:true}).textContent(),'O');
 await settings.getByRole('button',{name:'Replace conflicting shortcut',exact:true}).click();assert.equal(await settings.getByRole('button',{name:'Edit shortcut for Measure',exact:true}).textContent(),'Unassigned');await settings.getByRole('button',{name:'Done',exact:true}).click();
 assert.equal(await page.locator('[data-toolbar-action=parameters] kbd').textContent(),'O');await page.keyboard.press('o');await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').count(),1);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.reload();await page.waitForFunction(()=>document.querySelector('[data-toolbar-action=parameters]')?.getAttribute('aria-keyshortcuts')==='O');
 const original=await order();await page.locator('[data-toolbar-action=measure]').dragTo(page.locator('[data-toolbar-action=tool]'));assert.equal((await order())[0],'measure');assert.equal(await page.locator('.operation-panel').count(),0);await page.reload();await page.waitForFunction(()=>document.querySelector('.tool-strip [data-toolbar-action]')?.dataset.toolbarAction==='measure');
 await page.getByRole('button',{name:'Workspace settings',exact:true}).click();await settings.getByRole('button',{name:'Reset shortcuts to defaults',exact:true}).click();await settings.getByRole('button',{name:'Reset toolbar order',exact:true}).click();await settings.getByRole('button',{name:'Done',exact:true}).click();assert.deepEqual(await order(),original);assert.equal(await page.locator('[data-toolbar-action=parameters] kbd').textContent(),'P');assert.equal(await page.locator('.tool-strip [data-toolbar-action=parameters]').evaluate(e=>e.previousElementSibling?.classList.contains('tool-divider')),false);
 await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.toolbarLayout==='full-width');
 const nav=await page.locator('.tool-strip').boundingBox();assert.equal(nav.x,0);assert.equal(nav.width,1700);
 assert.deepEqual(errors,[]);console.log('Passed: shortcut capture, conflict confirmation and clearing, live labels/dispatch, persistence, real drag reorder, reset controls, removed divider and permanent adaptive toolbar layout.');
}catch(e){await page.screenshot({path:'.cache/toolbar-keys/preferences-failure.png'});throw e;}finally{await browser.close();}

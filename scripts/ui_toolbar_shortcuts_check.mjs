import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {TOOLBAR_SHORTCUTS} from '../frontend/src/toolbarShortcuts.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await page.evaluate(()=>{window.shortcutClicks=[];for(const button of document.querySelectorAll('button[data-toolbar-action]'))button.addEventListener('click',e=>{if(window.trackToolbar){window.shortcutClicks.push(button.dataset.toolbarAction);e.preventDefault();e.stopImmediatePropagation();}},true);window.trackToolbar=true;});
 for(const [id,s]of Object.entries(TOOLBAR_SHORTCUTS).filter(([id])=>!id.startsWith('sketch_'))){
  assert.equal(await page.locator(`button[data-toolbar-action="${id}"]`).count(),1,id);
  const chord=(s.command?'Control+':'')+(s.shift?'Shift+':'')+(s.code==='Comma'?',':s.code.slice(3).toLowerCase());await page.keyboard.press(chord);
  assert.equal(await page.evaluate(()=>window.shortcutClicks.at(-1)),id);
 }
 await page.evaluate(()=>{window.trackToolbar=false;});
 await page.keyboard.press('Shift+b');await page.getByRole('dialog',{name:'Bug reports',exact:true}).waitFor();await page.getByRole('button',{name:'New report',exact:true}).click();
 await page.getByLabel('Title',{exact:true}).fill('pitemg');assert.equal(await page.locator('.operation-panel').count(),0);await page.keyboard.press('Escape');
 await page.keyboard.press('t');await page.locator('.operation-panel').waitFor();await page.evaluate(()=>{window.trackToolbar=true;window.shortcutClicks=[];});await page.keyboard.press('Shift+i');assert.deepEqual(await page.evaluate(()=>window.shortcutClicks),[]);await page.evaluate(()=>{window.trackToolbar=false;});await page.keyboard.press('Escape');
 await page.keyboard.press('e');await page.getByLabel('Sketch plane',{exact:true}).waitFor();await page.getByLabel('Sketch plane',{exact:true}).selectOption('XZ');await page.keyboard.press('p');assert.equal(await page.getByRole('button',{name:'Sketch Point',exact:true}).getAttribute('aria-pressed'),'true');await page.keyboard.press('d');assert.equal(await page.getByRole('button',{name:'Sketch Dimension',exact:true}).getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);console.log('Passed: all 17 toolbar shortcuts activate their matching button; text entry and disabled controls are respected; sketch P/D retain their meanings.');
}finally{await browser.close();}

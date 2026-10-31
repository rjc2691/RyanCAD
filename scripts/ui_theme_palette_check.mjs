// Isolated headless test; never attaches to an existing browser session.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const palette=()=>page.getByRole('dialog',{name:'Experimental features',exact:true});
const open=async()=>{await page.getByRole('button',{name:'Experimental features',exact:true}).click();await palette().getByRole('button',{name:'Dark UI palette settings',exact:true}).click();};
const document=()=>page.evaluate(async()=>JSON.stringify((await(await fetch('/api/state',{headers:{'X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')}})).json()).document));
try{
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();
 const before=await document(),baseline=await page.locator('.app-header').evaluate(el=>getComputedStyle(el).backgroundColor);
 await open();const toggle=palette().getByRole('switch',{name:'Dark UI palette',exact:true});assert.equal(await toggle.getAttribute('aria-checked'),'false');assert(await palette().getByRole('radio',{name:/Graphite/}).isDisabled());await toggle.click();
 const panels=new Set();
 for(const [name,id] of [['Midnight','midnight'],['Graphite','graphite'],['Tide','tide'],['Aubergine','aubergine'],['Monochrome Light','monochrome-light'],['Monochrome Dark','monochrome-dark'],['Forest','forest']]){
  await palette().getByRole('radio',{name:new RegExp(name)}).check();await page.waitForFunction(id=>document.documentElement.dataset.uiTheme===id,id);
  panels.add(await page.locator('.left-panel').evaluate(el=>getComputedStyle(el).backgroundColor));
 }
 assert.equal(panels.size,7);await palette().getByRole('button',{name:'Close experimental features',exact:true}).click();await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.uiTheme==='forest');
 await open();assert(await palette().getByRole('radio',{name:/Forest/}).isChecked());await page.screenshot({path:'.cache/dark-palette-forest.png'});
 await palette().getByRole('switch',{name:'Dark UI palette',exact:true}).click();await page.waitForFunction(()=>!document.documentElement.dataset.uiTheme);assert.equal(await page.locator('.app-header').evaluate(el=>getComputedStyle(el).backgroundColor),baseline);
 assert.equal(await document(),before);assert.deepEqual(errors,[]);
 console.log('Passed: seven distinct live palettes, persisted choice, disabled controls, original theme restored, no document edits or browser errors.');
}finally{await browser.close();}

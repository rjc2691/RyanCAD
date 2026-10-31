// Isolated application test, never attaches to the user's browser.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const editor=()=>page.locator('.viewport-context .eyebrow');
const state=()=>page.evaluate(async()=>{const id=sessionStorage.getItem('ryancad-active-design');return(await fetch('/api/state',{headers:{'X-RyanCAD-Design':id}})).json();});
try{
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();
 const library=page.getByRole('tree',{name:'Reusable parts',exact:true});
 for(let n=1;n<=2;n++){await page.getByRole('button',{name:'Add part',exact:true}).click();await library.getByText('Part '+n,{exact:true}).waitFor();}
 const before=await state();await page.getByRole('button',{name:'Place part in layout',exact:true}).click();const form=page.getByRole('form',{name:'Place linked part',exact:true});await form.waitFor();assert(await form.evaluate(el=>el.previousElementSibling.classList.contains('section-heading')&&el.previousElementSibling.textContent.includes('Layout Tree')&&el.nextElementSibling.getAttribute('aria-label')==='Layout parts'));
 await library.getByText('Part 1',{exact:true}).dblclick();assert.equal(await editor().textContent(),'Layout Editor');assert.equal(await form.getByLabel('Part to place').locator('option:checked').textContent(),'Part 1');assert.equal(await library.locator('[data-placement-selected=true]').count(),1);assert.equal((await state()).document.revision,before.document.revision);
 await form.getByLabel('Part to place').selectOption({label:'Part 2'});assert.equal(await library.locator('[data-placement-selected=true] .structure-name').textContent(),'Part 2');await form.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await form.count(),0);assert.equal((await state()).document.revision,before.document.revision);
 await page.getByRole('button',{name:'Place part in layout',exact:true}).click();await library.getByText('Part 1',{exact:true}).click();await form.getByRole('button',{name:'Place',exact:true}).click();await page.getByRole('tree',{name:'Layout parts',exact:true}).getByText('Part 1',{exact:true}).waitFor();assert.equal(await form.count(),0);
 await library.getByText('Part 1',{exact:true}).dblclick();assert.equal(await editor().textContent(),'Part Editor');assert.deepEqual(errors,[]);
 console.log('Passed: placement form at top of Layout Tree, click/double-click picks without entering editor or changing document, dropdown synchronization, cancel, commit, and normal editing restored.');
}catch(e){await page.screenshot({path:'.cache/part-placement-failure.png'});throw e;}finally{await browser.close();}

// Run only against an isolated --demo mold project; this test makes durable edits.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [], requests = [], checks = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', r => { if (r.url().includes('/api/geometry/')) requests.push(r.url()); });
const read = () => page.evaluate(() => fetch('/api/state').then(r => r.json()));
const waitSaved = async predicate => {
  for (let i = 0; i < 100; i++) {
    const state = await read();
    if (predicate(state)) { await page.locator('.job-card').waitFor({state:'hidden'}); return state; }
    await page.waitForTimeout(100);
  }
  throw Error('Timed out waiting for durable UI edit');
};
const canvasImage = () => page.locator('.canvas-host canvas').evaluate(canvas => canvas.toDataURL());
try {
  await page.goto(process.env.RYANCAD_UI_URL || 'http://127.0.0.1:8792');
  await page.locator('.component-select').first().waitFor({timeout:60000});
  await page.waitForTimeout(1800);
  if ((await read()).document.display_units !== 'mm') {
    await page.getByRole('button',{name:'Workspace settings',exact:true}).click();
    await page.getByLabel('Display units').selectOption('mm');
    await waitSaved(s=>s.document.display_units==='mm');
    await page.getByRole('dialog',{name:'Workspace preferences'}).getByRole('button',{name:'Close dialog'}).click();
  }
  const initial = await read();
  const part = Object.values(initial.document.components).find(c => c.name === 'Left removable form');
  assert(part, 'Use a separate mold reference project, never an in-progress user design.');
  await fs.mkdir('artifacts', {recursive:true});
  await page.mouse.move(519,480); await page.waitForTimeout(180);
  assert.match(await page.locator('.viewport-selection-legend').innerText(), /Edge.*click to select/);
  assert.equal((await read()).document.revision, initial.document.revision);
  await page.screenshot({path:'artifacts/viewport-hover.png'});
  await page.mouse.click(519,480);
  const measurement = page.locator('.smart-dimension[data-kind="length"][data-value="40"]').first();
  await measurement.waitFor();
  assert.match(await measurement.textContent(), /40\s+mm/);
  await page.screenshot({path:'artifacts/viewport-edge.png'});
  const beforeZoom = await measurement.boundingBox();
  await page.mouse.wheel(0,-150); await page.waitForTimeout(500);
  assert.notEqual(beforeZoom.x,(await measurement.boundingBox()).x, 'Measurement follows zoom');
  await page.getByRole('button',{name:'Fit design',exact:false}).click(); await page.waitForTimeout(300);
  await page.mouse.click(585,380);
  await page.getByRole('heading',{name:'Selected face',exact:true}).waitFor();
  await page.waitForTimeout(300);
  assert((await page.locator('.smart-dimension').count())>=1);
  await page.screenshot({path:'artifacts/viewport-face.png'});
  checks.push('Face/edge hover and selection; ranked geometry-anchored dimension lines');

  await page.mouse.click(519,480,{button:'right'});
  const menu = page.getByRole('menu',{name:'Design actions'});
  await menu.waitFor();
  await page.getByRole('menuitem',{name:'Fillet selected edge',exact:false}).waitFor();
  await page.screenshot({path:'artifacts/viewport-context-menu.png'});
  await page.keyboard.press('End'); assert.match(await page.locator(':focus').innerText(),/Fit design/);
  await page.keyboard.press('Escape'); await menu.waitFor({state:'hidden'});
  await page.mouse.move(750,500); await page.mouse.down({button:'right'}); await page.mouse.move(785,530,{steps:6}); await page.mouse.up({button:'right'});
  assert.equal(await menu.count(),0,'Right-drag pans without opening a menu');
  await page.getByRole('button',{name:'Fit design',exact:false}).click();
  checks.push('Context actions, keyboard navigation, and right-drag panning');

  await page.getByRole('button',{name:'Edit color of Left removable form',exact:true}).click();
  const appearance=page.getByRole('dialog',{name:'Component appearance'});
  await appearance.waitFor();
  const revision=(await read()).document.revision, requestCount=requests.length;
  const imageBefore=await canvasImage();
  await appearance.getByRole('button',{name:'Clay color',exact:true}).hover(); await page.waitForTimeout(120);
  assert.notEqual(await canvasImage(),imageBefore,'Palette hover previews on the model');
  assert.equal((await read()).document.revision,revision,'Hover never writes a revision');
  assert.equal(requests.length,requestCount,'Preview reuses existing geometry');
  for (const [label,color] of [['Clay','#c18e70'],['Iris','#9c8fbe']]) {
    await appearance.getByRole('button',{name:label+' color',exact:true}).click();
    await waitSaved(s=>s.document.components[part.id].color===color);
    await appearance.waitFor();
  }
  assert.equal((await read()).document.revision,revision+2,'One action per swatch');
  await appearance.getByLabel('Hex color').fill('#3578af'); await page.waitForTimeout(100);
  assert.equal((await read()).document.revision,revision+2,'Hex typing only previews');
  await appearance.getByLabel('Hex color').press('Enter');
  await waitSaved(s=>s.document.components[part.id].color==='#3578af');
  const slider=appearance.getByRole('slider',{name:'Red',exact:true});
  const box=await slider.boundingBox();
  await page.mouse.move(box.x+box.width*.22,box.y+box.height/2); await page.mouse.down();
  await page.mouse.move(box.x+box.width*.8,box.y+box.height/2,{steps:10}); await page.waitForTimeout(100);
  assert.equal((await read()).document.revision,revision+3,'Slider drag avoids intermediate commits');
  await page.mouse.up(); await waitSaved(s=>s.document.revision===revision+4);
  await page.screenshot({path:'artifacts/component-appearance.png'});
  await page.keyboard.press('Escape'); await appearance.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await waitSaved(s=>s.document.components[part.id].color==='#3578af');
  checks.push('Live color previews, no geometry downloads, one commit per gesture, undo');

  await page.getByRole('button',{name:'Rename Left removable form',exact:true}).click();
  await appearance.getByLabel('Component name').fill('Left form - inspection');
  await page.mouse.click(1200,450);
  await waitSaved(s=>s.document.components[part.id].name==='Left form - inspection');
  await appearance.waitFor({state:'hidden'});
  await page.locator('.component-select').filter({hasText:'Left form - inspection'}).click({button:'right'});
  await page.getByRole('menuitem',{name:'Name & color',exact:false}).click();
  await appearance.getByLabel('Component name').fill('Left removable form');
  await appearance.getByLabel('Component name').press('Enter');
  await waitSaved(s=>s.document.components[part.id].name==='Left removable form');
  await appearance.getByLabel('Hex color').fill(part.color);
  await appearance.getByLabel('Hex color').press('Enter');
  await waitSaved(s=>s.document.components[part.id].color===part.color);
  await appearance.getByRole('button',{name:'Close appearance'}).click();
  checks.push('Tree rename/color editor; outside dismissal saves pending name');

  await page.getByRole('button',{name:'Workspace settings',exact:true}).click();
  await page.getByLabel('Display units').selectOption('in');
  await waitSaved(s=>s.document.display_units==='in');
  await page.getByRole('dialog',{name:'Workspace preferences'}).getByRole('button',{name:'Close dialog'}).click();
  await page.mouse.click(519,480);
  await measurement.waitFor({state:'visible'});
  assert.match(await measurement.textContent(),/1.5748\s+in/);
  await page.getByRole('button',{name:'Workspace settings',exact:true}).click();
  await page.getByLabel('Display units').selectOption('mm');
  await waitSaved(s=>s.document.display_units==='mm');
  await page.getByRole('dialog',{name:'Workspace preferences'}).getByRole('button',{name:'Close dialog'}).click();
  await page.reload(); await page.locator('.component-select').first().waitFor();
  assert.equal((await read()).document.components[part.id].name,'Left removable form');
  checks.push('Display-unit conversion and durable reload');
  await page.setViewportSize({width:1100,height:800}); await page.waitForTimeout(250);
  await page.locator('.component-select').filter({hasText:'Left removable form'}).click({button:'right'});
  const bounds=await menu.boundingBox(); assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=1100&&bounds.y+bounds.height<=800);
  await page.screenshot({path:'artifacts/viewport-compact.png'});
  checks.push('Menu remains on screen in a compact viewport');
  assert.deepEqual(errors,[]);
  const result={checks,errors};
  await fs.writeFile('artifacts/viewport-ui-check.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} catch(error) {
  await page.screenshot({path:'artifacts/viewport-ui-failure.png'}).catch(()=>{});
  throw error;
} finally {await browser.close();}

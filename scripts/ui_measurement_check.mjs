// Requires an empty isolated project. No changes are made to the owner's working document.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[], checks=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const read=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
const dimensions=()=>page.locator('.smart-dimension').evaluateAll(nodes=>nodes.map(n=>({kind:n.dataset.kind,value:Number(n.dataset.value),score:Number(n.dataset.score),label:n.getAttribute('aria-label')})));
const settle=()=>page.waitForTimeout(400);
async function units(value) {
  await page.getByRole('button',{name:'Workspace settings',exact:true}).click();
  await page.getByLabel('Display units').selectOption(value);
  await page.locator('.job-card').waitFor({state:'hidden'});
  await page.getByRole('dialog',{name:'Workspace preferences'}).getByRole('button',{name:'Close dialog'}).click();await settle();
}
try {
  await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8793');
  await page.locator('.structure-root').waitFor();
  const existing=await read();
  assert(Object.keys(existing.document.features).length===0 || (Object.keys(existing.document.features).length===1 && Object.values(existing.document.components).some(c=>c.name==='Dimension study')),'Use the isolated dimension-study project.');
  if (!Object.keys(existing.document.features).length) {
  await page.getByRole('button',{name:'All tools',exact:true}).click();
  await page.getByRole('dialog',{name:'Tools and actions'}).locator('.palette-results button').filter({has:page.getByText('Box',{exact:true})}).click();
  const box=page.getByRole('dialog',{name:'Create a box',exact:true});
  await box.getByLabel('Name',{exact:true}).fill('Dimension study');
  for(const [label,value]of [['Length','6'],['Width','47'],['Height','47']])await box.getByLabel(label,{exact:true}).fill(value);
  await box.getByRole('button',{name:'Apply',exact:true}).click();await box.waitFor({state:'hidden'});await page.locator('.job-card').waitFor({state:'hidden'});await settle();
  } else {
    await page.locator('.component-select').filter({hasText:'Dimension study'}).click();await settle();
    const height=Object.values(existing.document.features)[0].parameters.height;
    if (existing.parameter_graph[height].value!==47) {
      await page.locator('.dimension-row').filter({hasText:'height'}).click();
      const edit=page.getByRole('dialog',{name:'Edit dimension'});
      await edit.getByLabel('Value or expression',{exact:true}).fill('47 mm');
      await edit.getByRole('button',{name:'Apply dimension',exact:true}).click();await edit.waitFor({state:'hidden'});await page.locator('.job-card').waitFor({state:'hidden'});await settle();
    }
  }
  let dims=await dimensions();
  assert.equal(dims.length,3);assert(dims.some(d=>d.value===6));assert(dims.some(d=>d.value===47));
  const overlay=page.getByTestId('smart-dimensions');
  assert(Number(await overlay.getAttribute('data-candidates'))>dims.length);
  assert(dims.every(d=>Number.isFinite(d.score)));
  await fs.mkdir('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/smart-measurement-plate.png'});
  const initial=await read(), rev=initial.document.revision;
  checks.push('6 × 47 × 47 mm plate shows its real spans with at most three annotations');

  await page.locator('.structure-root').click();await settle();
  assert.equal((await dimensions()).length,0);
  const canvas=await page.locator('.canvas-host').boundingBox();
  const x=canvas.x+canvas.width/2+10,y=canvas.y+canvas.height/2+10;
  await page.mouse.move(x,y);await settle();
  dims=await dimensions();assert(dims.length>=1&&dims.length<=2);
  assert.equal((await read()).document.revision,rev);
  await page.screenshot({path:'artifacts/smart-measurement-hover.png'});
  await page.mouse.click(x,y);await page.mouse.move(canvas.x+canvas.width-20,canvas.y+70);await settle();
  await page.getByRole('heading',{name:'Selected face',exact:true}).waitFor();
  dims=await dimensions();assert(dims.some(d=>d.value===47));assert(dims.some(d=>d.value===6));
  assert.equal(await page.locator('.viewport-measurement').count(),0);
  await page.screenshot({path:'artifacts/smart-measurement-face.png'});
  const pathBefore=await overlay.locator('path').first().getAttribute('d');
  await page.mouse.move(x,y);await page.mouse.wheel(0,-120);await settle();
  assert.notEqual(await overlay.locator('path').first().getAttribute('d'),pathBefore);
  await page.getByRole('button',{name:'Fit design',exact:false}).click();await settle();
  assert.equal((await read()).document.revision,rev);
  checks.push('Hover dwell, smaller hover budget, face selection, camera tracking, zero measurement edits');

  await units('in');dims=await dimensions();
  assert(dims.some(d=>d.label.includes('1.8504 in')));assert(dims.some(d=>d.label.includes('0.2362 in')));
  assert.equal(Object.keys((await read()).document.features).length,1);
  await units('mm');
  checks.push('Millimeter/inch display conversion retains authoritative geometry');

  await page.locator('.component-select').filter({hasText:'Dimension study'}).click();
  await page.getByRole('button',{name:'Top',exact:true}).click();await settle();
  dims=await dimensions();assert(dims.length<=3);
  assert(dims.every(d=>!d.label.startsWith('Overall Z')),'End-on Z span is suppressed.');
  await page.getByRole('button',{name:'ISO',exact:true}).click();await settle();
  await page.locator('.dimension-row').filter({hasText:'height'}).click();
  const edit=page.getByRole('dialog',{name:'Edit dimension'});
  await edit.getByLabel('Value or expression',{exact:true}).fill('55 mm');
  await edit.getByRole('button',{name:'Apply dimension',exact:true}).click();await edit.waitFor({state:'hidden'});await page.locator('.job-card').waitFor({state:'hidden'});await settle();
  dims=await dimensions();assert(dims.some(d=>d.value===55));
  checks.push('End-on dimensions suppressed; labels refresh after a real parameter edit');

  await page.setViewportSize({width:1100,height:800});await settle();
  const labelRects=await page.locator('.smart-dimension > g').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom}}));
  const viewport=await page.locator('.canvas-host').boundingBox();
  assert(labelRects.length>=1&&labelRects.length<=3);
  for(const r of labelRects)assert(r.x>=viewport.x&&r.right<=viewport.x+viewport.width&&r.y>=viewport.y&&r.bottom<=viewport.y+viewport.height);
  for(let i=0;i<labelRects.length;i++)for(let j=i+1;j<labelRects.length;j++){
    const a=labelRects[i],b=labelRects[j];assert(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,'Labels do not overlap.');
  }
  await page.screenshot({path:'artifacts/smart-measurement-compact.png'});
  checks.push('Annotations remain inside a compact viewport without overlapping each other');
  assert.deepEqual(errors,[]);
  const report={checks,errors};console.log(JSON.stringify(report,null,2));await fs.writeFile('artifacts/smart-measurement-ui-check.json',JSON.stringify(report,null,2));
} catch(error){await page.screenshot({path:'artifacts/smart-measurement-failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();}

// Run against an isolated server/project. Uses a disposable browser workspace.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const {chromium,devices}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
const context=await browser.newContext({...devices['iPhone 13'],deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
const output=process.env.RYANCAD_UI_ARTIFACTS || '.cache/mobile-ui';
await mkdir(output,{recursive:true});
const pane=async(name)=>page.getByRole('navigation',{name:'Mobile workspace panels'}).getByRole('button',{name:'Show '+name,exact:true}).tap();
const fits=async()=>{
 const sizes=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,bottom:document.querySelector('.mobile-navigation').getBoundingClientRect().bottom}));
 assert(sizes.scroll<=sizes.width,JSON.stringify(sizes));
 assert(Math.abs(sizes.bottom-sizes.height)<2,JSON.stringify(sizes));
 for(const selector of ['.brand','.command-search','.account-menu .avatar','.export-button','.viewport-area']){
  const box=await page.locator(selector).boundingBox();
  assert(box && box.x>=0 && box.x+box.width<=sizes.width+1,selector+': '+JSON.stringify(box));
 }
};
try{
 await page.goto(process.env.RYANCAD_UI_URL || 'http://127.0.0.1:8898');
 await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 await fits();
 assert.equal(await page.locator('.left-panel').isVisible(),false);
 assert.equal(await page.locator('.inspector-panel').isVisible(),false);
 await page.screenshot({path:output+'/phone-view.png'});
 await pane('design');await page.locator('.left-panel').waitFor({state:'visible'});await fits();
 await page.getByRole('button',{name:'Manage workspace designs'}).tap();
 await page.getByRole('dialog',{name:'Workspace designs'}).waitFor();
 await page.screenshot({path:output+'/phone-workspace.png'});
 await page.getByRole('button',{name:'Close dialog'}).tap();
 await page.getByRole('navigation',{name:'Modeling tools'}).getByRole('button',{name:'Parameters',exact:true}).tap();
 await page.getByRole('dialog',{name:'Parameters',exact:true}).waitFor();
 assert(Number.parseFloat(await page.getByLabel('Parameter name',{exact:true}).evaluate(e=>getComputedStyle(e).fontSize))>=16);
 await page.getByRole('button',{name:'Done',exact:true}).tap();
 await page.evaluate(async()=>{
  const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};
  for(const [i,name] of ['Bracket','Cover'].entries()){
   const state=await(await fetch('/api/state',{headers})).json();
   const r=await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({name:'feature.create',expected_revision:state.document.revision,args:{type:'box',name,values:{length:10,width:8,height:5,x:i*15}}})});
   let job=await r.json();if(!r.ok)throw Error(JSON.stringify(job));
   const id=job.job_id;
   for(let t=0;t<600 && job.status!=='complete';t++){
    if(job.status==='failed')throw Error(JSON.stringify(job.error));
    await new Promise(r=>setTimeout(r,50));job=await(await fetch('/api/jobs/'+id,{headers})).json();
   }
   if(job.status!=='complete')throw Error('Fixture timed out');
  }
 });
 await page.locator('.component-select').nth(1).waitFor();
 await page.locator('.component-select').first().tap();
 await page.getByRole('button',{name:'Export',exact:true}).tap();
 await page.getByRole('menuitem',{name:/STL file/}).tap();
 await page.getByRole('dialog').waitFor();
 await page.screenshot({path:output+'/phone-export.png'});
 await page.getByRole('button',{name:'Close dialog'}).tap();
 await pane('inspector');await page.locator('.inspector-panel').waitFor({state:'visible'});await fits();
 await page.screenshot({path:output+'/phone-inspector.png'});
 await page.getByRole('navigation',{name:'Modeling tools'}).getByRole('button',{name:'Move Component',exact:true}).tap();
 await page.locator('.move-component-panel').waitFor();
 assert.equal(await page.locator('.app-shell').getAttribute('data-mobile-pane'),'inspector');
 await page.getByLabel('Movement method').selectOption('axes');
 const distance=page.getByLabel('X distance',{exact:true});
 await distance.fill('3');
 await pane('view');assert.equal(await page.locator('.move-component-panel').isVisible(),false);
 await pane('design');await pane('inspector');assert.equal(await distance.inputValue(),'3');
 await page.screenshot({path:output+'/phone-move.png'});
 await page.waitForFunction(()=>[...document.querySelectorAll('.move-component-panel button')].some(b=>b.textContent.trim()==='Apply move' && !b.disabled));
 await page.getByRole('button',{name:'Apply move',exact:true}).tap();
 await page.locator('.move-component-panel').waitFor({state:'detached'});
 const revision=await page.evaluate(async()=>{
  const headers={'X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};
  const s=await(await fetch('/api/state',{headers})).json();return s.document.revision;
 });
 assert.equal(revision,3,'Mobile Apply must commit the movement');
 await page.getByRole('button',{name:'Tool operation',exact:true}).tap();
 await page.getByRole('complementary',{name:'Tool operation workspace'}).waitFor();
 assert((await page.locator('.operation-panel-host .operation-fields').boundingBox()).height>=100);
 await page.getByLabel('Tool Profile Shape',{exact:true}).selectOption('rectangle');
 await page.getByLabel('Profile plane',{exact:true}).selectOption('XY');
 await page.getByLabel('Path distance',{exact:true}).fill('3');
 await page.getByLabel('Tool Effect Type',{exact:true}).selectOption('new');
 await page.waitForFunction(()=>[...document.querySelectorAll('.operation-panel-host button')].some(b=>b.textContent.trim()==='Apply operation' && !b.disabled));
 await page.locator('.toast').waitFor({state:'detached'});
 await page.screenshot({path:output+'/phone-tool.png'});
 await pane('view');await pane('inspector');
 await page.getByRole('complementary',{name:'Tool operation workspace'}).getByRole('button',{name:'Cancel',exact:true}).tap();
 await pane('history');await page.locator('.timeline-panel').waitFor({state:'visible'});
 await page.getByRole('button',{name:'Separate part timelines'}).tap();await fits();
 await page.screenshot({path:output+'/phone-history.png'});
 await pane('view');await page.getByRole('button',{name:'Sketch',exact:true}).tap();
 await page.getByLabel('Sketch plane',{exact:true}).selectOption('XY');
 await page.getByRole('button',{name:'Sketch Point',exact:true}).tap();await pane('view');
 const canvas=await page.locator('.canvas-host canvas').boundingBox();
 const x=canvas.x+canvas.width/2,y=canvas.y+canvas.height/2;
 const cdp=await context.newCDPSession(page);
 const a={x:x-35,y,id:1},b={x:x+35,y,id:2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...a,x:a.x-15},{...b,x:b.x+15}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...b,x:b.x+15}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await page.locator('.sketch-entity').count(),0,'Pinch must not create sketch geometry');
 await page.touchscreen.tap(x,y);
 await page.waitForFunction(()=>document.querySelectorAll('.sketch-entity').length===1);
 await page.getByRole('navigation',{name:'Sketch tools'}).getByRole('button',{name:'Undo',exact:true}).tap();
 await page.getByRole('button',{name:'Sketch Rectangle',exact:true}).tap();
 await page.touchscreen.tap(x-45,y-40);await page.touchscreen.tap(x+45,y+40);
 await page.waitForFunction(()=>document.querySelectorAll('.sketch-entity').length===4);
 await page.screenshot({path:output+'/phone-sketch.png'});
 await pane('inspector');await page.getByRole('button',{name:'Cancel sketch',exact:true}).first().tap();
 await page.setViewportSize({width:320,height:740});await pane('inspector');await fits();
 await page.screenshot({path:output+'/small-phone.png'});
 await page.setViewportSize({width:844,height:390});await fits();
 const view=await page.locator('.viewport-area').boundingBox(),panel=await page.locator('.inspector-panel').boundingBox();
 assert(view.x+view.width<=panel.x+1 && Math.abs(view.y-panel.y)<1);
 await page.screenshot({path:output+'/phone-landscape.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.locator('.mobile-navigation').waitFor({state:'detached'});
 assert(await page.locator('.left-panel').isVisible());assert(await page.locator('.inspector-panel').isVisible());
 assert.deepEqual(errors,[]);
 console.log('Passed: phone panels, workspace/parameters/export, operation auto-open and draft retention, movement Apply, validated tool preview, touch sketching and pinch safety, history, 320/390px portrait, 844px landscape, desktop restoration, no JavaScript errors.');
}catch(error){await page.screenshot({path:output+'/failure.png'});throw error;}
finally{await browser.close();}

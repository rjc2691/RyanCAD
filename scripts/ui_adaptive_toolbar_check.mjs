// Use an isolated test server at 127.0.0.1:8898.
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
let browser;
(async()=>{
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge",args:['--enable-unsafe-swiftshader']});
 const errors=[];
 for(const [width,height] of [[412,915],[393,852],[1000,900],[1440,900],[2600,1100]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:width<1000});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>sessionStorage.setItem('ryancad-startup-complete','1'));
  await page.goto('http://127.0.0.1:8898');
  await page.waitForSelector('.design-inspector',{state:'attached'});await page.waitForTimeout(1000);
  const layout=await page.evaluate(()=>{
   const rect=selector=>{const e=document.querySelector(selector),r=e?.getBoundingClientRect();return r?{x:r.x,y:r.y,w:r.width,h:r.height,scroll:e.scrollWidth}:null;};
   return {shell:rect('.app-shell'),header:rect('.app-header'),tools:rect('.tool-strip-content'),row:rect('.overflow-toolbar'),viewport:rect('.viewport-area'),trayButton:!!document.querySelector('.toolbar-overflow-toggle'),visible:[...document.querySelectorAll('.toolbar-visible-items button')].map(e=>e.getAttribute('aria-label')||e.textContent),overflow:[...document.querySelectorAll('.toolbar-overflow-tray button')].map(e=>e.getAttribute('aria-label')||e.textContent),axes:rect('.view-orientation'),views:rect('.view-controls')};
  });
  if(layout.header.y!==0)throw Error('Gap above header');
  if(width<1100&&!layout.trayButton)throw Error('Missing overflow tray');
  if(width===2600){const edges=await page.evaluate(()=>{const bar=document.querySelector('.tool-strip-content').getBoundingClientRect(),left=document.querySelector('.left-panel').getBoundingClientRect(),right=document.querySelector('.inspector-panel').getBoundingClientRect();return {barLeft:bar.x,barRight:bar.right,left:left.width,right:right.x};});if(edges.barLeft!==edges.left||edges.barRight!==edges.right)throw Error('Desktop toolbar insets');}
  console.log('Layout passed:',width,height);
  const more=page.getByRole('button',{name:'More tools',exact:true});
  if(await more.count()){
   await more.click();await page.waitForTimeout(150);
   const box=await page.locator('.toolbar-overflow-tray').boundingBox();
   if(box.x<0||box.x+box.width>width+1)throw Error('Tray outside viewport');
   await page.screenshot({path:`.cache/ui-${width}-nov01.png`});
   await page.keyboard.press('Escape');
  }
  if(width===1440){
   const divider=page.getByRole('separator',{name:'Resize project sidebar'}),box=await divider.boundingBox();
   await page.mouse.move(box.x+3,box.y+40);await page.mouse.down();await page.mouse.move(320,box.y+40);await page.mouse.up();
   console.log('SIDEBAR',await divider.getAttribute('aria-valuenow'));
   await divider.focus();await page.keyboard.press('End');if(await divider.getAttribute('aria-valuenow')!=='420')throw Error('Sidebar max');
   await page.keyboard.press('Home');if(await divider.getAttribute('aria-valuenow')!=='200')throw Error('Sidebar min');await divider.blur();
   await page.keyboard.press('Escape');
   if(!await page.locator('.design-inspector').isVisible())throw Error('Escape replaced design inspector');
   await page.getByRole('button',{name:'Agents',exact:true}).click();
   await page.waitForSelector('.mcp-config-block textarea');
   const config=await page.getByRole('textbox',{name:'Codex MCP configuration'}).inputValue();
   if(config.includes('--workspace')||config.includes('--design'))throw Error('Config still pins IDs');
   await page.getByRole('tab',{name:'Cursor',exact:true}).click();
   if(!await page.getByText('Setup instructions for Cursor are coming soon.',{exact:false}).isVisible())throw Error('Missing harness tab');
   await page.getByRole('tab',{name:'Codex',exact:true}).click();
   await page.getByRole('switch',{name:'Enable MCP server'}).click();
   await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='false');
   console.log('AGENTS','toggle and tabs passed');
   await page.screenshot({path:'.cache/ui-agents-nov01.png'});
   await page.getByRole('switch',{name:'Enable MCP server'}).click();
   await page.getByRole('button',{name:'Close dialog',exact:true}).click();
   const request=(path,body)=>page.evaluate(async({path,body})=>{const design=sessionStorage.getItem('ryancad-active-design');const response=await fetch('/api'+path,{cache:'no-store',method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(design?{'X-RyanCAD-Design':design}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;},{path,body});
   const command=async(name,args)=>{const current=await request('/state');const submitted=await request('/commands',{name,args,expected_revision:current.document.revision});for(let i=0;i<600;i++){const job=await request('/jobs/'+submitted.job_id);if(job.status==='complete')return job.result;if(['failed','cancelled'].includes(job.status))throw Error(JSON.stringify(job));await page.waitForTimeout(50);}throw Error('Command timed out');};
   const description=page.getByRole('textbox',{name:'Layout description'});await description.fill('Casting arrangement');await description.blur();
   let saved=false;for(let i=0;i<200;i++){const current=await request('/state');if(current.document.components[current.document.active_layout].description==='Casting arrangement'){saved=true;break;}await page.waitForTimeout(50);}if(!saved)throw Error('Layout description did not save');
   await command('part.primitive',{shape:'box',name:'Origin cover',place:true,values:{length:40,width:30,height:20,z:-10}});
   await page.waitForFunction(()=>document.querySelector('.world-origin-point')?.getAttribute('data-occluded')==='true');
   if(await page.locator('.world-origin-point').evaluate(el=>getComputedStyle(el).opacity)!=='0.36')throw Error('Origin did not dim');
   await command('sketch.create',{name:'Adaptive sketch',entities:[{id:'a',type:'line',x1:0,y1:0,x2:20,y2:0}]});
   await page.getByRole('button',{name:'Adaptive sketch',exact:true}).dblclick();await page.getByRole('navigation',{name:'Sketch tools',exact:true}).waitFor();
   await page.setViewportSize({width:412,height:915});await page.getByRole('button',{name:'More tools',exact:true}).click();await page.getByRole('navigation',{name:'Sketch tools',exact:true}).getByRole('button',{name:'Cancel sketch',exact:true}).click();await page.getByRole('navigation',{name:'Modeling tools',exact:true}).waitFor();
   console.log('Passed: origin occlusion, layout description and sketch tray.');
  }
  await context.close();
 }
 await browser.close();console.log('ERRORS',errors);if(errors.length)process.exitCode=1;
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});

// Isolated application tests only; never attaches to the user's desktop browser.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext(),page=await context.newPage(),foreign=await browser.newPage(),errors=[];
await page.setViewportSize({width:1500,height:1050});page.on('pageerror',e=>errors.push(String(e)));
const request=(p,path,body)=>p.evaluate(async({path,body})=>{const id=sessionStorage.getItem('ryancad-active-design');const r=await fetch('/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(id?{'X-RyanCAD-Design':id}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;},{path,body});
async function command(name,args={}){const state=await request(page,'/state'),job=await request(page,'/commands',{name,args,expected_revision:state.document.revision});for(let i=0;i<1000;i++){const j=await request(page,'/jobs/'+job.job_id);if(j.status==='complete')return j.result;if(j.status==='failed')throw Error(JSON.stringify(j));await page.waitForTimeout(30);}throw Error('timeout');}
const editor=label=>page.waitForFunction(label=>document.querySelector('.viewport-context .eyebrow')?.textContent===label,label);
try{
 const url=process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898';await foreign.goto(url);await request(foreign,'/workspace/rename',{name:'Other browser workshop'});
 await page.goto(url);await page.locator('.design-inspector').waitFor();await page.getByRole('button',{name:'Manage workspaces',exact:true}).click();
 const manager=page.getByRole('dialog',{name:'Workspaces',exact:true});await manager.waitFor();await manager.getByLabel('Workspace name',{exact:true}).fill('Casting workshop');await manager.getByRole('button',{name:'Rename',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.workspace-tree-title')?.textContent.trim()==='Casting workshop');
 assert.equal(await manager.getByText('WORKSPACE MANAGEMENT',{exact:true}).count(),0);
 assert.equal(await manager.getByRole('button',{name:/Manage designs in/}).count(),0);
 await manager.getByRole('status').getByText('Saved',{exact:true}).waitFor();
 const key=await manager.getByRole('button',{name:'Show all server workspaces',exact:true}).boundingBox(),close=await manager.getByRole('button',{name:'Close',exact:true}).boundingBox();assert(key.x<close.x&&Math.abs(key.y-close.y)<16);
 await manager.getByRole('button',{name:'Close',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Manage workspaces',exact:true}).click();await manager.waitFor();assert.equal(await manager.getByLabel('Workspace name',{exact:true}).inputValue(),'Casting workshop');
 assert.equal(await page.locator('.left-panel .sidebar-add-row').count(),0);
 for(const name of ['Add design','Add layout','Place part in layout','Add part','New 3D tool body','New sketch']){const button=page.getByRole('button',{name,exact:true});assert.equal(await button.count(),1);assert(await button.evaluate(el=>!!el.closest('.sidebar-list-label,.section-heading,.structure-section')));}
 assert.equal(await manager.getByRole('button',{name:/Other browser workshop/}).count(),0);
 await manager.getByRole('button',{name:'Show all server workspaces',exact:true}).click();await manager.getByLabel('Admin password',{exact:true}).fill('wrong');await manager.getByRole('button',{name:'Unlock server list',exact:true}).click();await manager.getByRole('alert').waitFor();
 await manager.getByLabel('Admin password',{exact:true}).fill('ryan');await manager.getByRole('button',{name:'Unlock server list',exact:true}).click();await manager.getByRole('button',{name:/Other browser workshop/}).first().waitFor();
 await manager.getByRole('button',{name:'Lock admin workspace view',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.workspace-manager-list')?.textContent.includes('Other browser workshop'));
 await manager.getByLabel('New workspace name',{exact:true}).fill('Fixtures');await manager.getByRole('button',{name:'New workspace',exact:true}).click();await page.waitForEvent('load');await page.getByRole('button',{name:'Manage workspaces',exact:true}).waitFor();assert.equal((await page.locator('.workspace-tree-title').textContent()).trim(),'Fixtures');
 await page.getByRole('button',{name:'Manage workspaces',exact:true}).click();await manager.waitFor();await manager.getByRole('button',{name:/Casting workshop/}).waitFor();await manager.getByRole('button',{name:'Close',exact:true}).click();
 await command('document.rename',{name:'Mold design'});
 const part=await command('part.create',{name:'Housing'});await command('part.component.create',{part:part.component_id,name:'Shell'});await command('part.component.create',{part:part.component_id,name:'Lid'});
 let state=await request(page,'/state');let root=state.occurrences.find(o=>o.parent==='root'&&o.definition===part.component_id);
 const members=state.occurrences.filter(o=>o.id.startsWith(root.id+'/')&&o.parent===part.component_id).map(o=>o.id);
 await command('group.create',{name:'Housing internals',occurrences:members});
 const nested=await command('part.create',{name:'Insert'});await command('part.component.create',{part:nested.component_id,name:'Insert body'});await command('part.insert',{part:nested.component_id,parent:part.component_id});
 state=await request(page,'/state');const originalLayout=state.document.active_layout;
 const group=await command('layoutgroup.create',{name:'Mold arrangement',parent:originalLayout});await command('part.insert',{part:part.component_id,parent:group.component_id});
 await command('layout.create',{name:'Layout 2'});await command('layout.select',{id:originalLayout});
 await request(page,'/workspace/designs',{name:'Second design'});await page.reload();await page.locator('.design-inspector').waitFor();
 assert.equal(await page.locator('.sidebar-list-label').getByText('Designs',{exact:true}).count(),1);assert.equal(await page.getByText('Layout Tree · Layout 1',{exact:true}).count(),1);
 const designs=page.getByRole('tree',{name:'Workspace designs',exact:true});assert.equal(await designs.locator('.workspace-design-heading').count(),2);await designs.getByText('Mold design',{exact:true}).waitFor();await page.getByLabel('Design layouts').getByText('Layouts',{exact:true}).waitFor();assert.equal(await page.getByLabel('Design layouts').locator('[aria-current=true]').textContent(),'Layout 1');
 const layout=page.getByRole('tree',{name:'Layout parts',exact:true});await layout.getByRole('button',{name:'Expand Mold arrangement',exact:true}).click();await layout.getByText('Housing',{exact:true}).waitFor();assert.equal(await layout.getByText('Shell',{exact:true}).count(),0);assert.equal(await layout.getByText('Insert',{exact:true}).count(),0);assert(await layout.getByRole('button',{name:'Expand Housing',exact:true}).isDisabled());
 const library=page.getByRole('tree',{name:'Reusable parts',exact:true});await library.getByText('Housing',{exact:true}).dblclick();await editor('Part Editor');await library.getByText('Housing internals',{exact:true}).dblclick();await editor('Part Editor');await library.getByText('Shell',{exact:true}).waitFor();assert.equal(await page.locator('.group-edit-banner').count(),0);const summary=page.locator('.viewport-selection-summary');assert.equal(await summary.count(),1);assert.equal(await summary.locator('strong').textContent(),'Housing internals');await summary.getByRole('button',{name:'Done',exact:true}).click();await editor('Part Editor');assert.equal(await summary.locator('strong').textContent(),'Housing');await summary.getByRole('button',{name:'Done',exact:true}).click();await editor('Layout Editor');
 await page.screenshot({path:'.cache/workspace-rooted-sidebar.png'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Show design',exact:true}).click();await page.getByRole('button',{name:'Manage workspaces',exact:true}).click();await manager.waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('Passed: workspace root/name, browser-owned workspace list, admin unlock/lock, creation/switching, design/layout labels, part-only layout leaves, distinct part groups and editor return, mobile management.');
}catch(e){await page.screenshot({path:'.cache/workspace-structure-failure.png'});throw e;}finally{await browser.close();}

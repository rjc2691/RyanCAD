import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1550,height:1050}}), errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const request=async(path,body)=>page.evaluate(async({path,body})=>{
 const headers={'Content-Type':'application/json'},id=sessionStorage.getItem('ryancad-active-design');if(id)headers['X-RyanCAD-Design']=id;
 const r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;
},{path,body});
async function wait(job){const id=job.job_id;for(let i=0;i<1000;i++){if(['complete','failed','cancelled'].includes(job.status)){assert.equal(job.status,'complete',JSON.stringify(job));return job.result;}await page.waitForTimeout(40);job=await request('/jobs/'+id);}throw Error('Timed out');}
async function command(name,args){const state=await request('/state');return wait(await request('/commands',{name,args,expected_revision:state.document.revision}));}
async function open(name){await page.locator(`.timeline-feature[title^="${name} ·"]`).dblclick();await page.getByRole('complementary',{name:'Edit feature',exact:true}).waitFor();}
const panel=page.getByRole('complementary',{name:'Edit feature',exact:true});
async function ready(){await panel.getByRole('button',{name:'Apply changes',exact:true}).waitFor();await page.waitForFunction(()=>{const e=document.querySelector('.feature-edit-panel .primary');return e&&!e.disabled;});}
try {
 await page.goto('http://127.0.0.1:8898');await page.locator('.design-tree-name').waitFor();
 const design=await request('/workspace/designs',{name:'History editing test'});await page.evaluate(id=>sessionStorage.setItem('ryancad-active-design',id),design.design_id);await page.reload();await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='History editing test');
 // This script uses only the isolated project on port 8898.
 await page.getByRole('button',{name:'Tool operation',exact:true}).click();await page.locator('.operation-panel-host').waitFor();
 assert.deepEqual(await page.locator('.operation-panel-host [data-tool-section]').evaluateAll(nodes=>nodes.map(node=>node.dataset.toolSection)),['effect','profile','path','origin']);
 assert.equal(await page.getByRole('group',{name:'Reference point offset',exact:true}).count(),0);
 await page.getByRole('button',{name:'Cancel tool operation',exact:true}).click();
 const made=await command('operation.create',{name:'Editable plate',profile:'rectangle',origin:'reference',reference:{component:'root',world:'origin'},values:{width:40,height:30,distance:6,offset_u:3,offset_v:2,offset_n:1}});
 let state=await request('/state');const face=state.geometry[made.component_id].faces.find(f=>f.normal[2]>.99),ref={component:made.component_id,occurrence:made.instance_id,face:face.signature};
 const hole=await command('operation.create',{name:'Through hole',target:made.component_id,target_occurrence:made.instance_id,profile:'circle',result:'cut',origin:'reference',reference:ref,profile_reference:ref,plane:'face',extent:'through',values:{diameter:5}});
 await page.locator('.timeline-feature[title^="Through hole ·"]').waitFor();
 const before=await request('/state');
 await open('Editable plate');assert.equal(await panel.getByLabel('Profile width',{exact:true}).inputValue(),'40');
 assert.deepEqual(await panel.locator('[data-tool-section]').evaluateAll(nodes=>nodes.map(node=>node.dataset.toolSection)),['effect','profile','path','origin']);
 assert.equal(await panel.getByLabel('Tool Profile Shape',{exact:true}).inputValue(),'rectangle');assert(await panel.getByLabel('Tool Profile Shape',{exact:true}).isDisabled());
 assert((await panel.getByRole('group',{name:'Saved Tool Profile references'}).textContent()).includes('World XY plane'));
 assert((await panel.getByRole('group',{name:'Saved Tool Path references'}).textContent()).includes('Tool Profile normal'));
 assert((await panel.getByRole('group',{name:'Saved Tool Origin references'}).textContent()).includes('World origin'));
 assert.equal(await panel.locator('input[aria-label^="Reference offset"], input[aria-label^="Origin "]').count(),0);
 await panel.getByLabel('Profile width',{exact:true}).fill('50');await ready();
 assert.deepEqual((await request('/state')).document,before.document,'preview must not save');
 await page.getByRole('button',{name:/Fit design/}).click();await page.screenshot({path:'artifacts/edit-history-feature.png'});
 await panel.getByRole('button',{name:'Apply changes',exact:true}).click();await panel.waitFor({state:'detached'});
 state=await request('/state');assert.deepEqual(state.document.feature_order,before.document.feature_order);assert.equal(state.document.features[made.feature_id].id,made.feature_id);assert(Math.abs(state.geometry[made.component_id].volume-before.geometry[made.component_id].volume-1800)<.01);assert.equal(await page.locator('.timeline-feature').count(),2);
 for(const field of ['offset_u','offset_v','offset_n']){const id=before.document.features[made.feature_id].parameters[field];assert.deepEqual(state.document.parameters[id],before.document.parameters[id]);}
 // Cancel and Escape discard previews, including geometry already on screen.
 await open('Through hole');assert((await panel.getByRole('group',{name:'Saved Tool Profile references'}).textContent()).match(/Face|face/));assert.equal(await panel.locator('.operation-readonly-reference .lucide-lock-keyhole').count(),3);await panel.getByLabel('Diameter',{exact:true}).fill('8');await ready();await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});assert.deepEqual((await request('/state')).document,state.document);
 // Enter pressed before a preview finishes confirms only the latest validated candidate.
 await open('Through hole');await panel.getByLabel('Diameter',{exact:true}).fill('7');await page.keyboard.press('Enter');await panel.waitFor({state:'detached',timeout:20000});
 let after=await request('/state');assert.equal(after.document.feature_order.length,2);assert.equal(after.document.features[hole.feature_id].id,hole.feature_id);assert(after.geometry[made.component_id].volume<state.geometry[made.component_id].volume);
 // Invalid geometry is explained in-panel and cannot commit.
 await open('Editable plate');await panel.getByLabel('Profile width',{exact:true}).fill('-5');await panel.getByRole('alert').waitFor();assert(await panel.getByRole('button',{name:'Apply changes',exact:true}).isDisabled());await panel.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await request('/state')).document,after.document);
 // Original step arrows still inspect history without opening an edit.
 await page.getByRole('button',{name:'Previous feature',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.timeline-feature.rollback'));assert.equal(await panel.count(),0);await page.getByRole('button',{name:'Next feature',exact:true}).click();
 // Sketches use the full existing sketch workflow.
 await command('sketch.create',{name:'Editable sketch',entities:[{id:'circle',type:'circle',x:0,y:0,radius:3,fixed:true}]});await page.locator('.timeline-feature[title^="Editable sketch ·"]').dblclick();await page.locator('.sketch-commit').waitFor();await page.locator('.sketch-commit').getByRole('button',{name:'Cancel',exact:true}).click();
 // Concurrent agent/user changes cannot be overwritten by an older open editor.
 await open('Editable plate');await panel.getByLabel('Profile width',{exact:true}).fill('52');await ready();await command('document.rename',{name:'History editing test updated'});await panel.getByRole('alert').filter({hasText:'design changed'}).waitFor();assert(await panel.getByRole('button',{name:'Apply changes',exact:true}).isDisabled());await panel.getByRole('button',{name:'Cancel',exact:true}).click();
 // A phone can access the same editor, with scrollable fields and fixed actions.
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Show history',exact:true}).click();await page.locator('.timeline-feature[title^="Editable plate ·"]').dblclick();await panel.waitFor();const bounds=await panel.boundingBox();assert(bounds.width<=390&&bounds.x>=0);await panel.getByLabel('Profile width',{exact:true}).fill('55');await ready();assert(await panel.getByRole('button',{name:'Apply changes',exact:true}).isVisible());await panel.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.deepEqual(errors,[]);console.log('Passed: edit and rebuild original features; no duplicate history; preview/cancel/Enter/Escape; invalid geometry; historical stepping; sketch editing; mobile layout; no JavaScript errors.');
} catch(e) {await page.screenshot({path:'.cache/feature-edit-ui/failure.png'});throw e;}
finally {await browser.close();}

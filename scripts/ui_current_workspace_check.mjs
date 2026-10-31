import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const api=(path,body)=>page.evaluate(async({path,body})=>{const id=sessionStorage.getItem('ryancad-active-design');const response=await fetch('/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(id?{'X-RyanCAD-Design':id}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;},{path,body});
async function command(name,args){const state=await api('/state'),job=await api('/commands',{name,args,expected_revision:state.document.revision});for(let n=0;n<600;n++){const next=await api('/jobs/'+job.job_id);if(next.status==='complete')return next.result;if(next.status==='failed')throw Error(JSON.stringify(next));await page.waitForTimeout(40);}throw Error('timeout');}
try{
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();
 assert.equal(await page.getByRole('button',{name:'Find a tool or action',exact:true}).count(),0);await page.keyboard.press('Control+k');assert.equal(await page.getByRole('dialog',{name:'Tools and actions',exact:true}).count(),0);
 await page.getByRole('button',{name:'Manage workspaces',exact:true}).click();await page.getByRole('dialog',{name:'Workspaces',exact:true}).waitFor();assert.equal(await page.getByText('Copy existing server design and history',{exact:true}).count(),0);await page.getByRole('button',{name:'Close',exact:true}).click();
 await command('part.primitive',{shape:'box',name:'Current structure smoke',place:true});await command('sketch.create',{name:'Smoke sketch',entities:[{id:'a',type:'line',x1:0,y1:0,x2:20,y2:0}]});await page.reload();
 const library=page.getByRole('tree',{name:'Reusable parts',exact:true});await library.getByText('Current structure smoke',{exact:true}).dblclick();await page.getByLabel('Part overview').waitFor();
 await library.getByText('Component',{exact:true}).dblclick();await page.waitForFunction(()=>document.querySelector('.viewport-context .eyebrow')?.textContent==='Component Editor');
 await page.keyboard.press('t');await page.getByRole('complementary',{name:'Tool operation workspace',exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Smoke sketch',exact:true}).dblclick();await page.getByRole('navigation',{name:'Sketch tools',exact:true}).waitFor();await page.getByRole('button',{name:'Cancel sketch',exact:true}).click();
 assert.deepEqual(errors,[]);console.log('Passed: search/palette and server-copy migration removed; workspace, part/component editors, Tool, and sketch workflows remain available.');
}finally{await browser.close();}

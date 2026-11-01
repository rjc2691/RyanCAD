// Run against an isolated server on port 8898 with disposable data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>sessionStorage.setItem('ryancad-startup-complete','1'));
 await page.goto('http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();
 await page.getByRole('button',{name:'Manage workspaces',exact:true}).click();
 assert.equal(await page.getByText('Active workspace name',{exact:true}).count(),0);
 await page.getByRole('textbox',{name:'New workspace name',exact:true}).fill('Second workspace');
 await page.getByRole('button',{name:'New workspace',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.workspace-root-name')?.textContent==='Second workspace');
 await page.getByRole('button',{name:'Manage workspaces',exact:true}).click();
 await page.getByRole('button',{name:'Rename workspace Local Workspace',exact:true}).click();
 const input=page.getByRole('textbox',{name:'Workspace name',exact:true});
 await input.fill('Discarded name');await input.press('Escape');
 assert(await page.getByRole('dialog',{name:'Workspaces',exact:true}).isVisible());
 assert.equal(await input.count(),0);
 assert(await page.getByRole('button',{name:'Rename workspace Local Workspace',exact:true}).isVisible());
 await page.getByRole('button',{name:'Rename workspace Local Workspace',exact:true}).click();
 await input.fill('Renamed first workspace');await page.getByRole('button',{name:'Save workspace name',exact:true}).click();
 await page.getByRole('button',{name:'Rename workspace Renamed first workspace',exact:true}).waitFor();
 assert.equal(await page.locator('.workspace-root-name').textContent(),'Second workspace');
 await page.getByRole('button',{name:'Rename workspace Second workspace',exact:true}).click();
 await input.fill('Renamed active workspace');await input.press('Enter');
 await page.getByRole('button',{name:'Rename workspace Renamed active workspace',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.workspace-root-name')?.textContent==='Renamed active workspace');
 const active=await page.evaluate(async()=>await(await fetch('/api/workspace')).json());assert.equal(active.name,'Renamed active workspace');
 await page.setViewportSize({width:393,height:852});
 await page.getByRole('button',{name:'Rename workspace Renamed active workspace',exact:true}).click();
 await input.fill('Phone edit');await page.getByRole('button',{name:'Cancel workspace rename',exact:true}).click();
 assert(await page.getByRole('button',{name:'Rename workspace Renamed active workspace',exact:true}).isVisible());
 await page.screenshot({path:'.cache/workspace-inline-rename-phone.png'});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('Passed: per-row rename, Escape/Cancel, inactive rename without switching, active rename/sidebar refresh, Enter-save and phone layout.');
}finally{await browser.close();}

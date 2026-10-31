import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.addInitScript(()=>{
 const files=new Map();window.folderFiles=files;window.folderWrites=[];
 const directory=(prefix='')=>({
  async getDirectoryHandle(name,{create}={}){const path=prefix+name+'/';if(!create&&![...files.keys()].some(p=>p.startsWith(path)))throw new DOMException('Missing','NotFoundError');return directory(path);},
  async getFileHandle(name,{create}={}){const path=prefix+name;if(!create&&!files.has(path))throw new DOMException('Missing','NotFoundError');return {
   async getFile(){return new File([files.get(path)],name)},async createWritable(){let pending;return {async write(bytes){pending=bytes},async close(){files.set(path,pending);window.folderWrites.push(path)},async abort(){}}}
  }}
 });
 window.showDirectoryPicker=async()=>directory();
});
const api=(path,body)=>page.evaluate(async({path,body})=>{const r=await fetch('/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;},{path,body});
const open=async kind=>{await page.getByRole('button',{name:kind,exact:true}).click();await page.getByRole('menuitem',{name:/RyanCAD Workspace folder/}).click();return page.getByRole('dialog',{name:kind+' workspace folder',exact:true});};
try{
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();
 const before=await api('/workspace');await api('/workspace/designs',{name:'Folder transfer design'});await page.reload();
 let dialog=await open('Export');assert((await dialog.textContent()).includes('Safari'));await page.screenshot({path:'.cache/workspace-folder-export-notice.png'});await dialog.getByRole('button',{name:'Choose folder',exact:true}).click();await dialog.getByRole('button',{name:'Done',exact:true}).waitFor();
 let paths=await page.evaluate(()=>[...window.folderFiles.keys()]);assert(paths.includes('workspace.json'));assert(paths.some(p=>p.endsWith('journal.sqlite3')));assert(!paths.some(p=>p.endsWith('.zip')));assert.equal(paths.at(-1),'workspace.json');await dialog.getByRole('button',{name:'Done',exact:true}).click();
 dialog=await open('Export');const writes=await page.evaluate(()=>window.folderWrites.length);await dialog.getByRole('button',{name:'Choose folder',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.folderWrites.length),writes);
 await dialog.getByLabel('Overwrite matching files').check();await dialog.getByRole('button',{name:'Choose folder',exact:true}).click();await dialog.getByRole('button',{name:'Done',exact:true}).waitFor();await dialog.getByRole('button',{name:'Done',exact:true}).click();
 await page.evaluate(()=>window.folderFiles.set('unrelated.txt','leave alone'));
 dialog=await open('Import');await dialog.getByRole('button',{name:'Choose folder',exact:true}).click();await page.waitForEvent('load');await page.locator('.design-inspector').waitFor();
 const after=await api('/workspace');assert.notEqual(after.workspace_code,before.workspace_code);assert(after.designs.some(d=>d.name==='Folder transfer design'));
 // Unsupported export gets a useful explanation before a native picker is invoked.
 await page.evaluate(()=>window.showDirectoryPicker=undefined);dialog=await open('Export');assert(await dialog.getByRole('button',{name:'Choose folder',exact:true}).isDisabled());assert((await dialog.textContent()).includes('unavailable in this browser'));
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert((await dialog.getByRole('button',{name:'Choose folder',exact:true}).boundingBox()).width>85);await page.screenshot({path:'.cache/workspace-folder-unsupported-mobile.png'});
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 const snapshot=await api('/workspace/folder/export'),folder=resolve('.cache/folder-upload-input');await mkdir(folder,{recursive:true});
 for(const file of snapshot.files){const path=resolve(folder,file.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,Buffer.from(file.data,'base64'));}
 const previous=after.workspace_code;
 dialog=await open('Import');const chooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'Choose folder',exact:true}).click();await(await chooser).setFiles(folder);await page.waitForEvent('load');await page.locator('.design-inspector').waitFor({state:'attached'});assert.notEqual((await api('/workspace')).workspace_code,previous);
 assert.deepEqual(errors,[]);console.log('Passed: menu notices, uncompressed workspace export, overwrite preflight, import/recovery, unsupported export and mobile layout.');
}finally{await browser.close();}

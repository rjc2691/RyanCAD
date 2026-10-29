import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await mkdir('.cache/file-ui',{recursive:true});
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>');
async function upload(label,name,mime,buffer){
 await page.getByRole('button',{name:'Import',exact:true}).click();
 const chooser=page.waitForEvent('filechooser');
 await page.getByRole('menuitem',{name:label}).click();
 await (await chooser).setFiles({name,mimeType:mime,buffer});
}
try{
 await page.goto('http://127.0.0.1:8898');
 await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 assert.equal(await page.locator('.reference-designs-link').count(),0);
 await upload(/SVG sketch/,'Laser.svg','image/svg+xml',svg);
 await page.locator('.sketch-tree-name').filter({hasText:'Laser'}).waitFor();
 await page.getByRole('button',{name:'Export',exact:true}).click();
 await page.getByRole('menuitem',{name:/SVG sketches/}).click();
 await page.getByRole('dialog',{name:'Export SVG'}).getByRole('checkbox').check();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export SVG',exact:true}).click();
 const file=await download;assert.equal(file.suggestedFilename(),'sketch.svg');
 assert((await readFile(await file.path(),'utf8')).includes('20'));
 await upload(/STL object/,'Cube.stl','application/octet-stream',await readFile('.cache/import-cube.stl'));
 await page.locator('.component-select').filter({hasText:'Cube'}).waitFor();
 await page.getByRole('button',{name:'Export',exact:true}).click();
 await page.getByRole('menuitem',{name:/STL components/}).click();
 await page.getByRole('dialog',{name:'Export STL'}).waitFor();
 await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'Project menu'}).click();
 assert(await page.locator('#project-dropdown').getByRole('button',{name:/Reference designs/}).isVisible());
 await page.getByRole('button',{name:'Project menu'}).click();
 await page.screenshot({path:'.cache/file-ui/desktop.png'});
 await page.setViewportSize({width:320,height:740});
 await page.getByRole('button',{name:'Import',exact:true}).click();
 assert((await page.getByRole('menu',{name:'Import formats'}).boundingBox()).x>=0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'.cache/file-ui/mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('Passed: SVG upload/sketch/download, STL upload/component/export selection, retained logo examples, removed sidebar duplicate, mobile menus and bounds.');
}catch(e){await page.screenshot({path:'.cache/file-ui/failure.png'});throw e;}finally{await browser.close();}

// An isolated browser/profile; no attachment to the user's browser.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1300,height:700}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=async()=>{await page.waitForTimeout(80);const b=await page.getByRole('menu',{name:'Design actions'}).boundingBox(),v=page.viewportSize();assert(b.x>=7&&b.y>=7&&b.x+b.width<=v.width-7&&b.y+b.height<=v.height-7,JSON.stringify({b,v}));assert(await page.getByRole('menu').evaluate(e=>e.parentElement===document.body));};
try{
 await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();await page.getByRole('button',{name:'Add part',exact:true}).click();const row=page.getByRole('tree',{name:'Reusable parts',exact:true}).locator('.structure-item').first();await row.waitFor();await row.click({button:'right'});await check();await page.keyboard.press('Escape');
 // Use the same real sidebar handler with edge coordinates to cover every corner.
 for(const [x,y]of [[1,1],[1299,699],[1,699]]){await row.evaluate((el,{x,y})=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:x,clientY:y})),{x,y});await check();await page.keyboard.press('Escape');}
 await row.evaluate(el=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:690})));await page.setViewportSize({width:1300,height:260});await check();const menu=page.getByRole('menu');assert(await menu.evaluate(e=>e.scrollHeight>e.clientHeight));await menu.press('End');assert(await menu.evaluate(e=>e.scrollTop>0));const last=await menu.getByRole('menuitem').last().boundingBox(),bounds=await menu.boundingBox();assert(last.y+last.height<=bounds.y+bounds.height+1);await page.keyboard.press('Escape');assert.equal(await page.getByRole('menu').count(),0);assert.deepEqual(errors,[]);
 console.log('Passed: real sidebar context menu, all screen corners, portal placement, live resize, tall-menu scrolling and keyboard access to last action.');
}catch(e){console.log(await page.getByRole('menu').evaluate(el=>({style:el.getAttribute('style'),position:getComputedStyle(el).position,scrollY,innerHeight,view:{top:visualViewport.offsetTop,height:visualViewport.height},body:document.body.getBoundingClientRect().toJSON()})));await page.screenshot({path:'.cache/context-menu-failure.png'});throw e;}finally{await browser.close();}

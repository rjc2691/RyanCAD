// Requires an isolated RyanCAD server on port 8898 with disposable data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>sessionStorage.setItem('ryancad-startup-complete','1'));
 await page.goto('http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();
 const labels=await page.locator('.left-panel > .sidebar-list-label').evaluateAll(elements=>elements.map(el=>({text:el.textContent.trim(),font:getComputedStyle(el).font,weight:getComputedStyle(el).fontWeight})));
 assert.equal(labels[0].text,'Workspace');assert(labels.some(l=>l.text==='Designs'));
 const designs=labels.find(l=>l.text==='Designs');assert.equal(labels[0].font,designs.font);assert.equal(labels[0].weight,designs.weight);
 const left=(await page.locator('.left-panel').boundingBox()).x;
 assert.equal((await page.locator('.workspace-design-heading.active').boundingBox()).x,left);
 assert.equal((await page.locator('.structure-layout[data-active=true]').boundingBox()).x,left);
 await page.getByRole('button',{name:'Manage workspaces',exact:true}).click();
 await page.getByRole('button',{name:'Show all server workspaces',exact:true}).click();
 const password=await page.getByRole('textbox',{name:'Admin password'}).boundingBox(),close=await page.getByRole('button',{name:'Close',exact:true}).boundingBox(),unlock=await page.getByRole('button',{name:'Unlock server list'}).boundingBox();
 assert(Math.abs(password.y-close.y)<1);assert(Math.abs(password.height-close.height)<1);assert(Math.abs(unlock.y-close.y)<1);
 await page.screenshot({path:'.cache/public-workspace-footer.png'});
 await page.getByTitle('RyanCAD Public Workspace',{exact:true}).click();await page.waitForLoadState('domcontentloaded');
 await page.waitForFunction(()=>document.querySelector('.workspace-tree-button')?.textContent.trim()==='RyanCAD Public Workspace');
 const publicData=await page.evaluate(async()=>({workspace:await(await fetch('/api/workspace')).json(),library:await(await fetch('/api/design-library')).json()}));
 assert(publicData.workspace.public);assert.equal(publicData.workspace.designs.length,2);
 assert.equal(publicData.library.workspaces.filter(w=>w.source==='public').length,1);
 assert(publicData.workspace.designs.every(d=>d.id.startsWith('design_')));
 await page.reload();await page.locator('.design-inspector').waitFor();
 const checkIndentation=async()=>{
  const columns=await page.evaluate(()=>{
   const x=selector=>document.querySelector(selector)?.getBoundingClientRect().x;
   return {workspace:x('.workspace-tree-button > svg'),design:x('.workspace-design-heading.active .structure-root > svg'),layout:x('.design-layout-children .structure-layout[data-active=true] > svg'),part:x('.structure-layout-tree .structure-item > svg'),libraryPart:x('.custom-parts-library [role=tree] .structure-item > svg'),labels:[...document.querySelectorAll('.left-panel > .sidebar-list-label')].map(el=>el.getBoundingClientRect().x+parseFloat(getComputedStyle(el).paddingLeft))};
  });
  assert.equal(columns.workspace,columns.part);assert.equal(columns.design,columns.part);assert.equal(columns.layout,columns.libraryPart);assert.equal(columns.layout-columns.design,14);assert.deepEqual(columns.labels,[16,16]);
  console.log('Aligned sidebar columns:',columns.workspace,columns.design,columns.layout);
 };
 await checkIndentation();

 const field=page.getByRole('textbox',{name:'Design description'});
 const initial=await field.evaluate(el=>{const css=getComputedStyle(el),content=el.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);return {value:el.value,lines:content/parseFloat(css.lineHeight),mask:css.maskImage,grip:getComputedStyle(el,'::-webkit-resizer').backgroundImage};});
 assert(Math.abs(initial.lines-Math.round(initial.lines))<.07);assert.equal(initial.mask,'none');assert(initial.grip.includes('svg'));
 await field.fill('Opaque text and ordinary scrolling\n'.repeat(40));
 assert.equal(await field.evaluate(el=>getComputedStyle(el).maskImage),'none');
 await field.fill(initial.value);
 const before=await field.boundingBox();await page.mouse.move(before.x+before.width-4,before.y+before.height-4);await page.mouse.down();await page.mouse.move(before.x+before.width-4,before.y+before.height+35);await page.mouse.up();
 assert((await field.boundingBox()).height>before.height+20);
 await page.screenshot({path:'.cache/public-workspace-sidebar.png'});
 await page.setViewportSize({width:412,height:915});
 await page.getByRole('button',{name:'Show design',exact:true}).click();await checkIndentation();await page.getByRole('button',{name:'Manage workspaces',exact:true}).click();await page.getByRole('button',{name:'Show all server workspaces',exact:true}).click();
 const mobilePassword=await page.getByRole('textbox',{name:'Admin password'}).boundingBox(),mobileClose=await page.getByRole('button',{name:'Close',exact:true}).boundingBox();assert(Math.abs(mobilePassword.y-mobileClose.y)<1);assert(Math.abs(mobilePassword.height-mobileClose.height)<1);
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Show view',exact:true}).click();
 const more=page.getByRole('button',{name:'More tools',exact:true});await more.click();
 const settings=page.getByRole('button',{name:'Workspace settings',exact:true});assert(await settings.isVisible());
 assert.equal(await settings.locator('xpath=ancestor::div[contains(@class,"toolbar-visible-items")]').count(),1);
 const testing=page.getByRole('button',{name:'Testing',exact:true});assert(await testing.isVisible());await testing.click();
 await page.getByRole('dialog',{name:'Testing',exact:true}).waitFor();await page.getByRole('button',{name:'Close testing',exact:true}).click();
 assert.deepEqual(errors,[]);
 console.log('Passed: Workspace label, full-width tree highlights, password/footer alignment, real public workspace opening/reload, whole-line opaque textareas, native resizing, pinned Settings and Testing.');
}finally{await browser.close();}

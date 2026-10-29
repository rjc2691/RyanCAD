import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
async function findPlanes(){
 const rect=await page.locator('.canvas-host').boundingBox(),found={};
 for(let y=-45;y<=45;y+=5)for(let x=-45;x<=45;x+=5){
  await page.mouse.move(rect.x+rect.width/2+x,rect.y+rect.height/2+y);await page.waitForTimeout(20);
  const text=await page.locator('.viewport-hover-target').textContent();const m=text.match(/World (XY|XZ|YZ) plane/);
  if(m&&await page.locator('.viewport-hover-target').isVisible())found[m[1]]=[rect.x+rect.width/2+x,rect.y+rect.height/2+y];
  if(Object.keys(found).length===3)return found;
 }
 return found;
}
try{
 await page.goto('http://127.0.0.1:8898');await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 const found=await findPlanes();const canvas=await page.locator('.canvas-host').boundingBox();await page.mouse.move(canvas.x+canvas.width/2+200,canvas.y+canvas.height/2-100);await page.waitForTimeout(80);assert.notEqual(await page.locator('.canvas-host').getAttribute('data-hover-kind'),'plane','normal view only picks small squares');assert.deepEqual(Object.keys(found).sort(),['XY','XZ','YZ']);
 for(const plane of ['XY','XZ','YZ']){
  await page.mouse.click(...found[plane]);await page.keyboard.press('e');await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor();assert.equal(await page.getByLabel('Sketch plane',{exact:true}).inputValue(),plane);assert.equal(await page.locator('.sketch-plane-choices').count(),0);
  await page.getByRole('button',{name:'Cancel sketch',exact:true}).first().click();await page.keyboard.press('Escape');await page.waitForTimeout(150);
 }
 await page.keyboard.press('e');await page.getByRole('complementary',{name:'Sketch workspace'}).waitFor();assert(await page.getByRole('button',{name:'Sketch Line',exact:true}).isDisabled());let far=null;for(const [x,y]of [[200,-100],[220,-40],[100,-160],[150,50]]){await page.mouse.move(canvas.x+canvas.width/2+x,canvas.y+canvas.height/2+y);await page.waitForTimeout(50);const text=await page.locator('.viewport-hover-target').textContent(),m=text.match(/World (XY|XZ|YZ) plane/);if(m&&await page.locator('.viewport-hover-target').isVisible()){far={plane:m[1],point:[canvas.x+canvas.width/2+x,canvas.y+canvas.height/2+y]};break;}}assert(far,'empty positive-quadrant space should be selectable during setup');await page.screenshot({path:'artifacts/world-plane-quadrant-hover.png'});await page.mouse.click(...far.point);assert.equal(await page.getByLabel('Sketch plane',{exact:true}).inputValue(),far.plane);assert(await page.getByRole('button',{name:'Sketch Line',exact:true}).isEnabled());
 await page.getByRole('button',{name:'Cancel sketch',exact:true}).first().click();await page.keyboard.press('Escape');await page.waitForTimeout(150);await page.mouse.move(...found.XY);await page.waitForTimeout(100);await page.screenshot({path:'artifacts/selectable-world-planes.png'});
 await page.evaluate(async()=>{const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')},s=await(await fetch('/api/state',{headers})).json();const r=await(await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({name:'feature.create',expected_revision:s.document.revision,args:{type:'box',values:{length:100,width:100,height:100,z:-50}}})})).json();for(let i=0;i<600;i++){const j=await(await fetch('/api/jobs/'+r.job_id,{headers})).json();if(j.status==='complete')return;if(j.status==='failed')throw Error(JSON.stringify(j.error));await new Promise(r=>setTimeout(r,50));}});
 await page.locator('.component-select').first().waitFor();await page.getByRole('button',{name:/Fit design/}).click();await page.waitForTimeout(250);const r=await page.locator('.canvas-host').boundingBox();await page.mouse.move(r.x+r.width/2+15,r.y+r.height/2+12);await page.waitForTimeout(100);assert.notEqual(await page.locator('.canvas-host').getAttribute('data-hover-kind'),'plane','model surfaces must block plane hover');assert.deepEqual(errors,[]);
 console.log('Passed: all three world planes hover/select, preselection starts matching sketches, pending sketch picks far quadrant space without overlay, geometry blocks plane hover.');
}catch(e){await page.screenshot({path:'.cache/world-plane-picking/failure.png'});throw e;}finally{await browser.close();}

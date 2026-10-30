// Run against an isolated server/project: creates a disposable browser workspace.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
const output=process.env.RYANCAD_UI_ARTIFACTS || '.cache/history-flow-ui';
await mkdir(output,{recursive:true});

async function checkConnections(order){
 const result=await page.evaluate(()=>{
  const svg=document.querySelector('.history-chronology');
  const connections=[...svg.querySelectorAll('g')].map(group=>{
   const path=group.querySelector('.history-connection');
   const first=path.getPointAtLength(0).matrixTransform(path.getScreenCTM());
   const last=path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM());
   const source=document.querySelector(`[data-feature="${group.dataset.fromFeature}"] .feature-tile`).getBoundingClientRect();
   const target=document.querySelector(`[data-feature="${group.dataset.toFeature}"] .feature-tile`).getBoundingClientRect();
   return {from:group.dataset.fromFeature,to:group.dataset.toFeature,jump:group.dataset.laneJump==='true',
    error:Math.max(Math.abs(first.x-source.right),Math.abs(first.y-(source.top+source.height/2)),
     Math.abs(last.x-target.left),Math.abs(last.y-(target.top+target.height/2)))};
  });
  return {connections,pointerEvents:getComputedStyle(svg).pointerEvents};
 });
 assert.deepEqual(result.connections.map(c=>[c.from,c.to]),order.slice(1).map((id,index)=>[order[index],id]));
 assert(result.connections.every(c=>c.error<=1),JSON.stringify(result.connections));
 assert.equal(result.pointerEvents,'none');
 assert.equal(await page.locator('.timeline-end').count(),1);
 return result.connections;
}

try{
 await page.goto(process.env.RYANCAD_UI_URL || 'http://127.0.0.1:8898');
 await page.waitForFunction(()=>document.querySelector('.design-tree-name')?.textContent==='Untitled design');
 assert.equal(await page.locator('.history-chronology').count(),0);
 const fixture=await page.evaluate(async()=>{
  const headers={'Content-Type':'application/json','X-RyanCAD-Design':sessionStorage.getItem('ryancad-active-design')};
  const state=async()=>(await fetch('/api/state',{headers,cache:'no-store'})).json();
  const command=async(name,args)=>{
   const current=await state();
   const response=await fetch('/api/commands',{method:'POST',headers,body:JSON.stringify({name,args,expected_revision:current.document.revision})});
   let job=await response.json();
   if(!response.ok)throw Error(JSON.stringify(job));
   const id=job.job_id;
   for(let i=0;i<600;i++){
    if(job.status==='complete')return job.result;
    if(job.status==='failed' || job.status==='cancelled')throw Error(JSON.stringify(job.error));
    await new Promise(resolve=>setTimeout(resolve,50));
    job=await(await fetch('/api/jobs/'+id,{headers,cache:'no-store'})).json();
   }
   throw Error('Fixture command timed out: '+name);
  };
  const owners={};
  for(const [index,name] of ['Bracket','Cover','Insert','Base'].entries()){
   await command('feature.create',{type:'box',name:name+' stock',component_name:name,values:{length:10,width:8,height:5,x:index*16}});
   const doc=(await state()).document;
   owners[name]=Object.values(doc.components).find(component=>component.name===name).id;
  }
  const heights={Bracket:5,Cover:5,Insert:5,Base:5};
  const extra=async(name)=>{
   const index=['Bracket','Cover','Insert','Base'].indexOf(name);
   await command('feature.create',{type:'box',name:name+' boss '+heights[name],owner:owners[name],values:{length:4,width:4,height:2,x:index*16,z:heights[name]}});
   heights[name]+=2;
  };
  await extra('Bracket');await extra('Insert');await extra('Insert');await extra('Cover');
  await command('sketch.create',{name:'Layout reference',plane:'XY',entities:[{id:'datum',type:'line',x1:0,y1:0,x2:60,y2:0,fixed:true}]});
  await extra('Base');await extra('Bracket');await extra('Insert');
  const doc=(await state()).document;
  return {order:doc.feature_order,owners};
 });
 await page.waitForFunction(count=>document.querySelectorAll('.history-slot').length===count,fixture.order.length);
 await page.getByRole('button',{name:'Separate part timelines'}).click();
 const original=await checkConnections(fixture.order);
 assert(original.some(c=>!c.jump),'Fixture must exercise same-lane links');
 assert(original.some(c=>c.jump),'Fixture must exercise lane jumps');
 await page.screenshot({path:output+'/history-flow.png'});
 await page.getByRole('group',{name:'Cover timeline',exact:true}).locator('.history-lane-label').scrollIntoViewIfNeeded();
 await page.getByRole('button',{name:'Merge Cover into design timeline'}).click();
 const merged=await checkConnections(fixture.order);
 assert(merged.some((c,i)=>c.jump!==original[i].jump) || await page.getByRole('group',{name:'Cover timeline',exact:true}).count()===0);
 await page.getByRole('button',{name:/^Restore lanes/}).click();
 assert.deepEqual(await checkConnections(fixture.order),original);
 await page.locator('.feature-history-scroll').evaluate(element=>{element.scrollLeft=270;element.scrollTop=100;});
 await checkConnections(fixture.order);
 const scrolling=await page.locator('.feature-history-scroll').evaluate(element=>({x:element.scrollLeft,y:element.scrollTop}));
 assert(scrolling.x>0);assert(scrolling.y>0);
 const sticky=await page.locator('.history-lane-label').first().boundingBox();
 const panel=await page.locator('.feature-history-scroll').boundingBox();
 assert(Math.abs(sticky.x-panel.x-12)<1);
 await page.locator('.feature-history-scroll').evaluate(element=>{element.scrollLeft=0;element.scrollTop=0;});
 await page.screenshot({path:output+'/history-flow.png'});
 // Responsive card sizing and scrolling must not move the SVG off its tracks.
 await page.setViewportSize({width:1800,height:1100});
 await checkConnections(fixture.order);
 await page.locator(`.history-slot[data-feature="${fixture.order[5]}"] button`).click();
 await checkConnections(fixture.order);
 assert.equal(await page.getByRole('group',{name:'Insert timeline',exact:true}).locator('.timeline-end').count(),1);
 await page.screenshot({path:output+'/history-flow-wide.png'});
 await page.setViewportSize({width:1800,height:1400});
 await checkConnections(fixture.order);
 await page.locator('.timeline-panel').screenshot({path:output+'/history-flow-detail.png'});
 await page.getByRole('button',{name:'Separate part timelines'}).click();
 assert.equal(await page.locator('.history-chronology').count(),0);
 assert.equal(await page.locator('.history-slot').count(),fixture.order.length);
 assert.equal(await page.locator('.timeline-end').count(),1);
 assert.deepEqual(errors,[]);
 console.log(`Passed: ${fixture.order.length} events, chronological lane curves, merging/restoring, horizontal/vertical scrolling, sticky labels, clickable cards, one Now marker, unified view, 1500/1800px alignment, no JavaScript errors.`);
}catch(error){
 await page.screenshot({path:output+'/failure.png'});
 throw error;
}finally{
 await browser.close();
}

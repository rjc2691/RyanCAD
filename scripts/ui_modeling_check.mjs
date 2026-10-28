import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const read=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
async function tool(label,title){
  await page.getByRole('button',{name:'All tools',exact:true}).click();
  await page.getByRole('dialog',{name:'Tools and actions'}).locator('.palette-results button').filter({has:page.getByText(label,{exact:true})}).click();
  return page.getByRole('dialog',{name:title,exact:true});
}
async function apply(dialog){
  await dialog.getByRole('button',{name:'Apply',exact:true}).click();
  await dialog.waitFor({state:'hidden',timeout:30000});
  await page.locator('.job-card').waitFor({state:'hidden'});
}
try {
  await page.goto(process.env.RYANCAD_UI_URL||'http://127.0.0.1:8791');
  await page.getByText('Untitled design',{exact:true}).first().waitFor();
  if(Object.keys((await read()).document.features).length)throw Error('Use an empty isolated UI test project.');
  let d=await tool('Box','Create a box');
  await d.getByLabel('Name',{exact:true}).fill('Mounting plate');
  for(const[label,value]of [['Length','80'],['Width','40'],['Height','6']])await d.getByLabel(label,{exact:true}).fill(value);
  await apply(d);
  d=await tool('Shared parameter','Create a shared parameter');
  await d.getByLabel('Parameter name',{exact:true}).fill('Edge offset');
  await d.getByLabel('Value or expression',{exact:true}).fill('8 mm');
  await apply(d);
  d=await tool('Hole','Locate holes');
  for(const[label,value]of [['Hole diameter','6'],['Columns','2'],['Rows','2'],['Column spacing','[Mounting plate · length] - 2 * [Edge offset]'],['Row spacing','[Mounting plate · width] - 2 * [Edge offset]'],['X position','-[Mounting plate · length]/2 + [Edge offset]'],['Y position','-[Mounting plate · width]/2 + [Edge offset]']])await d.getByLabel(label,{exact:true}).fill(value);
  await apply(d);
  d=await tool('Fillet','Round selected edges');await d.getByLabel('Radius',{exact:true}).fill('2');await apply(d);
  d=await tool('Cylinder','Create a cylinder');
  await d.getByLabel('Name',{exact:true}).fill('Alignment pin');
  await d.getByLabel('Diameter',{exact:true}).fill('5.7');await d.getByLabel('Height',{exact:true}).fill('10');
  await d.locator('summary').click();
  await d.getByLabel('X position',{exact:true}).fill('-32');await d.getByLabel('Y position',{exact:true}).fill('-12');await apply(d);
  d=await tool('Repeat part','Repeat a component');await d.getByLabel('X position',{exact:true}).fill('64');await apply(d);
  let state=await read();
  if(state.summary.instances!==3||state.summary.definitions!==2)throw Error('Linked part organization failed.');
  await page.keyboard.press('f');
  await page.waitForTimeout(700);
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/manual-plate.png',fullPage:true});
  d=await tool('Rectangle','Dimensioned rectangle');await d.getByLabel('Name',{exact:true}).fill('Laser plate');await apply(d);
  d=await tool('Circle profile','Dimensioned circle');await d.getByRole('button',{name:'Cut from part',exact:true}).click();await d.getByLabel('Diameter',{exact:true}).fill('10');await apply(d);
  d=await tool('Stock thickness','Planar stock thickness');await d.getByLabel('Stock thickness',{exact:true}).fill('3');await apply(d);
  state=await read();
  const planar=Object.values(state.document.components).find(c=>c.name==='Laser plate');
  const part=state.geometry[planar.id];
  if(part.volume!==null||!part.thickness_preview||Math.abs(part.area-(2400-Math.PI*25))>1e-4)throw Error('Planar stock preview changed physical accounting or lost its cutout.');
  await page.screenshot({path:'artifacts/planar-stock.png',fullPage:true});
  console.log(JSON.stringify({manualPlatePinCreation:true,linkedInstances:true,planarCutAndStockPreview:true,instances:state.summary.instances,definitions:state.summary.definitions,parameters:Object.keys(state.document.parameters).length,errors},null,2));
  if(errors.length)process.exitCode=1;
} catch(error){await page.screenshot({path:'artifacts/manual-ui-failure.png',fullPage:true});console.error(error);process.exitCode=1}
finally{await browser.close()}

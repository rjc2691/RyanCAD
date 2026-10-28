// Human section-based setup, shared by isolated browser regression scripts.
export async function setupOperation(page,panel,label){
 const shape=panel.getByLabel('Tool Profile Shape',{exact:true}),path=panel.locator('[data-tool-section="path"]');
 if(label==='Body Boolean'){await shape.selectOption('body');return;}
 if(label==='Box'){
  await shape.selectOption('rectangle');await page.getByRole('button',{name:'Use world origin',exact:true}).click();
  for(const label of ['Along U','Along V','Normal offset'])await panel.getByLabel(label,{exact:true}).fill('0');
  await panel.getByLabel('Profile plane',{exact:true}).selectOption('XY');await path.getByLabel('Tool Path Type',{exact:true}).selectOption('linear');await path.getByLabel('Direction or axis',{exact:true}).selectOption('normal');await panel.getByLabel('Tool Effect Type',{exact:true}).selectOption('new');return;
 }
 if(label==='Helical sweep'){
  await shape.selectOption('circle');await page.getByRole('button',{name:'Use world origin',exact:true}).click();await panel.getByLabel('Along U',{exact:true}).fill('10');await panel.getByLabel('Normal offset',{exact:true}).fill('0');await panel.getByLabel('Along V',{exact:true}).fill('0');
  await panel.getByLabel('Profile plane',{exact:true}).selectOption('axial');await path.getByLabel('Tool Path Type',{exact:true}).selectOption('helix');await path.getByLabel('Direction or axis',{exact:true}).selectOption('Z');return;
 }
 throw Error('Unmapped operation setup: '+label);
}

// Edit the primary size using its section field, with the same priority as the old size shortcut.
export function operationSize(panel){
 async function field(){for(const label of ['Radius','Bevel distance','Profile diameter','Path distance']){const input=panel.getByLabel(label,{exact:true});if(await input.count())return input;}throw Error('No operation size field');}
 return {fill:async value=>(await field()).fill(value),press:async key=>(await field()).press(key)};
}

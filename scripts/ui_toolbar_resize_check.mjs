// Run against an isolated test server on port 8898; never attaches to an open browser.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1920,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/ResizeObserver loop|Maximum update depth/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript(()=>sessionStorage.setItem('ryancad-startup-complete','1'));
 await page.goto('http://127.0.0.1:8898');await page.locator('.design-inspector').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 const stable=async(frames=24)=>{
  const result=await page.evaluate(async frames=>{
   const next=()=>new Promise(resolve=>requestAnimationFrame(resolve));
   // Allow the resize observer and layout-effect update to finish.
   for(let i=0;i<8;i++)await next();
   const samples=[];
   for(let i=0;i<frames;i++){
    const root=document.querySelector('.overflow-toolbar'),row=root.querySelector('.toolbar-visible-items'),toggle=root.querySelector('.toolbar-overflow-toggle');
    const r=root.getBoundingClientRect(),v=row.getBoundingClientRect(),t=toggle?.getBoundingClientRect();
    const children=[...row.children].map(el=>el.getBoundingClientRect());
    const widths=[...root.querySelectorAll('[data-overflow-item]')].map(el=>Math.ceil(el.getBoundingClientRect().width));
    const settings=root.querySelector('[data-toolbar-action=settings]');
    if(toggle&&settings&&row.lastElementChild?.querySelector('[data-toolbar-action]')!==settings)throw Error('Settings must stay immediately before More');
    samples.push({count:row.children.length,toggle:!!toggle,budget:root.clientWidth,total:widths.reduce((a,b)=>a+b,0)+4*Math.max(0,widths.length-1),
     centerError:Math.abs(((children.length?v.left:t.left)+(t?t.right:v.right))/2-(r.left+r.right)/2),
     gaps:children.slice(1).map((child,i)=>child.left-children[i].right),
     fits:(!children.length||v.left>=r.left-.5)&&(!t||t.right<=r.right+.5)&&(!children.length||v.right<=r.right+.5)});
    await next();
   }
   return samples;
  },frames);
  const signatures=new Set(result.map(s=>JSON.stringify([s.count,s.toggle,s.budget])));
  assert.equal(signatures.size,1,`Toolbar kept changing after resize: ${JSON.stringify([...signatures])}`);
  for(const sample of result){assert(sample.fits);assert(sample.centerError<=1);assert.equal(sample.toggle,sample.total>sample.budget);assert(sample.gaps.every(gap=>Math.abs(gap-4)<.5));}
  return result[0];
 };
 const initial=await stable();assert(!initial.toggle);
 const widths=[1920,1700,1660,1601,1600,1599,1500,1440,1280,1231,1230,1229,1100,1000,999,768,430,412,393,360,1000,1440,1920];
 for(const width of widths){await page.setViewportSize({width,height:1000});await stable();}
 console.log('Passed window resize thresholds and centered 4px button spacing.');
 await page.setViewportSize({width:1440,height:1000});await stable();
 const divider=page.getByRole('separator',{name:'Resize project sidebar'}),box=await divider.boundingBox();
 await page.mouse.move(box.x+3,box.y+40);await page.mouse.down();
 for(let x=200;x<=420;x+=10)await page.mouse.move(x,box.y+40);
 await page.mouse.up();await stable(120);
 for(let i=0;i<25;i++)await page.setViewportSize({width:1000+i*41,height:1000});
 await page.setViewportSize({width:1440,height:1000});await stable(120);
 console.log('Passed rapid window/sidebar resizing with two seconds of steady frames afterwards.');
 const more=page.getByRole('button',{name:'More tools',exact:true});await more.click();await stable(40);
 const tray=await page.locator('.toolbar-overflow-tray').boundingBox();assert(tray.x>=0&&tray.x+tray.width<=1441);
 await page.keyboard.press('Escape');await stable();
 await page.getByRole('button',{name:'Sketch',exact:true}).click();await page.getByRole('navigation',{name:'Sketch tools',exact:true}).waitFor();
 for(const width of [1920,1440,1000,412,393,1440]){await page.setViewportSize({width,height:1000});await stable();}
 await page.keyboard.press('Escape');await page.getByRole('navigation',{name:'Modeling tools',exact:true}).waitFor();await stable(90);
 assert.deepEqual(errors,[]);
 console.log('Passed open tray, sketch/model toolbar switching and idle stability; no browser errors.');
}finally{await browser.close();}

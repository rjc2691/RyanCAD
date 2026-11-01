import ParameterGlyph from "./ParameterGlyph";
import {useState} from "react";
import {Box, Circle, Cuboid, Cylinder, ChevronRight,ChevronDown} from "lucide-react";
import {Modal} from "./Forms";
import ContextMenu from './ContextMenu';
import {NumericInput} from "./NumericInput";
import type {RunCommand} from "./types";
export type PrimitiveTemplate={shape:string;name:string;icon:typeof Box;fields:Record<string,string>};
export const primitiveTemplates:PrimitiveTemplate[]=[
 {shape:'box',name:'Box',icon:Box,fields:{length:'40',width:'30',height:'10'}},
 {shape:'sphere',name:'Sphere',icon:Circle,fields:{diameter:'20'}},
 {shape:'cylinder',name:'Cylinder',icon:Cylinder,fields:{diameter:'10',height:'20'}},
];
export default function PrimitiveLibrary({run,disabled,onPlaced,onAddedToPart,activePart,onPreview,activePrimitive}:{run:RunCommand;disabled:boolean;onPlaced:()=>void;onAddedToPart:(id:string)=>void;activePart:{id:string;name:string}|null;onPreview:(template:PrimitiveTemplate,context:(x:number,y:number)=>void)=>void;activePrimitive?:string}){
 const [expanded,setExpanded]=useState(()=>new Set<string>());
 const [menu,setMenu]=useState<{template:PrimitiveTemplate;x:number;y:number}|null>(null);
 const [copy,setCopy]=useState<{template:PrimitiveTemplate;parent:string|null;parentName:string}|null>(null);
 const [values,setValues]=useState<Record<string,string>>({}),[name,setName]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
 const configure=(template:PrimitiveTemplate,parent:string|null,parentName:string)=>{setCopy({template,parent,parentName});setName(template.name);setValues({...template.fields});setError('');};
 const openMenu=(template:PrimitiveTemplate,x:number,y:number)=>{if(!disabled)setMenu({template,x,y});};
 return <details className="primitive-library sidebar-library" aria-label="Primitives" open>
 <summary className="structure-section design-category"><ChevronRight className="library-chevron" size={12}/><Cuboid size={15}/><span>Primitives</span><small>{primitiveTemplates.length}</small></summary>
 {primitiveTemplates.map(t=><div className="primitive-template" key={t.shape}>
 <div className={`tool-library-row primitive-template-row ${activePrimitive===t.shape?'selected':''}`} onContextMenu={e=>{e.preventDefault();e.stopPropagation();openMenu(t,e.clientX,e.clientY);}}>
 <button disabled={disabled} title={`View ${t.name} primitive`} aria-label={`View ${t.name} primitive`} onClick={()=>onPreview(t,(x,y)=>openMenu(t,x,y))}><t.icon size={14}/><span>{t.name}</span></button>
 <button className="icon-button primitive-parameter-toggle" aria-label={`${expanded.has(t.shape)?'Collapse':'Expand'} ${t.name} parameters`} aria-expanded={expanded.has(t.shape)} onClick={()=>setExpanded(previous=>{const next=new Set(previous);if(next.has(t.shape))next.delete(t.shape);else next.add(t.shape);return next;})}>{expanded.has(t.shape)?<ChevronDown size={12}/>:<ChevronRight size={12}/>}</button>
 </div>
 {expanded.has(t.shape)&&<dl className="primitive-parameters" aria-label={`${t.name} parameters`}>{Object.keys(t.fields).map(field=><div key={field}><dt><ParameterGlyph/>{field[0].toUpperCase()+field.slice(1)}</dt></div>)}</dl>}
 </div>)}
 {menu&&<ContextMenu x={menu.x} y={menu.y} title={menu.template.name} onClose={()=>setMenu(null)} actions={[
 {label:'Add to layout',disabled:disabled||pending,action:()=>configure(menu.template,null,'layout')},
 {label:'Add to active part',disabled:disabled||pending||!activePart,action:()=>{if(activePart)configure(menu.template,activePart.id,activePart.name);}},
 ]}/>}
 {copy&&<Modal title={`Add ${copy.template.name} to ${copy.parent?'active part':'layout'}`} eyebrow="PRIMITIVE COPY" onClose={()=>{if(!pending)setCopy(null);}}>
 <form data-primitive-copy="true" onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(!pending)setCopy(null);}}} onSubmit={async e=>{e.preventDefault();if(pending||disabled)return;setPending(true);setError('');try{await run('part.primitive',{shape:copy.template.shape,name,values,place:true,...(copy.parent?{parent:copy.parent}:{})});const destination=copy.parent;setCopy(null);if(destination)onAddedToPart(destination);else onPlaced();}catch(e:any){setError(e.message||'Could not create primitive copy.');}finally{setPending(false);}}}>
 {copy.parent&&<p className="field-help">Active part: {copy.parentName}</p>}
 <label className="field">Part name<input required value={name} onChange={e=>setName(e.target.value)} disabled={pending}/></label>
 {Object.keys(copy.template.fields).map(field=><label className="field" key={field}>{field[0].toUpperCase()+field.slice(1)} (mm)<NumericInput required kind="length" value={values[field]||''} disabled={pending} onChange={e=>setValues({...values,[field]:e.target.value})}/></label>)}
 {error&&<p role="alert" className="structure-error">{error}</p>}
 <footer><button className="button primary" disabled={disabled||pending}>{copy.parent?'Add to active part':'Add to layout'}</button><button type="button" className="button secondary" disabled={pending} onClick={()=>setCopy(null)}>Cancel</button></footer>
 </form></Modal>}
 </details>;
}

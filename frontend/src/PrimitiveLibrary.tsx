import {useState} from "react";
import {Box, Circle, Cuboid, Cylinder, ChevronRight} from "lucide-react";
import {Modal} from "./Forms";
import {NumericInput} from "./NumericInput";
import type {RunCommand} from "./types";

const templates:{shape:string;name:string;icon:typeof Box;fields:Record<string,string>}[]=[
  {shape:"box",name:"Box",icon:Box,fields:{length:"40",width:"30",height:"10"}},
  {shape:"sphere",name:"Sphere",icon:Circle,fields:{diameter:"20"}},
  {shape:"cylinder",name:"Cylinder",icon:Cylinder,fields:{diameter:"10",height:"20"}},
];
export default function PrimitiveLibrary({run,disabled,onPlaced}:{run:RunCommand;disabled:boolean;onPlaced:()=>void}){
  const [template,setTemplate]=useState<typeof templates[number]|null>(null);
  const [values,setValues]=useState<Record<string,string>>({}),[name,setName]=useState("");
  const [pending,setPending]=useState(false),[error,setError]=useState("");
  return <details className="primitive-library sidebar-library" aria-label="Primitives" open>
    <summary className="structure-section design-category"><ChevronRight className="library-chevron" size={12}/><Cuboid size={15}/><span>Primitives</span><small>{templates.length}</small></summary>
    {templates.map(t=><div className="tool-library-row" key={t.shape}><button disabled={disabled} title={`Place ${t.name} in layout`} onClick={()=>{setTemplate(t);setName(t.name);setValues({...t.fields});setError("");}}><t.icon size={14}/><span>{t.name}</span></button></div>)}
    {template&&<Modal title={`Place ${template.name}`} eyebrow="PRIMITIVE COPY" onClose={()=>{if(!pending)setTemplate(null);}}>
      <form onSubmit={async e=>{e.preventDefault();if(pending||disabled)return;setPending(true);setError("");try{await run("part.primitive",{shape:template.shape,name,values,place:true});setTemplate(null);onPlaced();}catch(e:any){setError(e.message||"Could not place primitive.");}finally{setPending(false);}}}>
        <label className="field">Part name<input required value={name} onChange={e=>setName(e.target.value)} disabled={pending}/></label>
        {Object.keys(template.fields).map(field=><label className="field" key={field}>{field[0].toUpperCase()+field.slice(1)} (mm)<NumericInput required kind="length" value={values[field]||""} disabled={pending} onChange={e=>setValues({...values,[field]:e.target.value})}/></label>)}
        {error&&<p role="alert" className="structure-error">{error}</p>}
        <footer><button className="button primary" disabled={disabled||pending}>Place in layout</button><button type="button" className="button secondary" disabled={pending} onClick={()=>setTemplate(null)}>Cancel</button></footer>
      </form>
    </Modal>}
  </details>;
}

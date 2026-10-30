import {useEffect,useRef,useState,type ReactNode} from "react";
import {Box,Boxes,Layers,SquareDashed,GitBranch} from "lucide-react";
import ToolBodyIcon from "./ToolBodyIcon";
import {designOverview} from "./designOverviewModel";
import type {RunCommand,State} from "./types";

export default function DesignOverview({state,run,disabled,measurements,onParameters}:{
  state:State;run:RunCommand;disabled:boolean;measurements:ReactNode;onParameters:()=>void;
}){
  const doc=state.document,info=designOverview(state);
  const [description,setDescription]=useState(doc.notes),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const base=useRef(doc.notes);
  useEffect(()=>{
    const previous=base.current;
    base.current=doc.notes;
    setDescription(current=>current===previous?doc.notes:current);
  },[doc.notes]);
  const saveDescription=async()=>{
    if(disabled||saving||description.trim()===doc.notes)return;
    setSaving(true);setError("");
    try{await run("document.describe",{description:description.trim()});setDescription(description.trim());}
    catch(e:any){setError(e.message||"Could not save description.");}
    finally{setSaving(false);}
  };
  const units=async(value:string)=>{
    if(disabled||saving||value===doc.display_units)return;
    setSaving(true);setError("");
    try{await run("document.units",{units:value});}catch(e:any){setError(e.message||"Could not change units.");}finally{setSaving(false);}
  };
  return <div className="design-inspector" aria-label="Design overview">
    <div className="design-overview-heading">
      <span className="design-overview-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM4 13h6m4 0h6M13 4v5m0 4v7M10 13v-3M10 10a3 3 0 0 1 3 3M2 2v3m0-3h3M22 19v3h-3"/></svg></span>
      <div><span className="eyebrow">Design</span><h2>{doc.name}</h2></div>
    </div>
    <section className="inspector-section design-properties" aria-label="Design properties">
      <div className="section-heading"><h3>Design properties</h3>{saving&&<small role="status">Saving…</small>}</div>
      <label className="field"><span>Description</span><textarea aria-label="Design description" rows={3} maxLength={4000} disabled={disabled||saving} value={description} placeholder="Add a design description" onChange={e=>setDescription(e.target.value)} onBlur={()=>void saveDescription()} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();setDescription(doc.notes);}else if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.currentTarget.blur();}}}/></label>
      <label className="field design-unit-field"><span>Display units</span><select aria-label="Design display units" disabled={disabled||saving} value={doc.display_units} onChange={e=>void units(e.target.value)}><option value="mm">Millimeters (mm)</option><option value="in">Inches (in)</option></select></label>
      <p className="field-help">Measurements use these units. Numeric inputs use mm unless explicit units are provided.</p>
      {error&&<p className="error-text" role="alert">{error}</p>}
    </section>
    <div className="design-structure-summary" aria-label="Design structure summary">
      <div className="design-structure-card" data-design-count="layouts">
        <Layers size={14}/><div><span>Layouts</span><small className="design-card-detail">{info.placements} part {info.placements===1?"copy":"copies"} across layouts</small></div><strong>{info.layouts}</strong>
      </div>
      <div className="design-structure-card" data-design-count="parts">
        <Boxes size={14}/><div><span>3D Parts</span><small className="design-card-detail" title="Reusable parts; unique solid component definitions count linked copies once."><Box size={10}/><b>{info.components}</b> {info.components===1?"component definition":"component definitions"}</small></div><strong>{info.parts}</strong>
      </div>
      <div className="design-structure-card" data-design-count="sketches">
        <SquareDashed size={14}/><div><span>2D Sketches</span><small>Profiles and reference geometry</small></div><strong>{info.sketches}</strong>
      </div>
    </div>
    {(info.tools>0||info.variations>0)&&<div className="design-library-summary">
      {info.tools>0&&<span><ToolBodyIcon size={13}/>{info.tools} 3D Tool {info.tools===1?"Body":"Bodies"}</span>}
      {info.variations>0&&<span><GitBranch size={13}/>{info.variations} {info.variations===1?"variation":"variations"}</span>}
    </div>}
    {info.activeLayout&&<section className="inspector-section design-active-layout" aria-label="Active layout summary">
      <div className="section-heading"><h3>Active layout</h3></div>
      <div className="design-active-layout-name"><Layers size={14}/><strong>{info.activeLayout}</strong></div>
      <div className="design-layout-counts"><span>{info.activeParts} part {info.activeParts===1?"placement":"placements"}</span><span>{info.activeComponents} {info.activeComponents===1?"component":"components"}</span></div>
    </section>}
    {measurements}
    <button className="design-parameters-link" onClick={onParameters}><GitBranch size={14}/><span>Named parameters</span><strong>{info.parameters}</strong></button>
  </div>;
}

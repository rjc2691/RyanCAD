import {Box, Boxes, GitBranch} from "lucide-react";
import {useEffect,useRef,useState,type ReactNode} from "react";
import type {Occurrence, RunCommand, State} from "./types";

export default function PartOverview({state,part,measurements,onParameters,run,disabled}:{state:State;part:Occurrence;measurements:ReactNode;onParameters:()=>void;run:RunCommand;disabled:boolean}) {
  const doc=state.document, definition=doc.components[part.definition];
  const savedDescription=definition?.description||"";
  const [description,setDescription]=useState(savedDescription),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const base=useRef(savedDescription);
  useEffect(()=>{const previous=base.current;base.current=savedDescription;setDescription(current=>current===previous?savedDescription:current);},[savedDescription]);
  const saveDescription=async()=>{
    if(disabled||saving||description.trim()===savedDescription)return;
    setSaving(true);setError("");
    try{await run("part.describe",{id:part.definition,description:description.trim()});setDescription(description.trim());}
    catch(e:any){setError(e.message||"Could not save description.");}finally{setSaving(false);}
  };
  const children=state.occurrences.filter(o=>o.id.startsWith(`${part.id}/`) && !o.suppressed);
  const solids=children.filter(o=>o.kind!=="assembly" && doc.components[o.definition]?.purpose!=="tool");
  const unique=new Set(solids.map(o=>o.source_definition||doc.components[o.definition]?.source_definition||o.definition));
  const nestedParts=children.filter(o=>o.structure_role==="part").length;
  const features=[...unique].reduce((total,id)=>total+(doc.components[id]?.feature_ids.length||0),0);
  const variations=Object.values(doc.variations||{}).filter(v=>v.part===part.definition).length;
  const placed=state.occurrences.filter(o=>o.definition===part.definition&&!o.library&&!!o.layout&&!o.suppressed);
  const placements=placed.length, layouts=new Set(placed.map(o=>o.layout)).size;
  const parameters=(state.part_parameters?.[part.definition]||[]).filter(id=>doc.parameters[id]?.named).length;
  return <div className="design-inspector part-inspector" aria-label="Part overview">
    <div className="design-overview-heading"><span className="design-overview-icon" aria-hidden="true"><Boxes size={24} strokeWidth={1.4}/></span><div><span className="eyebrow">Part</span><h2>{definition?.name||part.name}</h2></div></div>
    <section className="inspector-section design-properties" aria-label="Part properties"><div className="section-heading"><h3>Part properties</h3>{saving&&<small role="status">Saving…</small>}</div>
      {part.variation&&<div className="property-row"><span>Variation</span><strong>{doc.variations?.[part.variation]?.name||"Variation"}</strong></div>}
      <label className="field"><span>Description</span><textarea aria-label="Part description" rows={3} maxLength={4000} disabled={disabled||saving} value={description} placeholder="Add a part description" onChange={e=>setDescription(e.target.value)} onBlur={()=>void saveDescription()} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();setDescription(savedDescription);}else if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.currentTarget.blur();}}}/></label>
      {error&&<p className="error-text" role="alert">{error}</p>}
      <div className="property-row"><span>Definition</span><strong>{definition?.read_only?"Imported · read-only":"Editable"}</strong></div>
      <div className="property-row" title="Distinct layouts containing this part, including nested copies and variations."><span>Used in layouts</span><strong>{layouts}</strong></div>
      <div className="property-row" title="Total copies of this part across all layouts, including nested copies and variations."><span>Copies in layouts</span><strong>{placements}</strong></div>
    </section>
    <div className="design-structure-summary" aria-label="Part structure summary">
      <div className="design-structure-card" data-part-count="components"><Box size={14}/><div><span>Components</span><small>{unique.size} unique solid {unique.size===1?"definition":"definitions"}</small></div><strong>{solids.length}</strong></div>
      <div className="design-structure-card" data-part-count="parts"><Boxes size={14}/><div><span>Nested parts</span><small>Parts arranged inside this part</small></div><strong>{nestedParts}</strong></div>
      <div className="design-structure-card" data-part-count="features"><GitBranch size={14}/><div><span>Features</span><small>Across unique component definitions</small></div><strong>{features}</strong></div>
    </div>
    {variations>0&&<div className="design-library-summary"><span><GitBranch size={13}/>{variations} {variations===1?"variation":"variations"}</span></div>}
    {measurements}
    <button className="design-parameters-link" onClick={onParameters}><GitBranch size={14}/><span>Named parameters used by this part</span><strong>{parameters}</strong></button>
  </div>;
}

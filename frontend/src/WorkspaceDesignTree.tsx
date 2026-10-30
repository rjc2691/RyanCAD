import {useState, useEffect, type ReactNode} from "react";
import {ChevronDown, ChevronRight, Layers} from "lucide-react";
import {api, designHeaders, setCurrentDesignId, waitJob} from "./api";
import type {State} from "./types";
import type {WorkspaceInfo} from "./WorkspaceDialog";

export default function WorkspaceDesignTree({workspace,activeId,activeRow,activeLayouts,disabled,onError}:{
  workspace:WorkspaceInfo|null;activeId:string|null;activeRow:ReactNode;activeLayouts:ReactNode;disabled:boolean;onError:(e:any)=>void;
}){
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set(activeId?[activeId]:[]));
  useEffect(()=>{if(activeId)setExpanded(v=>new Set([...v,activeId]));},[activeId]);
  const [documents,setDocuments]=useState<Record<string,State>>({});
  const [loading,setLoading]=useState<string|null>(null);
  const [pending,setPending]=useState(false);
  const toggle=async(id:string)=>{
    const opening=!expanded.has(id);
    setExpanded(v=>{const next=new Set(v);if(opening)next.add(id);else next.delete(id);return next;});
    if(opening&&id!==activeId){
      setLoading(id);
      try{const data=await api("/state",{headers:designHeaders(id)});setDocuments(v=>({...v,[id]:data}));}
      catch(e){onError(e);}finally{setLoading(null);}
    }
  };
  const open=async(id:string,layout?:string)=>{
    if(disabled||pending)return;setPending(true);
    try{
      if(layout){const current=await api("/state",{headers:designHeaders(id)});
        await waitJob(await api("/commands",{method:"POST",headers:designHeaders(id),body:JSON.stringify({name:"layout.select",args:{id:layout},expected_revision:current.document.revision})}),undefined,120,id);}
      await api(`/workspace/designs/${id}/select`,{method:"POST"});
      setCurrentDesignId(id);window.location.reload();
    }catch(e){onError(e);setPending(false);}
  };
  // Expansion is browsing state; viewing another branch never changes the active design.
  const designs=workspace?.designs.filter(d=>!d.deleted)||[];
  return <div className="workspace-design-tree" role="tree" aria-label="Workspace designs">
    {designs.map(d=>{const active=d.id===activeId,isOpen=expanded.has(d.id);
      const layouts=Object.values(documents[d.id]?.document.components||{}).filter(c=>c.structure_role==="layout");
      return <div key={d.id} role="treeitem" aria-expanded={isOpen} className="workspace-design-branch">
        <div className={`workspace-design-heading ${active?"active":""}`}>
          <button className="icon-button" aria-label={`${isOpen?"Collapse":"Expand"} ${d.name}`} onClick={()=>void toggle(d.id)}>{isOpen?<ChevronDown size={12}/>:<ChevronRight size={12}/>}</button>
          {active?activeRow:<button className="inactive-design-name" disabled={disabled||pending} onClick={()=>void open(d.id)}><BlueprintIcon/><span>{d.name}</span></button>}
        </div>
        {isOpen&&(active?activeLayouts:<div className="design-layout-children" role="group">
          {loading===d.id?<small>Loading layouts…</small>:layouts.map(l=><div className="structure-layout" key={l.id}><Layers size={14}/><button className="layout-name" disabled={disabled||pending} onClick={()=>void open(d.id,l.id)}>{l.name}</button></div>)}
          {loading!==d.id&&!layouts.length&&<small>No layouts</small>}
        </div>)}
      </div>;
    })}
  </div>;
}

function BlueprintIcon(){return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v16H4zM4 13h6m4 0h6M13 4v5m0 4v7M10 13v-3"/><path d="M10 10a3 3 0 0 1 3 3M2 2v3m0-3h3M22 19v3h-3"/></svg>;}

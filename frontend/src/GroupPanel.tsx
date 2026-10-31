import {forwardRef,useEffect,useImperativeHandle,useState} from "react";
import {Check,FolderPlus,Folder,Boxes,Box,X} from "lucide-react";
import type {Occurrence} from "./types";
export interface GroupPanelHandle {confirm:()=>void;cancel:()=>void;}
export default forwardRef<GroupPanelHandle,{
  rows:Occurrence[];selected:string[];onSelected:(ids:string[])=>void;
  onApply:(mode:string,name:string,target:string,members:string[])=>Promise<void>;onClose:()=>void;groupKind?:'layout'|'part';
}>(function GroupPanel({rows,selected,onSelected,onApply,onClose,groupKind='part'},ref){
  const label=groupKind==='layout'?'Layout Group':'Part Group';
  const [mode,setMode]=useState<'new'|'add'>('new'),[name,setName]=useState(label),[target,setTarget]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const groups=rows.filter(o=>o.structure_role==='group'&&!o.pattern_mode);
  const members=rows.filter(o=>selected.includes(o.id)&&!(mode==='add'&&o.id===target));
  const valid=members.length>0&&(mode==='new'?!!name.trim():groups.some(o=>o.id===target));
  useEffect(()=>{if(mode==='add'&&target&&selected.includes(target))onSelected(selected.filter(id=>id!==target));},[mode,target,selected,onSelected]);
  const apply=async()=>{if(busy||!valid)return;setBusy(true);setError('');try{await onApply(mode,name.trim(),mode==='add'?target:'',members.map(o=>o.id));}catch(e:any){setError(e.message||'Could not group the selection.');}finally{setBusy(false);}};
  useImperativeHandle(ref,()=>({confirm:()=>void apply(),cancel:()=>{if(!busy)onClose();}}));
  return <aside className="operation-panel group-panel" aria-label={`${label} workspace`}>
    <header className="operation-header"><h2><FolderPlus size={18}/>{label}</h2><button className="icon-button" disabled={busy} aria-label="Cancel grouping" onClick={onClose}><X size={16}/></button></header>
    <div className="operation-fields">
      <section className="operation-section">
        <label className="field"><span>Group Operation Type</span><select aria-label="Group Operation Type" value={mode} disabled={busy} onChange={e=>{setMode(e.target.value as 'new'|'add');setError('');}}><option value="new">Create New Group</option><option value="add">Add to Existing Group</option></select></label>
        <label className="field"><span>Group name</span>{mode==='new'?<input aria-label="Group name" value={name} disabled={busy} onChange={e=>setName(e.target.value)} maxLength={120}/>:<select aria-label="Group name" value={target} disabled={busy} onChange={e=>{setTarget(e.target.value);setError('');}}><option value="">Choose {label.toLowerCase()}</option>{groups.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>}</label>
        {mode==='add'&&!groups.length&&<p className="field-help">No {label.toLowerCase()}s at this level.</p>}
      </section>
      <section className="operation-section group-selection-section">
        <h3>Selected {groupKind==='layout'?'parts':'members'} <small>{members.length}</small></h3>
        <p className="field-help">Select {groupKind==='layout'?'parts':'components or parts'} in the viewport or project tree.</p>
        {members.length?<ul className="group-selected-members" aria-label="Selected group members">{members.map(o=><li key={o.id}><span className="group-member-icon">{o.structure_role==='group'?<Folder size={15}/>:o.structure_role==='part'?<Boxes size={15}/>:<Box size={15}/>}</span><span className="group-member-name" title={o.name}>{o.name}</span><button className="icon-button" disabled={busy} aria-label={`Deselect ${o.name}`} title="Deselect" onClick={()=>onSelected(selected.filter(id=>id!==o.id))}><X size={14}/></button></li>)}</ul>:<p className="group-selection-empty">No {groupKind==='layout'?'parts':'members'} selected.</p>}
        {error&&<p role="alert" className="operation-error">{error}</p>}
      </section>
    </div>
    <footer className="group-commit"><button className="primary" disabled={busy||!valid} onClick={apply}><Check size={14}/>{busy?'Grouping…':mode==='new'?'Create group':'Add to group'}</button><button disabled={busy} onClick={onClose}>Cancel</button></footer>
  </aside>;
});

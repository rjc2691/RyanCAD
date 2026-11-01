import ReferencePartPreview,{type ReferencePreviewSource} from "./ReferencePartPreview";
import DesignIcon from "./DesignIcon";
import ReferencePartIcon from "./ReferencePartIcon";
import {useEffect,useState} from 'react';
import {ChevronRight,UserRound,Library,Users} from 'lucide-react';
import {Modal} from './Forms';
import {api,waitJob} from './api';
export default function ReferencePartsDialog({revision,onClose,onImported}:{revision:number;onClose:()=>void;onImported:()=>Promise<void>}){
 const [designs,setDesigns]=useState<any[]|null>(null),[selected,setSelected]=useState<Set<string>>(new Set()),[error,setError]=useState(''),[busy,setBusy]=useState(false),[warnings,setWarnings]=useState<string[]>([]),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;setError('');setDesigns(null);api('/reference-parts').then(data=>{if(live){setDesigns(data.designs);setWarnings(data.warnings||[]);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[attempt]);
 const [preview,setPreview]=useState<ReferencePreviewSource|null>(null);
 const key=(d:any,p:any)=>JSON.stringify([d.workspace,d.id,p.id]);
 const groups=[
  {id:'yours',title:'Your designs',icon:UserRound,designs:designs?.filter(d=>!d.bundled&&!d.shared)||[],empty:'No designs available.'},
  {id:'stock',title:'Stock / standard designs',icon:Library,designs:designs?.filter(d=>d.bundled)||[],empty:'No stock designs available.'},
  {id:'shared',title:'Shared designs',icon:Users,designs:[],empty:'Public design sharing is not available yet.'},
 ];
 return <Modal wide title="Import Reference Parts" eyebrow="PART LIBRARY" onClose={()=>{if(!busy)onClose();}}>
 <p className="reference-import-help">Reference parts stay unchanged. Editing creates a custom copy.</p>
 <div className="reference-import-layout">
 <div className="reference-parts-catalog" aria-busy={designs===null}>
 {designs===null&&!error&&<p>Loading designs…</p>}
 {designs&&groups.map(group=><section key={group.id} className="reference-catalog-section" aria-labelledby={`reference-source-${group.id}`}>
 <h3><group.icon size={14}/><span id={`reference-source-${group.id}`}>{group.title}</span>{group.id!=='shared'&&<small>{group.designs.length}</small>}</h3>
 <div className="reference-catalog-list" role="group" aria-label={`${group.title} list`} tabIndex={group.designs.length?0:undefined}>
 {group.designs.map(d=><details key={d.workspace+d.id} open><summary><ChevronRight size={12} className="reference-design-chevron"/><DesignIcon className="reference-design-icon"/><span>{d.name}</span>{group.id==='yours'&&<small>{d.workspace_name}</small>}</summary>
 {d.parts.map((p:any)=><label key={p.id} data-preview-active={preview?.part===p.id&&preview?.design===d.id&&preview?.workspace===d.workspace} onClick={()=>setPreview({workspace:d.workspace,design:d.id,part:p.id,name:p.name})}><input type="checkbox" onFocus={()=>setPreview({workspace:d.workspace,design:d.id,part:p.id,name:p.name})} disabled={busy} checked={selected.has(key(d,p))} onChange={e=>setSelected(previous=>{const next=new Set(previous);if(e.target.checked)next.add(key(d,p));else next.delete(key(d,p));return next;})}/><ReferencePartIcon size={14} className="reference-part-icon"/><span>{p.name}</span></label>)}
 {!d.parts.length&&<p className="muted"><i>No custom parts</i></p>}</details>)}
 {!group.designs.length&&<p className="reference-catalog-empty">{group.empty}</p>}
 </div></section>)}
 </div>
 <ReferencePartPreview source={preview}/>
 </div>
 {warnings.map((warning,i)=><p key={i} role="status" className="structure-error">{warning}</p>)}
 {error&&<p role="alert" className="structure-error">{error} <button className="button small" disabled={busy} onClick={()=>setAttempt(value=>value+1)}>Retry</button></p>}
 <div className="reference-import-actions"><button className="button primary" disabled={busy||!selected.size} onClick={async()=>{setBusy(true);setError('');try{const parts=[...selected].map(value=>{const [workspace,design,part]=JSON.parse(value);return {workspace,design,part};});await waitJob(await api('/reference-parts/import',{method:'POST',body:JSON.stringify({parts,expected_revision:revision})}));await onImported();onClose();}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>{busy?'Importing…':`Import${selected.size?' ('+selected.size+')':''}`}</button><button className="button" disabled={busy} onClick={onClose}>Cancel</button></div>
 </Modal>;
}

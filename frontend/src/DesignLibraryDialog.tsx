import {useEffect,useState,type ReactNode} from 'react';
import {FolderOpen,Library,FilePlus2,Check,RotateCcw} from 'lucide-react';
import DesignIcon from './DesignIcon';
import ReferencePartPreview from './ReferencePartPreview';
import {Modal} from './Forms';
import ContextMenu from './ContextMenu';
import {useDeleteConfirmation} from './useDeleteConfirmation';
import {api,setCurrentDesignId,waitJob} from './api';
type Design={id:string;name:string;active?:boolean;modified_at?:string;last_active?:boolean;last_edited?:boolean;is_empty?:boolean};
type LibraryWorkspace={id:string;name:string;source:'yours'|'stock';current?:boolean;starter_design?:string;designs:Design[]};
type Pick={workspace:LibraryWorkspace;design:Design}|'blank'|null;
type Props={initial?:'blank'|'stock'|'yours'|'recent';canSwitch:boolean;activeDesign:string|null;onClose:()=>void;onRefresh:()=>Promise<void>;embedded?:boolean;onBeforeOpen?:()=>Promise<void>;onNavigate?:(id:string)=>void;onBusyChange?:(busy:boolean)=>void;reuseStarter?:boolean;hidePristineStarter?:boolean;showCancel?:boolean;primaryLabel?:string;footerNote?:ReactNode};
function initialPick(groups:LibraryWorkspace[],initial:Props['initial'],activeDesign:string|null):Pick{
 if(initial==='blank')return 'blank';
 if(initial==='recent'){
  const candidates=groups.filter(w=>w.source==='yours').flatMap(workspace=>workspace.designs.map(design=>({workspace,design}))).sort((a,b)=>(b.design.modified_at||'').localeCompare(a.design.modified_at||''));
  return candidates.find(p=>p.design.last_edited)||candidates.find(p=>p.design.last_active)||candidates[0]||'blank';
 }
 const workspace=groups.find(w=>initial==='stock'?w.source==='stock':!!w.current),design=workspace?.designs.find(d=>d.id===activeDesign)||workspace?.designs[0];return workspace&&design?{workspace,design}:'blank';
}
export default function DesignLibraryDialog({initial='blank',canSwitch,activeDesign,onClose,onRefresh,embedded=false,onBeforeOpen,onNavigate,onBusyChange,reuseStarter=false,hidePristineStarter=false,showCancel=true,primaryLabel,footerNote}:Props){
 const [workspaces,setWorkspaces]=useState<LibraryWorkspace[]|null>(null),[deleted,setDeleted]=useState<Design[]>([]),[pick,setPick]=useState<Pick>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[name,setName]=useState(''),[warnings,setWarnings]=useState<string[]>([]);
 const [menu,setMenu]=useState<{x:number;y:number;workspace:LibraryWorkspace;design:Design}|null>(null),[rename,setRename]=useState<{id:string;name:string}|null>(null);
 const {confirmDelete,deleteDialog}=useDeleteConfirmation();
 const prepare=(data:any):LibraryWorkspace[]=>data.workspaces.map((w:LibraryWorkspace)=>({...w,designs:hidePristineStarter?w.designs.filter(d=>!(d.id===w.starter_design&&d.is_empty)):w.designs}));
 const load=async()=>{const data=await api('/design-library'),groups=prepare(data);setWorkspaces(groups);setDeleted(data.deleted||[]);setWarnings(data.warnings||[]);setPick(previous=>{
  if(previous==='blank')return previous;
  if(previous){const workspace=groups.find(w=>w.id===previous.workspace.id),design=workspace?.designs.find(d=>d.id===previous.design.id);if(workspace&&design)return {workspace,design};}
  return initialPick(groups,initial,activeDesign);
 });};
 useEffect(()=>{let live=true;void api('/design-library').then(data=>{if(!live)return;const groups=prepare(data);setWorkspaces(groups);setDeleted(data.deleted||[]);setWarnings(data.warnings||[]);setPick(initialPick(groups,initial,activeDesign));}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[attempt]);
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 const action=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const go=(id:string)=>{if(onNavigate){onNavigate(id);return;}setCurrentDesignId(id);window.location.reload();};
 const open=()=>void action(async()=>{if(!canSwitch||!pick)return;await onBeforeOpen?.();if(pick==='blank'){const result=reuseStarter?await api('/workspace/start',{method:'POST',body:JSON.stringify({kind:'blank'})}):await api('/workspace/designs',{method:'POST',body:JSON.stringify({name})});go(result.design_id);return;}
  if(pick.workspace.source==='stock'){const result=await api('/workspace/start',{method:'POST',body:JSON.stringify({kind:'reference',recipe:pick.design.id,reuse_starter:reuseStarter})});if(result.job_id)await waitJob(result,undefined,120,result.design_id);go(result.design_id);}
  else{await api('/design-library/select',{method:'POST',body:JSON.stringify({workspace:pick.workspace.id,design:pick.design.id})});go(pick.design.id);}
 });
 const content=<>
 <div className="reference-import-layout design-library-layout"><div className="reference-parts-catalog">
 {!workspaces&&!error&&<p role="status">Loading designs…</p>}
 {workspaces?.map(workspace=><section key={workspace.id} className="reference-catalog-section" aria-label={workspace.current?'Your workspace':workspace.name}>
 <h3>{workspace.source==='yours'?<FolderOpen size={14}/>:<Library size={14}/>}<span>{workspace.current?'Your workspace':workspace.name}</span><small>{workspace.designs.length}</small></h3>
 {workspace.current&&<small className="design-library-workspace-name">{workspace.name}</small>}
 <div className="reference-catalog-list design-library-list" role="group" aria-label={`${workspace.current?'Your':workspace.source==='stock'?'Stock':workspace.name} designs`}>
 {workspace.designs.map(design=>rename?.id===design.id?<form key={design.id} className="design-library-rename" onSubmit={e=>{e.preventDefault();void action(async()=>{await waitJob(await api(`/workspace/designs/${design.id}/rename`,{method:'POST',body:JSON.stringify({name:rename.name})}),undefined,120,design.id);setRename(null);await load();await onRefresh();});}}><input autoFocus aria-label="Design name" value={rename.name} maxLength={180} onChange={e=>setRename({...rename,name:e.target.value})}/><button className="button small" disabled={busy||!rename.name.trim()}>Save</button><button type="button" className="icon-button" aria-label="Cancel rename" onClick={()=>setRename(null)}>×</button></form>:<button key={design.id} type="button" className="design-library-row" disabled={busy} aria-label={`Preview ${design.name}`} aria-pressed={pick!==null&&pick!=='blank'&&pick.workspace.id===workspace.id&&pick.design.id===design.id} onClick={()=>setPick({workspace,design})} onContextMenu={e=>{e.preventDefault();if(workspace.current&&!busy){setPick({workspace,design});setMenu({x:e.clientX,y:e.clientY,workspace,design});}}}><DesignIcon/><span>{design.name}</span>{(design.last_active||design.last_edited)&&<small>{[design.last_active?'Last active':'',design.last_edited?'Last edited':''].filter(Boolean).join(' · ')}</small>}{pick!==null&&pick!=='blank'&&pick.workspace.id===workspace.id&&pick.design.id===design.id&&<Check size={13}/>}</button>)}
 {!workspace.designs.length&&<p>No designs available.</p>}
 </div>
 {workspace.current&&<><button className="design-library-row design-library-new" disabled={busy} aria-pressed={pick==='blank'} onClick={()=>setPick('blank')}><FilePlus2 size={17}/><span>New blank design</span>{pick==='blank'&&<Check size={13}/>}</button>{pick==='blank'&&!embedded&&<label className="field design-library-name"><span>Design name</span><input aria-label="New design name" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();open();}}} placeholder="Untitled design" maxLength={180} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>}</>}
 </section>)}
 {deleted.length>0&&<details className="workspace-details"><summary>Deleted designs ({deleted.length})</summary>{deleted.map(d=><div key={d.id} className="workspace-deleted-row"><span>{d.name}</span><button className="text-button" disabled={busy} onClick={()=>void action(async()=>{await api(`/workspace/designs/${d.id}/restore`,{method:'POST'});await load();await onRefresh();})}><RotateCcw size={13}/>Restore</button></div>)}</details>}
 </div><ReferencePartPreview source={pick&&pick!=='blank'?{workspace:pick.workspace.id,design:pick.design.id,part:'design:'+(pick.design.modified_at||''),name:pick.design.name}:null} endpoint="/design-library/preview" emptyPrompt={pick==='blank'?'A blank design starts with an empty layout.':'Select a design to preview.'}/></div>
 {pick&&pick!=='blank'&&pick.workspace.source==='stock'&&<p className="reference-import-help">Import creates an editable copy in your workspace.</p>}
 {!canSwitch&&!embedded&&<p className="field-help">Finish the current operation before opening a design.</p>}
 {warnings.map((message,i)=><p key={i} className="error-text" role="status">{message}</p>)}
 {error&&<p className="error-text" role="alert">{error} {!workspaces&&<button className="button small" onClick={()=>{setError('');setAttempt(v=>v+1);}}>Retry</button>}</p>}
 {footerNote}
 <div className="reference-import-actions"><button data-design-library-primary="true" className="button primary" disabled={busy||!canSwitch||!pick} onClick={open}>{busy?'Opening…':primaryLabel||(pick==='blank'?'Create design':pick?.workspace.source==='stock'?'Import design':'Open design')}</button>{showCancel&&<button className="button" disabled={busy} onClick={onClose}>Cancel</button>}</div>
 {menu&&<ContextMenu x={menu.x} y={menu.y} title={menu.design.name} onClose={()=>setMenu(null)} actions={[
 {label:'Open design',disabled:busy||!canSwitch,action:()=>{void action(async()=>{await onBeforeOpen?.();await api('/design-library/select',{method:'POST',body:JSON.stringify({workspace:menu.workspace.id,design:menu.design.id})});go(menu.design.id);});}},
 {label:'Rename',disabled:busy||!canSwitch,action:()=>setRename({id:menu.design.id,name:menu.design.name})},
 {label:'Delete design',disabled:busy||!canSwitch||(workspaces?.find(w=>w.source==='yours')?.designs.length||0)<=1,action:()=>confirmDelete(menu.design.name,'Delete this design from the workspace?',()=>void action(async()=>{const result=await api(`/workspace/designs/${menu.design.id}/delete`,{method:'POST'});if(menu.design.id===activeDesign){go(result.design_id);return;}setPick(null);await load();await onRefresh();}),"Restore it from Deleted designs.")},
 ]}/>}
 {deleteDialog}
 </>;
 return embedded?content:<Modal wide title="Open or import a design" eyebrow="" dismissible={!busy} onClose={onClose}>{content}</Modal>;
}

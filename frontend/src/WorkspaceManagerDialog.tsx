import {useEffect,useState} from 'react';
import {Check,FolderOpen,KeyRound,Plus,Lock,Trash2,X} from 'lucide-react';
import {useDeleteConfirmation} from './useDeleteConfirmation';
import {Modal} from './Forms';
import {api,setCurrentDesignId} from './api';
import type {WorkspaceInfo} from './WorkspaceDialog';

type WorkspaceRow={code:string;name:string;design_count:number;created_at?:string;changed_at?:string;public?:boolean};
export default function WorkspaceManagerDialog({workspace,canSwitch,onClose,onRefresh}:{workspace:WorkspaceInfo|null;canSwitch:boolean;onClose:()=>void;onRefresh:()=>Promise<void>}){
  const {confirmDelete,deleteDialog}=useDeleteConfirmation();
  const [username,setUsername]=useState('');
  const [rows,setRows]=useState<WorkspaceRow[]>([]),[admin,setAdmin]=useState(false),[unlock,setUnlock]=useState(false),[password,setPassword]=useState('');
  const [editing,setEditing]=useState<{code:string;name:string}|null>(null),[newName,setNewName]=useState(''),[recovery,setRecovery]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=async()=>{const data=await api('/workspaces');setRows(data.workspaces);setAdmin(data.admin);};
  useEffect(()=>{void api('/workspace/profile').then(p=>setUsername(p.name||'')).catch(()=>{});void load().catch(e=>setError(e.message));},[]);
  const action=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message||'Could not update workspaces.');}finally{setBusy(false);}};
  const open=async(code:string)=>{if(!canSwitch)return;await api('/workspace/recover',{method:'POST',body:JSON.stringify({code})});setCurrentDesignId(null);window.location.reload();};
  return <Modal title="Workspaces" eyebrow="" onClose={onClose}>
    <div className="workspace-manager-body">
      <div className="workspace-manager-heading"><span>{admin?'All server workspaces':username?`${username}'s Workspaces`:'Your Workspaces'}</span></div>
      <div className="workspace-manager-list">{rows.map(row=><div className="workspace-design-row" key={row.code} data-active={row.code===workspace?.workspace_code}>
        {editing?.code===row.code?<form id={`rename-${row.code}`} className="workspace-design-open workspace-inline-rename" onSubmit={e=>{e.preventDefault();if(!editing.name.trim())return;const name=editing.name.trim();void action(async()=>{if(name!==row.name)await api('/workspaces/rename',{method:'POST',body:JSON.stringify({code:row.code,name})});setEditing(null);await load();if(row.code===workspace?.workspace_code)await onRefresh();});}}>
          <FolderOpen size={16}/><span><input autoFocus data-inline-rename="true" aria-label="Workspace name" maxLength={120} value={editing.name} disabled={busy} onFocus={e=>e.currentTarget.select()} onChange={e=>setEditing({code:row.code,name:e.target.value})} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)setEditing(null);}}}/><small>{row.design_count} {row.design_count===1?'design':'designs'}{row.public?' · Public':''}</small></span>
        </form>:<button className="workspace-design-open" title={row.name} disabled={busy||!canSwitch||row.code===workspace?.workspace_code} onClick={()=>void action(()=>open(row.code))}><FolderOpen size={16}/><span>{row.name}<small>{row.design_count} {row.design_count===1?'design':'designs'}{row.public?' · Public':''}</small></span></button>}
        {row.code===workspace?.workspace_code&&<span className="workspace-active-badge"><Check size={10} aria-hidden="true"/>Active</span>}
        <div className="workspace-dates"><small>Created {row.created_at?new Date(row.created_at).toLocaleDateString():'—'}</small><small>Last changed {row.changed_at?new Date(row.changed_at).toLocaleString():'—'}</small></div>
        <div className="workspace-row-actions">{editing?.code===row.code?<><button key="save" className="icon-button" type="submit" form={`rename-${row.code}`} aria-label="Save workspace name" title="Save name · Enter" disabled={busy||!editing.name.trim()}><Check size={14}/></button><button key="cancel" type="button" className="icon-button" aria-label="Cancel workspace rename" title="Cancel · Esc" disabled={busy} onClick={()=>setEditing(null)}><X size={14}/></button></>:<><button key="rename" type="button" className="text-button workspace-rename-button" aria-label={`Rename workspace ${row.name}`} disabled={busy} onClick={e=>{e.preventDefault();setError('');setEditing({code:row.code,name:row.name});}}>Rename</button>
        {admin&&<button key="delete" type="button" className="icon-button" aria-label={`Delete workspace ${row.name}`} disabled={busy||!canSwitch} onClick={()=>confirmDelete(row.name,"Delete this workspace and all of its designs?",()=>void action(async()=>{const result=await api('/workspaces/delete',{method:'POST',body:JSON.stringify({code:row.code})});if(result.reload){setCurrentDesignId(null);window.location.reload();}else await load();}),"A server-side recovery copy is retained.")}><Trash2 size={14}/></button>}</>}</div>
      </div>)}</div>
      <form className="workspace-create" onSubmit={e=>{e.preventDefault();void action(async()=>{if(!canSwitch)return;await api('/workspace/new',{method:'POST',body:JSON.stringify({name:newName})});setCurrentDesignId(null);window.location.reload();});}}>
        <input aria-label="New workspace name" placeholder="New workspace name (optional)" maxLength={120} value={newName} onChange={e=>setNewName(e.target.value)}/><button className="button primary" disabled={busy||!canSwitch}><Plus size={14}/>New workspace</button>
      </form>
      <details className="workspace-details"><summary>Recovery code</summary><p>Use this code to reopen the workspace in another browser.</p><code className="workspace-code">{workspace?.workspace_code}</code>
        <form className="workspace-create" onSubmit={e=>{e.preventDefault();void action(()=>open(recovery.trim()));}}><input aria-label="Workspace recovery code" placeholder="Workspace recovery code" value={recovery} onChange={e=>setRecovery(e.target.value)}/><button className="button secondary" disabled={busy||!canSwitch||!recovery.trim()}>Open workspace</button></form>
      </details>
      {!canSwitch&&<p className="field-help">Finish the current operation before switching workspaces.</p>}
      {error&&<p className="error-text" role="alert">{error}</p>}
    </div>
    {deleteDialog}
    <footer className="workspace-manager-footer"><div className="workspace-admin-controls"><button className="icon-button" aria-label={admin?'Lock admin workspace view':'Show all server workspaces'} aria-expanded={admin?undefined:unlock} aria-controls={admin?undefined:"workspace-admin-password"} title={admin?'Lock admin view':'Admin workspace view'} disabled={busy} onClick={()=>admin?void action(async()=>{await api('/workspaces/admin/lock',{method:'POST'});await load();}):setUnlock(v=>!v)}>{admin?<Lock size={15}/>:<KeyRound size={15}/>}</button>{unlock&&!admin&&<form id="workspace-admin-password" className="workspace-admin-unlock" onSubmit={e=>{e.preventDefault();void action(async()=>{await api('/workspaces/admin',{method:'POST',body:JSON.stringify({password})});setPassword('');setUnlock(false);await load();});}}>
        <label className="field"><span>Admin password</span><input autoFocus type="password" autoComplete="off" aria-label="Admin password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="button secondary" disabled={busy||!password} aria-label="Unlock server list">Unlock</button>
      </form>}</div><button className="button secondary" onClick={onClose}>Close</button></footer>
  </Modal>;
}

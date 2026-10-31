import {useEffect,useState} from 'react';
import {Check,FolderOpen,KeyRound,Plus,Lock} from 'lucide-react';
import {Modal} from './Forms';
import {api,setCurrentDesignId} from './api';
import type {WorkspaceInfo} from './WorkspaceDialog';

type WorkspaceRow={code:string;name:string;design_count:number};
export default function WorkspaceManagerDialog({workspace,canSwitch,onClose,onRefresh}:{workspace:WorkspaceInfo|null;canSwitch:boolean;onClose:()=>void;onRefresh:()=>Promise<void>}){
  const [rows,setRows]=useState<WorkspaceRow[]>([]),[admin,setAdmin]=useState(false),[unlock,setUnlock]=useState(false),[password,setPassword]=useState('');
  const [name,setName]=useState(workspace?.name||'Local Workspace'),[newName,setNewName]=useState(''),[recovery,setRecovery]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const load=async()=>{const data=await api('/workspaces');setRows(data.workspaces);setAdmin(data.admin);};
  useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
  useEffect(()=>{setName(workspace?.name||'Local Workspace');},[workspace?.workspace_code,workspace?.name]);
  const action=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message||'Could not update workspaces.');}finally{setBusy(false);}};
  const open=async(code:string)=>{if(!canSwitch)return;await api('/workspace/recover',{method:'POST',body:JSON.stringify({code})});setCurrentDesignId(null);window.location.reload();};
  return <Modal title="Workspaces" eyebrow="" onClose={onClose}>
    <div className="workspace-manager-body">
      <div className="workspace-manager-heading"><span>{admin?'All server workspaces':'This browser’s workspaces'}</span></div>
      {unlock&&!admin&&<form className="workspace-admin-unlock" onSubmit={e=>{e.preventDefault();void action(async()=>{await api('/workspaces/admin',{method:'POST',body:JSON.stringify({password})});setPassword('');setUnlock(false);await load();});}}>
        <label className="field"><span>Admin password</span><input autoFocus type="password" autoComplete="off" aria-label="Admin password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="button secondary" disabled={busy||!password}>Unlock server list</button>
      </form>}
      <div className="workspace-manager-list">{rows.map(row=><div className="workspace-design-row" key={row.code} data-active={row.code===workspace?.workspace_code}>
        <button className="workspace-design-open" title={row.name} disabled={busy||!canSwitch||row.code===workspace?.workspace_code} onClick={()=>void action(()=>open(row.code))}><FolderOpen size={16}/><span>{row.name}<small>{row.design_count} {row.design_count===1?'design':'designs'}</small></span>{row.code===workspace?.workspace_code&&<small><Check size={12}/>Active</small>}</button>
      </div>)}</div>
      {workspace&&<form className="workspace-rename" onSubmit={e=>{e.preventDefault();void action(async()=>{await api('/workspace/rename',{method:'POST',body:JSON.stringify({name})});await onRefresh();await load();setSaved(true);});}}>
        <label className="field"><span>Active workspace name</span><input aria-label="Workspace name" value={name} maxLength={120} onChange={e=>{setName(e.target.value);setSaved(false);}}/></label><button className="button secondary" disabled={busy||!name.trim()}>Rename</button>{saved&&<small className="workspace-saved" role="status">Saved</small>}
      </form>}
      <form className="workspace-create" onSubmit={e=>{e.preventDefault();void action(async()=>{if(!canSwitch)return;await api('/workspace/new',{method:'POST',body:JSON.stringify({name:newName})});setCurrentDesignId(null);window.location.reload();});}}>
        <input aria-label="New workspace name" placeholder="New workspace name (optional)" maxLength={120} value={newName} onChange={e=>setNewName(e.target.value)}/><button className="button primary" disabled={busy||!canSwitch}><Plus size={14}/>New workspace</button>
      </form>
      <details className="workspace-details"><summary>Recovery code</summary><p>Use this code to reopen the workspace in another browser.</p><code className="workspace-code">{workspace?.workspace_code}</code>
        <form className="workspace-create" onSubmit={e=>{e.preventDefault();void action(()=>open(recovery.trim()));}}><input aria-label="Workspace recovery code" placeholder="Workspace recovery code" value={recovery} onChange={e=>setRecovery(e.target.value)}/><button className="button secondary" disabled={busy||!canSwitch||!recovery.trim()}>Open workspace</button></form>
      </details>
      {!canSwitch&&<p className="field-help">Finish the current operation before switching workspaces.</p>}
      {error&&<p className="error-text" role="alert">{error}</p>}
    </div>
    <footer className="workspace-manager-footer"><button className="icon-button" aria-label={admin?'Lock admin workspace view':'Show all server workspaces'} title={admin?'Lock admin view':'Admin workspace view'} disabled={busy} onClick={()=>admin?void action(async()=>{await api('/workspaces/admin/lock',{method:'POST'});await load();}):setUnlock(v=>!v)}>{admin?<Lock size={15}/>:<KeyRound size={15}/>}</button><button className="button secondary" onClick={onClose}>Close</button></footer>
  </Modal>;
}

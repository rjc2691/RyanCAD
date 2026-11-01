import {useEffect,useState} from 'react';
import {api,currentDesignId,newRequestId} from './api';
export type AgentServerStatus={enabled:boolean;listening:boolean;port:number};
export function useAgentServer(design:string|undefined){
  const [status,setStatus]=useState<AgentServerStatus|null>(null);
  const [tab]=useState(()=>newRequestId()||`${Date.now()}-${Math.random()}`);
  useEffect(()=>{
    let alive=true;
    const update=()=>{
      void api('/workspace/agents/status').then(s=>{if(alive)setStatus(s);}).catch(()=>{});
      if(design&&document.visibilityState==='visible')void api('/workspace/presence',{method:'POST',body:JSON.stringify({tab,design:currentDesignId()})}).catch(()=>{});
    };
    update();const timer=setInterval(update,10000);
    document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);
    return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update);};
  },[design]);
  const toggle=async(enabled:boolean)=>{const result=await api('/workspace/agents/status',{method:'POST',body:JSON.stringify({enabled})});setStatus(result);};
  return {status,toggle};
}

export function AgentServerControls({status,toggle}:{status:AgentServerStatus|null;toggle:(enabled:boolean)=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <section className="agent-server-controls" aria-label="MCP server">
    <div className="agent-server-heading"><strong>MCP server</strong><button role="switch" aria-checked={status?.enabled??false} aria-label="Enable MCP server" className="agent-server-switch" disabled={!status||busy} onClick={()=>{setBusy(true);setError('');void toggle(!status?.enabled).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}><span/>{status?.enabled?'Enabled':'Disabled'}</button></div>
    <div className="agent-server-details"><span className={`agent-status-dot ${status?.enabled?'enabled':''}`}/><span>{status?status.listening?'Accepting agent connections':'Agent connections blocked':'Checking server…'}</span>{status&&<code>Port {status.port}</code>}</div>
    <small>Disabling stops agent edits in every workspace. Reconnect agents after enabling.</small>
    {error&&<p className="error-text" role="alert">{error}</p>}
  </section>;
}

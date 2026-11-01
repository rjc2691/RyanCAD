import RyanCADLogo from "./RyanCADLogo";
import {useState} from 'react';
import {Save} from 'lucide-react';
import {Modal} from './Forms';
import {api} from './api';
import DesignLibraryDialog from './DesignLibraryDialog';
export default function StartupDialog({username,activeDesign,onName,onComplete,onDismiss}:{username:string;activeDesign:string|null;onName:(name:string)=>void;onComplete:(id:string)=>void;onDismiss:()=>void}){
 const [name,setName]=useState(username),[busy,setBusy]=useState(false);
 return <Modal wide branding={<div className="welcome-brand" aria-label="RyanCAD"><RyanCADLogo/><span>Ryan<span>CAD</span></span></div>} title={username?`Welcome back, ${username}`:'Welcome to RyanCAD'} eyebrow="" dismissible={!!username&&!busy} onClose={onDismiss}>
 <div className="startup-workspace-picker" data-startup-form="true" onKeyDown={e=>{if(e.key==='Enter'&&(e.target as HTMLElement).matches('input[aria-label="Your name"]')){e.preventDefault();e.currentTarget.querySelector<HTMLButtonElement>('[data-design-library-primary]')?.click();}}}>
 <label className="field startup-name"><span>{username?'Change name':'Enter a name to use with your workspace'}</span><input required autoFocus={!username} aria-label="Your name" autoComplete="given-name" maxLength={60} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
 <h3 className="startup-work-heading">What would you like to work on?</h3>
 <DesignLibraryDialog embedded initial="recent" canSwitch={!!name.trim()} activeDesign={activeDesign} onClose={onDismiss} onRefresh={async()=>{}} onBusyChange={setBusy} reuseStarter hidePristineStarter showCancel={!!username} primaryLabel="Continue" onBeforeOpen={async()=>{if(name.trim()!==username){const profile=await api('/workspace/profile',{method:'POST',body:JSON.stringify({name:name.trim()})});onName(profile.name);}}} onNavigate={onComplete}
 footerNote={<p className="startup-save-note"><Save size={15}/><span>RyanCAD saves your design after every completed operation. No manual saving needed.</span></p>}/>
 </div></Modal>;
}

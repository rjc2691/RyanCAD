import {useRef,useState} from 'react';
import {FolderOpen} from 'lucide-react';
import {Modal} from './Forms';
import {api,setCurrentDesignId} from './api';
import {readWorkspaceFolder,readDirectoryFile,writeWorkspaceFolder,type WorkspaceDirectory} from './workspaceFolders';

export default function WorkspaceFolderDialog({mode,onClose,onBusy}:{mode:'import'|'export';onClose:()=>void;onBusy:(busy:boolean)=>void}){
  const [overwrite,setOverwrite]=useState(false),[working,setWorking]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const picker=(window as unknown as {showDirectoryPicker?:(options:{mode:string})=>Promise<WorkspaceDirectory>}).showDirectoryPicker;
  const canWrite=window.isSecureContext&&!!picker;
  const busy=(value:boolean)=>{setWorking(value);onBusy(value);};
  const transfer=async(read:()=>Promise<void>)=>{
    busy(true);setError('');setStatus('Preparing workspace…');
    try{
      await read();
    }catch(e:any){setStatus('');if(e.name!=='AbortError')setError(e.message||'The folder transfer failed.');}
    finally{busy(false);}
  };
  const importFiles=async(read:(path:string)=>Promise<File>)=>{
    const files=await readWorkspaceFolder(read,setStatus);
    setStatus('Validating designs and history…');
    const result=await api('/workspace/folder/import',{method:'POST',body:JSON.stringify({files})});
    await api('/workspace/recover',{method:'POST',body:JSON.stringify({code:result.workspace_code})});
    setCurrentDesignId(result.design_id);window.location.reload();
  };
  const choose=async()=>{
    if(mode==='import'&&(!picker||!window.isSecureContext)){input.current?.click();return;}
    // Call the browser picker directly from the click, before fetching anything.
    await transfer(async()=>{
      const folder=await picker!.call(window,{mode:mode==='export'?'readwrite':'read'});
      if(mode==='import'){await importFiles(path=>readDirectoryFile(folder,path));return;}
      const snapshot=await api('/workspace/folder/export');
      await writeWorkspaceFolder(folder,snapshot.files,overwrite,setStatus);
      setStatus(`Saved ${snapshot.design_count} designs and ${snapshot.files.length} files.`);setComplete(true);
    });
  };
  return <Modal title={mode==='import'?'Import workspace folder':'Export workspace folder'} eyebrow="WORKSPACE" wide={false} onClose={()=>{if(!working)onClose();}}>
    <div className="workspace-folder-transfer">
      <p>{mode==='import'?'Open all designs, history and saved exports as a new workspace. Your current workspace is kept; save its recovery code from the workspace menu if you want to return to it.':'Save all designs, history and saved exports to a folder on this computer. Unrelated files are left alone.'}</p>
      <div className="folder-support-notice" role="note"><strong>Browser support</strong>
        <p>{mode==='export'?'Direct folder export works in supported Chrome/Edge browsers over HTTPS or localhost. Brave may need its File System Access setting enabled. Safari and Firefox do not support direct folder export; use a supported browser.':'Folder import works in modern browsers, including Safari, using the folder upload picker. The browser may ask permission to read/upload the folder.'}</p>
        {mode==='export'&&!canWrite&&<p className="warning-text">{!window.isSecureContext?'This address is not a secure context. Open RyanCAD over HTTPS, or use localhost on the server computer.':'Folder writing is unavailable in this browser. Open RyanCAD in Chrome or Edge, or enable the API if your browser supports it.'}</p>}
      </div>
      <p className="field-help">One-time transfer · no automatic folder sync · up to 100 designs / 64 MB / 5,000 files. {mode==='export'?'The browser will ask for folder access.':'Select the folder containing workspace.json.'}</p>
      {mode==='export'&&<label className="checkbox-field"><input type="checkbox" checked={overwrite} disabled={working} onChange={e=>setOverwrite(e.target.checked)}/>Overwrite matching files</label>}
      {error&&<p className="error-text" role="alert">{error}</p>}
      {status&&<p role="status">{status}</p>}
      <div className="dialog-actions"><button className="button" disabled={working} onClick={onClose}>{complete?'Done':'Cancel'}</button>{!complete&&<button className="button primary" disabled={working||(mode==='export'&&!canWrite)} onClick={()=>void choose()}><FolderOpen size={14}/>Choose folder</button>}</div>
      <input ref={input} type="file" hidden multiple {...{webkitdirectory:''} as any} onChange={event=>{
        const selected=Array.from(event.target.files||[]);event.target.value='';if(!selected.length)return;
        const files=new Map(selected.map(file=>[file.webkitRelativePath.split('/').slice(1).join('/'),file]));
        void transfer(()=>importFiles(async path=>{const file=files.get(path);if(!file)throw Error(`Missing ${path}. Select the folder containing workspace.json.`);return file;}));
      }}/>
    </div>
  </Modal>;
}

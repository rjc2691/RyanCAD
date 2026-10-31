import {useDeleteConfirmation} from "./useDeleteConfirmation";
import ContextMenu from "./ContextMenu";
import {useRef, useState} from "react";
import {Layers, Plus} from "lucide-react";
import type {RunCommand, State} from "./types";

export default function LayoutList({state, run, disabled, onLayout}: {
  state:State; run:RunCommand; disabled:boolean; onLayout:()=>void;
}) {
  const {confirmDelete,deleteDialog}=useDeleteConfirmation();
  const layouts=Object.values(state.document.components).filter(c=>c.structure_role==="layout");
  const [editing,setEditing]=useState<string|null>(null), [name,setName]=useState("");
  const [pending,setPending]=useState(false), [error,setError]=useState("");
  const [menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null);
  const cancelled=useRef(false), saving=useRef(false);
  const action=async(command:string,args:any,after?:()=>void)=>{
    if(disabled||saving.current)return;
    saving.current=true;setPending(true);setError("");
    try{await run(command,args);after?.();}catch(e:any){setError(e.message||"Could not update layout.");}
    finally{saving.current=false;setPending(false);}
  };
  const finish=(id:string)=>{
    const value=name.trim();
    if(cancelled.current){cancelled.current=false;setEditing(null);return;}
    if(!value){setError("Enter a layout name.");return;}
    if(value===state.document.components[id].name){setEditing(null);return;}
    void action("structure.rename",{id,name:value},()=>setEditing(null));
  };
  return <div className="design-layout-children" aria-label="Design layouts">
    <div className="sidebar-list-label nested-list-label"><span>Layouts</span><button className="icon-button sidebar-header-add" aria-label="Add layout" title="Add layout" disabled={disabled||pending} onClick={()=>void action("layout.create",{},onLayout)}><Plus size={14}/></button></div>
    {layouts.map(layout=><div className="structure-layout" key={layout.id} data-active={layout.id===state.document.active_layout} onContextMenu={e=>{e.preventDefault();e.stopPropagation();if(!disabled&&!pending)setMenu({id:layout.id,x:e.clientX,y:e.clientY});}}>
      <Layers size={14}/>
      {editing===layout.id ? <input autoFocus className="layout-name-input" aria-label="Layout name" maxLength={120}
        value={name} disabled={pending} onFocus={e=>e.target.select()} onChange={e=>setName(e.target.value)}
        onBlur={()=>finish(layout.id)} onKeyDown={e=>{
          if(e.key==="Enter"){e.preventDefault();e.stopPropagation();e.currentTarget.blur();}
          if(e.key==="Escape"){e.preventDefault();e.stopPropagation();cancelled.current=true;e.currentTarget.blur();}
        }}/>:<button className="layout-name" disabled={disabled||pending} aria-current={layout.id===state.document.active_layout?"true":undefined}
        onClick={()=>void action("layout.select",{id:layout.id},onLayout)}>{layout.name}</button>}
    </div>)}
    {menu&&<ContextMenu x={menu.x} y={menu.y} title={state.document.components[menu.id]?.name||"Layout"} onClose={()=>setMenu(null)} actions={[{label:"Rename",disabled:disabled||pending,action:()=>{cancelled.current=false;setEditing(menu.id);setName(state.document.components[menu.id].name);}},{label:"Delete layout",disabled:disabled||pending||layouts.length<2,action:()=>confirmDelete(state.document.components[menu.id].name,"Delete this layout and its placements? Library parts are retained.",()=>void action("layout.delete",{id:menu.id},onLayout))}]}/>}
    {deleteDialog}
    {error&&<p className="structure-error" role="alert">{error}</p>}
  </div>;
}

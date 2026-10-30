import {useEffect,useState} from "react";
import {Modal} from "./Forms";
export function useDeleteConfirmation(){
 const [request,setRequest]=useState<{name:string;description:string;action:()=>void}|null>(null);
 useEffect(()=>{if(!request)return;const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();setRequest(null);}};window.addEventListener("keydown",key,true);return()=>window.removeEventListener("keydown",key,true);},[request]);
 return {confirmDelete:(name:string,description:string,action:()=>void)=>setRequest({name,description,action}),deleteDialog:request?<Modal title={`Delete ${request.name}?`} eyebrow="CONFIRM DELETION" onClose={()=>setRequest(null)}><p className="dialog-copy">{request.description} Undo is available after deletion.</p><footer><button className="button secondary" autoFocus onClick={()=>setRequest(null)}>Cancel</button><button className="button primary" onClick={()=>{const action=request.action;setRequest(null);action();}}>Delete</button></footer></Modal>:null};
}

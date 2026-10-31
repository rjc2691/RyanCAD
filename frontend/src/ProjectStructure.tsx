import PrimitiveLibrary from "./PrimitiveLibrary";
import {layoutContextActions} from "./layoutContextActions";
import {useDeleteConfirmation} from "./useDeleteConfirmation";
import ContextMenu, {type ContextAction} from "./ContextMenu";
import {useEffect,useState} from "react";
import {Box, Boxes, ChevronDown, ChevronRight, Eye, EyeOff, Folder, Layers, Plus, X, GitBranch} from "lucide-react";
import type {Occurrence, RunCommand, Selection, State} from "./types";
import {expressionLabel} from "./api";

/** The tree keeps definition editing distinct from selecting a placed instance. */
export default function ProjectStructure({state, run, disabled, scope, selection, groupMembers, onSelect, onEdit, onLayout, onMove}: {
  state: State; run: RunCommand; disabled: boolean; scope: string; selection: Selection|null; groupMembers?:string[]|null;
  onSelect:(item:Selection,removeOnly?:boolean,add?:boolean)=>void; onEdit:(row:Occurrence)=>void;
  onMove:()=>void; onLayout:()=>void;
}) {
  const {confirmDelete,deleteDialog}=useDeleteConfirmation();
  const doc=state.document, rows=state.occurrences;
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const [customOpen,setCustomOpen]=useState(true);
  const [rename,setRename]=useState<string|null>(null), [name,setName]=useState("");
  const [insert,setInsert]=useState<string|null>(null), [insertPart,setInsertPart]=useState("");
  useEffect(()=>{if(insert)setCustomOpen(true);},[insert]);
  const [variant,setVariant]=useState<{part:string;id?:string;name:string;overrides:Record<string,string>}|null>(null);
  const [error,setError]=useState("");
  const [pending,setPending]=useState(false);
  const [menu,setMenu]=useState<{x:number;y:number;row:Occurrence}|null>(null);
  const [drag,setDrag]=useState<Occurrence|null>(null);
  const locked=disabled||pending;
  const action=async(name:string,args:any={},after?:(result:any)=>void)=>{
    if(locked)return;setError("");setPending(true);
    try { const result=await run(name,args);after?.(result); } catch(e:any){setError(e.message||"Could not update structure.");}finally{setPending(false);}
  };
  const parts=Object.values(doc.components).filter(c=>c.structure_role==="part");
  const libraryParts=rows.filter(o=>o.parent==="root"&&o.structure_role==="part");
  const layoutHasParts=rows.some(o=>o.layout===doc.active_layout&&!o.library&&o.structure_role==="part");
  const activeRoot=rows.find(o=>o.parent==="root"&&o.definition===doc.active_layout);
  const editingPart=rows.filter(o=>o.structure_role==='part'&&(scope===o.id||scope.startsWith(o.id+'/'))).sort((a,b)=>b.id.length-a.id.length)[0];
  const insertInLayout=!!insert&&(doc.components[insert]?.structure_role==="layout"||doc.components[insert]?.group_kind==="layout"||rows.some(o=>o.definition===insert&&o.structure_role==="group"&&o.layout&&!o.library));
  const placementForm=insert&&<form className="structure-form structure-placement" aria-label="Place linked part" onSubmit={e=>{e.preventDefault();if(insertPart)void action("part.insert",{part:insertPart,parent:insert},()=>{setInsert(null);setInsertPart("");});}}>
    <strong>Place linked part</strong>
    <small>Click a part in the 3D Parts list, or choose below.</small>
    <label>Part<select aria-label="Part to place" disabled={locked} value={insertPart} onChange={e=>setInsertPart(e.target.value)}><option value="">Choose part</option>{parts.filter(p=>p.id!==insert).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <button className="button primary" disabled={locked||!insertPart}>Place</button><button type="button" disabled={pending} onClick={()=>{setInsert(null);setInsertPart("");}}>Cancel</button>
  </form>;
  const children=(row:Occurrence)=>rows.filter(o=>o.id.startsWith(row.id+"/")&&o.id.slice(row.id.length+1).indexOf("/")<0);
  const beginRename=(id:string)=>{setRename(id);setName(doc.components[id].name);};
  const addAction=(label:string,onClick:()=>void)=><button className="icon-button sidebar-header-add" aria-label={label} title={label} disabled={locked} onClick={e=>{e.preventDefault();e.stopPropagation();onClick();}}><Plus size={14}/></button>;
  const tree=(row:Occurrence,depth:number,layout=false):React.ReactNode=>{
    const c=doc.components[row.definition], nested=children(row), role=c?.structure_role;
    const isOpen=expanded.has(row.id)||scope===row.id||scope.startsWith(row.id+"/");
    const active=groupMembers!=null?groupMembers.includes(row.id):scope===row.id||selection?.occurrence===row.id||!!selection?.items?.some(s=>s.occurrence===row.id);
    const part=role==="part", group=role==="group", editable=!row.variation&&!c?.read_only;
    const pickable=!!insert&&!layout&&part&&c.id!==insert&&!row.variation;
    const listed=layout?(part?[]:nested.filter(o=>o.structure_role==="part"||o.structure_role==="group")):nested;
    return <div key={row.id} role="treeitem" aria-expanded={listed.length?isOpen:undefined}>
      <div className={`component-row structure-item ${active?"selected":""} ${pickable?"placement-candidate":""}`} data-placement-selected={pickable&&insertPart===c.id?true:undefined} tabIndex={pickable?0:undefined} onKeyDown={e=>{if(pickable&&(e.key==="Enter"||e.key===" ")){e.preventDefault();e.stopPropagation();if(!locked)setInsertPart(c.id);}}} style={{paddingLeft:12+depth*14}}
        draggable={!locked&&row.parent!=="root"&&!row.variation} onDragStart={e=>{setDrag(row);e.dataTransfer.setData("text/plain",row.id);}} onDragEnd={()=>setDrag(null)}
        onDragOver={e=>{if(drag&&c?.kind==="assembly")e.preventDefault();}}
        onDrop={e=>{e.preventDefault();e.stopPropagation();if(drag)void action("group.reparent",{occurrence:drag.id,parent:row.id});setDrag(null);}}
        onClick={e=>{if(insert&&!layout){if(pickable&&!locked)setInsertPart(c.id);return;}onSelect({occurrence:row.id,definition:row.definition},e.ctrlKey,e.shiftKey);}}
        onDoubleClick={()=>{if(insert&&!layout)return;layout&&group?setExpanded(v=>{const next=new Set(v);if(next.has(row.id))next.delete(row.id);else next.add(row.id);return next;}):editable?onEdit(row):setError("This is a linked variation or imported body. Edit the base part instead.");}}
        onContextMenu={e=>{e.preventDefault();e.stopPropagation();if(locked)return;onSelect({occurrence:row.id,definition:row.definition});setMenu({x:e.clientX,y:e.clientY,row});}}>
        <button className="icon-button" aria-label={`${isOpen?"Collapse":"Expand"} ${c?.name}`} disabled={!listed.length} onClick={e=>{e.stopPropagation();setExpanded(v=>{const next=new Set(v);if(next.has(row.id))next.delete(row.id);else next.add(row.id);return next;});}}>{listed.length?(isOpen?<ChevronDown size={12}/>:<ChevronRight size={12}/>):<span style={{width:12}}/>}</button>
        {group?<Folder size={14}/>:part?<Boxes size={14}/>:<Box size={14}/>}
        {rename===c?.id?<form onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();void action("structure.rename",{id:c.id,name},()=>setRename(null));}}><input autoFocus aria-label="Definition name" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")setRename(null);}}/></form>:<span className="structure-name" title={group?(layout?'Layout group':'Part group'):undefined}>{c?.name||row.name}{row.variation&&<small> · {doc.variations?.[row.variation]?.name}</small>}{c?.read_only&&!row.variation&&<small> · imported</small>}</span>}
        <button className="icon-button" title={row.visible?"Hide":"Show"} disabled={locked} onClick={e=>{e.stopPropagation();void action("instance.visibility",{id:row.source_id,visible:!row.visible});}}>{row.visible?<Eye size={12}/>:<EyeOff size={12}/>}</button>
      </div>
      {isOpen&&listed.map(o=>tree(o,depth+1,layout))}
      {part&&row.library&&row.parent==="root"&&Object.values(doc.variations||{}).filter(v=>v.part===row.definition).map(v=><div className="structure-variation" key={v.id}>
        <GitBranch size={12}/><span>{v.name}</span><button disabled={locked} onClick={()=>setVariant({part:v.part,id:v.id,name:v.name,overrides:Object.fromEntries(Object.entries(v.overrides).map(([p,value])=>[p,expressionLabel(value,doc.parameters)]))})}>Edit values</button><button disabled={locked} onClick={()=>void action("part.insert",{part:v.part,variation:v.id},onLayout)}>Place</button><button className="icon-button" title="Delete variation" disabled={locked} onClick={()=>void action("variation.delete",{id:v.id})}><X size={11}/></button>
      </div>)}
    </div>;
  };
  const menuActions:ContextAction[]=[];
  if(menu){
    const row=rows.find(o=>o.id===menu.row.id), c=row&&doc.components[row.definition];
    if(row&&c&&c.structure_role==='layout'){
      menuActions.push({label:'Add layout group',disabled:locked,action:()=>void action('layoutgroup.create',{parent:c.id})});
      menuActions.push({label:'Place part',disabled:locked,action:()=>{setInsert(c.id);setInsertPart('');}});
    }else if(row&&c&&row.layout&&!row.library){
      menuActions.push(...layoutContextActions(row,locked,action,onMove));
      if(c.structure_role==='group')menuActions.push({label:'Add layout group',disabled:locked,action:()=>void action('layoutgroup.create',{parent:c.id})});
    }else if(row&&c){
      const part=c.structure_role==="part",group=c.structure_role==="group";
      const add=(label:string,callback:()=>void)=>menuActions.push({label,action:callback,disabled:locked});
      if(!row.variation&&!c.read_only)add(`Edit ${part?"part":group?"group":"component"}`,()=>onEdit(row));
      if(part){
        add("Place in layout",()=>void action("part.insert",{part:row.definition,parent:doc.active_layout,variation:row.variation},onLayout));
        if(!row.variation){
          add("Create variation",()=>setVariant({part:row.definition,name:"Variation",overrides:{}}));
          add("Add component",()=>void action("part.component.create",{part:row.definition},()=>{setExpanded(v=>new Set(v).add(row.id));onEdit(row);}));
          add("Add part group",()=>void action("partgroup.create",{parent:row.definition}));
        }
      }
      if((part||group)&&!row.variation)add("Add part",()=>{setInsert(row.definition);setInsertPart("");});
      if(group&&!row.variation){
        add("Add component",()=>void action('part.component.create',{part:row.definition}));
        add("Add part group",()=>void action('partgroup.create',{parent:row.definition}));
      }
      if(!row.variation)add("Rename",()=>beginRename(row.definition));
      add(row.visible?"Hide":"Show",()=>void action("instance.visibility",{id:row.source_id,visible:!row.visible}));
      if(row.parent!=="root")add("Remove from Part",()=>confirmDelete(c.name,"Remove this placement from its parent? The reusable definition is retained.",()=>void action("structure.remove",{instance:row.source_id})));
      if(row.parent==="root"&&part)add("Delete part",()=>confirmDelete(c.name,"Delete this part definition, its variations and all its placements? Child component definitions and their features are retained.",()=>void action("part.delete",{id:c.id})));
      if(c.kind!=="assembly"&&!row.variation)add("Delete component",()=>confirmDelete(c.name,"Delete this component and its features from every placement?",()=>void action("component.delete",{id:c.id})));
    }
  }
  return <div className="project-structure">
    <div className="section-heading" data-editor-active={!editingPart} onContextMenu={e=>{if(activeRoot&&!locked){e.preventDefault();e.stopPropagation();setMenu({x:e.clientX,y:e.clientY,row:activeRoot});}}}><Layers size={14}/><span>Layout Tree · {doc.components[doc.active_layout||""]?.name}</span>{addAction("Place part in layout",()=>{setInsert(doc.active_layout||null);setInsertPart("");})}</div>
    {insertInLayout&&placementForm}
    <div role="tree" aria-label="Layout parts" className="structure-layout-tree" onContextMenu={e=>{if(e.target===e.currentTarget&&activeRoot&&!locked){e.preventDefault();setMenu({x:e.clientX,y:e.clientY,row:activeRoot});}}} onDragOver={e=>{if(drag)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(drag&&activeRoot)void action("group.reparent",{occurrence:drag.id,parent:activeRoot.id});setDrag(null);}}>{activeRoot&&children(activeRoot).map(row=>tree(row,0,true))}{!layoutHasParts&&<div className="structure-empty-item" role="treeitem" aria-disabled="true"><i>Choose a part to add to this layout</i></div>}</div>
    <div className="section-heading" data-editor-active={!!editingPart}><Boxes size={14}/><span>3D Parts</span></div>
    <details className="custom-parts-library sidebar-library" aria-label="Custom Parts for this Design" open={customOpen} onToggle={e=>setCustomOpen(e.currentTarget.open)}>
      <summary className="structure-section design-category"><ChevronRight className="library-chevron" size={12}/><Boxes size={15}/><span className="custom-parts-title">Custom Parts for this Design</span>{addAction("Add part",()=>{setCustomOpen(true);void action("part.create");})}</summary>
    {insert&&!insertInLayout&&placementForm}
    <div role="tree" aria-label="Reusable parts">{libraryParts.map(o=>tree(o,0))}{!libraryParts.length&&<div className="structure-empty-item" role="treeitem" aria-disabled="true"><i>This design has no parts. Create a new part from scratch or start with a primitive.</i></div>}</div>
    </details>
    <PrimitiveLibrary run={run} disabled={locked} onPlaced={onLayout}/>
    {variant&&<form className="structure-form" onSubmit={e=>{e.preventDefault();void action(variant.id?"variation.update":"variation.create",variant,()=>setVariant(null));}}>
      <strong>{variant.id?"Edit":"Create"} variation · {doc.components[variant.part]?.name}</strong>
      <label>Name<input aria-label="Variation name" required value={variant.name} onChange={e=>setVariant({...variant,name:e.target.value})}/></label>
      {(state.part_parameters?.[variant.part]||[]).map(pid=><label key={pid} className="variation-parameter"><span><input type="checkbox" checked={pid in variant.overrides} onChange={e=>{const overrides={...variant.overrides};if(e.target.checked)overrides[pid]=expressionLabel(doc.parameters[pid].expression,doc.parameters);else delete overrides[pid];setVariant({...variant,overrides});}}/>{doc.parameters[pid].name}</span>{pid in variant.overrides&&<input aria-label={`${doc.parameters[pid].name} override`} required value={variant.overrides[pid]} onChange={e=>setVariant({...variant,overrides:{...variant.overrides,[pid]:e.target.value}})}/>}</label>)}
      {!state.part_parameters?.[variant.part]?.length&&<p>Use a named parameter in this part’s dimensions before creating a variation.</p>}
      <small>All features stay linked to the base part. Only checked named values vary.</small>
      <button disabled={locked||!Object.keys(variant.overrides).length}>Save variation</button><button type="button" onClick={()=>setVariant(null)}>Cancel</button>
    </form>}
    {deleteDialog}
    {error&&<p className="structure-error" role="alert">{error}</p>}
    {menu&&menuActions.length>0&&<ContextMenu x={menu.x} y={menu.y} title={doc.components[menu.row.definition]?.name||"Part actions"} actions={menuActions} onClose={()=>setMenu(null)}/>}
  </div>;
}

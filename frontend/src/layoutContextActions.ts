import {groupSelection} from "./groupModel.ts";
import {selectionMembers} from "./operations/groupedSelection.ts";
import type {ContextAction} from "./ContextMenu";
import type {Occurrence, RunCommand, State, Selection} from "./types";

/** Placement actions shared by the layout tree and viewport. */
export function layoutContextActions(row:Occurrence, disabled:boolean, run:RunCommand,
  move:()=>void):ContextAction[]{
  const actions:ContextAction[]=[];
  actions.push({label:"Move in Layout",disabled,action:move});
  if(row.structure_role==="part")actions.push({label:"Duplicate in Layout",disabled,action:()=>{void run("group.copy",{occurrence:row.id}).catch(()=>{});}});
  actions.push({label:row.visible?"Hide":"Show",disabled,action:()=>{void run("instance.visibility",{id:row.source_id,visible:!row.visible}).catch(()=>{});}});
  actions.push({label:"Remove from Layout",disabled,action:()=>{void run("structure.remove",{instance:row.source_id}).catch(()=>{});}});
  return actions;
}

/** Only placed parts/groups in the current layout; never authoring definitions. */
export function layoutRemovalTargets(state:State,selection:Selection|null,scope:string){
  const ids=new Set(selectionMembers(selection).map(s=>groupSelection(s,state.occurrences,scope)?.occurrence));
  const candidates=state.occurrences.filter(o=>ids.has(o.id)&&o.layout===state.document.active_layout&&!o.library&&(o.structure_role==="part"||o.structure_role==="group"));
  const seen=new Set<string>();
  return candidates.filter(o=>{if(candidates.some(parent=>o.id.startsWith(parent.id+"/"))||seen.has(o.source_id))return false;seen.add(o.source_id);return true;});
}

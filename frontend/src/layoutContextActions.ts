import type {ContextAction} from "./ContextMenu";
import type {Occurrence, RunCommand} from "./types";

/** Placement actions shared by the layout tree and viewport. */
export function layoutContextActions(row:Occurrence, disabled:boolean, run:RunCommand,
  move:()=>void, confirmRemove:()=>void):ContextAction[]{
  const actions:ContextAction[]=[];
  if(row.structure_role!=="group")actions.push({label:"Move in Layout",disabled,action:move});
  if(row.structure_role==="part")actions.push({label:"Duplicate in Layout",disabled,action:()=>{void run("group.copy",{occurrence:row.id}).catch(()=>{});}});
  actions.push({label:row.visible?"Hide":"Show",disabled,action:()=>{void run("instance.visibility",{id:row.source_id,visible:!row.visible}).catch(()=>{});}});
  actions.push({label:"Remove from Layout",disabled,action:confirmRemove});
  return actions;
}

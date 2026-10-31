import type {State} from "./types";

export function editorContext(state:State|null,scope:string,toolBody:string|null){
  if(toolBody)return "Component Editor";
  if(!state?.document.structure_version)return "Layout Editor";
  const row=state.occurrences.find(o=>o.id===scope);
  if(row&&row.kind!=="assembly")return "Component Editor";
  if(row&&state.document.components[row.definition]?.structure_role==="part")return "Part Editor";
  if(row&&state.occurrences.some(o=>(o.structure_role||state.document.components[o.definition]?.structure_role)==='part'&&scope.startsWith(o.id+'/')))return 'Part Editor';
  return "Layout Editor";
}

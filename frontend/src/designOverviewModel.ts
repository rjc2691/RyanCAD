import type {State} from "./types";

/** Definition counts match the library; placement counts match layout trees. */
export function designOverview(state:State){
  const doc=state.document,definitions=Object.values(doc.components).filter(c=>!c.id.includes("__"));
  const physical=definitions.filter(c=>c.id!=="root"&&c.purpose!=="tool");
  const placed=state.occurrences.filter(o=>o.layout&&!o.library&&!o.suppressed);
  const active=placed.filter(o=>o.layout===doc.active_layout);
  return {
    layouts:physical.filter(c=>c.structure_role==="layout").length,
    parts:physical.filter(c=>c.structure_role==="part").length,
    components:physical.filter(c=>c.kind==="solid").length,
    sketches:Object.values(doc.features).filter(f=>f.type==="sketch").length,
    tools:definitions.filter(c=>c.purpose==="tool"&&c.kind!=="assembly").length,
    variations:Object.keys(doc.variations||{}).length,
    placements:placed.filter(o=>o.structure_role==="part").length,
    activeLayout:doc.components[doc.active_layout||""]?.name||null,
    activeParts:active.filter(o=>o.structure_role==="part").length,
    activeComponents:active.filter(o=>o.kind==="solid"&&doc.components[o.definition]?.purpose!=="tool").length,
    parameters:Object.values(doc.parameters).filter(p=>p.named).length,
  };
}

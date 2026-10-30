import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutContextActions} from '../frontend/src/layoutContextActions.ts';
test('layout actions manipulate the picked placement and require confirmation before removal',async()=>{
 const calls=[],row={id:'layout/part',source_id:'placed',structure_role:'part',visible:true};
 const actions=layoutContextActions(row,false,async(...args)=>calls.push(args),()=>calls.push('move'),()=>calls.push('confirm'));
 assert.deepEqual(actions.map(a=>a.label),['Move in Layout','Duplicate in Layout','Hide','Remove from Layout']);
 actions[0].action();await actions[1].action();await actions[2].action();actions[3].action();
 assert.deepEqual(calls,['move',['group.copy',{occurrence:'layout/part'}],['instance.visibility',{id:'placed',visible:false}],'confirm']);
});
test('part groups expose membership placement actions without unsupported movement or definition changes',()=>{
 const actions=layoutContextActions({structure_role:'group',visible:false},true,async()=>{},()=>{},()=>{});
 assert.deepEqual(actions.map(a=>a.label),['Show','Remove from Layout']);assert(actions.every(a=>a.disabled));
});

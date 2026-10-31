import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutContextActions,layoutRemovalTargets} from '../frontend/src/layoutContextActions.ts';
test('layout actions manipulate the picked placement and remove it immediately',async()=>{
 const calls=[],row={id:'layout/part',source_id:'placed',structure_role:'part',visible:true};
 const actions=layoutContextActions(row,false,async(...args)=>calls.push(args),()=>calls.push('move'));
 assert.deepEqual(actions.map(a=>a.label),['Move in Layout','Duplicate in Layout','Hide','Remove from Layout']);
 actions[0].action();await actions[1].action();await actions[2].action();await actions[3].action();
 assert.deepEqual(calls,['move',['group.copy',{occurrence:'layout/part'}],['instance.visibility',{id:'placed',visible:false}],['structure.remove',{instance:'placed'}]]);
});
test('layout groups expose movement and placement actions without part definition changes',()=>{
 const actions=layoutContextActions({structure_role:'group',visible:false},true,async()=>{},()=>{});
 assert.deepEqual(actions.map(a=>a.label),['Move in Layout','Show','Remove from Layout']);assert(actions.every(a=>a.disabled));
});

test('layout removal resolves body hits to placements and excludes library definitions and redundant descendants',()=>{
 const rows=[{id:'layout',definition:'l',structure_role:'layout',kind:'assembly',parent:'root'},{id:'layout/p',definition:'p',source_id:'p1',structure_role:'part',kind:'assembly',layout:'l'},{id:'layout/p/body',definition:'b',structure_role:'component',kind:'solid',layout:'l'},{id:'library',definition:'p',source_id:'lib',structure_role:'part',library:true},{id:'layout/group',definition:'g',source_id:'g1',structure_role:'group',kind:'assembly',layout:'l'},{id:'layout/group/q',definition:'q',source_id:'q1',structure_role:'part',kind:'assembly',layout:'l'}];
 const state={document:{active_layout:'l'},occurrences:rows};
 assert.deepEqual(layoutRemovalTargets(state,{occurrence:'layout/p/body',definition:'b'},'layout').map(o=>o.source_id),['p1']);assert.equal(layoutRemovalTargets(state,{occurrence:'library',definition:'p'},'layout').length,0);assert.equal(layoutRemovalTargets(state,{worldOrigin:true,occurrence:'',definition:'root'},'layout').length,0);
 const items=[{occurrence:'layout/group',definition:'g'},{occurrence:'layout/group/q',definition:'q'},{occurrence:'layout/p',definition:'p'}];assert.deepEqual(layoutRemovalTargets(state,{...items[0],items},'layout').map(o=>o.source_id),['p1','g1']);
});

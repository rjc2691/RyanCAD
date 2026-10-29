import test from 'node:test';
import assert from 'node:assert/strict';
import {TOOLBAR_SHORTCUTS,toolbarShortcut,shortcutAttributes,shortcutScope,normalizeToolbarPreferences,assignShortcut,saveToolbarPreferences,getToolbarPreferences,shortcutConflicts,reorderToolbar} from '../frontend/src/toolbarShortcuts.ts';
const event=(code,extra={})=>({code,key:code.slice(3).toLowerCase(),shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,isComposing:false,repeat:false,...extra});
test('every toolbar shortcut is unique and matches its intended modifiers',()=>{
 const seen=new Set();for(const [id,s]of Object.entries(TOOLBAR_SHORTCUTS)){
 const signature=JSON.stringify([s.code,!!s.shift,!!s.command,shortcutScope(id)]);assert(!seen.has(signature));seen.add(signature);
 assert.equal(toolbarShortcut(event(s.code,{shiftKey:!!s.shift,ctrlKey:!!s.command}),shortcutScope(id)==='sketch'?'sketch':'model'),id);
 assert.equal(shortcutAttributes(id)['data-toolbar-action'],id);
 }
 assert.equal(toolbarShortcut(event('KeyK',{metaKey:true})),'search');
});
test('shortcuts do not hijack browser combinations, input composition or held keys',()=>{
 for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{repeat:true}])assert.equal(toolbarShortcut(event('KeyT',extra)),null);
 assert.equal(toolbarShortcut(event('KeyP',{shiftKey:true})),null);
 assert.equal(toolbarShortcut(event('KeyE',{shiftKey:true})),'export');
 assert.equal(toolbarShortcut(event('Comma',{key:'<',shiftKey:true})),'settings');
});

test('custom shortcuts overwrite only after assignment and scope conflicts do not include sketch-only bindings',()=>{
 const original=getToolbarPreferences();try{
 const b={code:'KeyP',label:'P'};assert(shortcutConflicts('measure',b).includes('parameters'));assert(!shortcutConflicts('measure',b).includes('sketch_point'));
 assignShortcut('measure',b);assert.equal(toolbarShortcut(event('KeyP')),'measure');assert.equal(getToolbarPreferences().bindings.parameters,null);
 assert.equal(toolbarShortcut(event('KeyI')),null);reorderToolbar('parameters','tool');assert.equal(getToolbarPreferences().order[0],'parameters');
 assert.deepEqual(normalizeToolbarPreferences({order:['tool','tool','invalid']}).order.slice(0,2),['tool','assembly']);
 }finally{saveToolbarPreferences(original);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {editorContext} from '../frontend/src/editorContext.ts';
test('movement terminology follows the actual editor scope',()=>{
 const state={document:{structure_version:1,components:{l:{structure_role:'layout'},g:{structure_role:'group'},p:{structure_role:'part'},b:{structure_role:'component'}}},occurrences:[{id:'layout',definition:'l',kind:'assembly'},{id:'layout/group',definition:'g',kind:'assembly'},{id:'library',definition:'p',kind:'assembly'},{id:'library/body',definition:'b',kind:'solid'}]};
 assert.equal(editorContext(state,'layout',null),'Layout Editor');assert.equal(editorContext(state,'layout/group',null),'Layout Editor');
 assert.equal(editorContext(state,'library',null),'Part Editor');assert.equal(editorContext(state,'library/body',null),'Component Editor');
 assert.equal(editorContext(state,'missing',null),'Layout Editor');assert.equal(editorContext(state,'','tool'),'Component Editor');
 assert.equal(editorContext(null,'',null),'Layout Editor');
});

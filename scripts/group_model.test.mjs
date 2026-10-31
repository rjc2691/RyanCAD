import test from 'node:test';
import assert from 'node:assert/strict';
import {groupSelection,expandedGroupSelection,groupCandidates,remapTreePath} from '../frontend/src/groupModel.ts';
import {inferMovePick} from '../frontend/src/movementModel.ts';
const rows=[{id:'g',definition:'group',kind:'assembly'},{id:'g/a',definition:'a',kind:'solid'},{id:'g/n',definition:'nested',kind:'assembly'},{id:'g/n/b',definition:'b',kind:'solid'},{id:'c',definition:'c',kind:'solid'}];
const hit={occurrence:'g/n/b',definition:'b',face:{id:'f'}};
test('viewport clicks select the nearest closed group, and edit scope exposes its immediate children',()=>{
 assert.deepEqual(groupSelection(hit,rows),{occurrence:'g',definition:'group'});
 assert.deepEqual(groupSelection(hit,rows,'g'),{occurrence:'g/n',definition:'nested'});
 assert.equal(groupSelection(hit,rows,'g/n'),hit);
 assert.equal(groupSelection({occurrence:'c',definition:'c'},rows,'g'),null);
});
test('whole group highlighting expands to physical descendants and the tree stays at the current level',()=>{
 assert.deepEqual(expandedGroupSelection({occurrence:'g',definition:'group'},rows).map(s=>s.occurrence),['g/a','g/n/b']);
 assert.deepEqual(groupCandidates(rows).map(o=>o.id),['g','c']);assert.deepEqual(groupCandidates(rows,'g').map(o=>o.id),['g/a','g/n']);
});
test('a picked descendant point is a movement origin for the active group',()=>{
 assert.equal(inferMovePick('reference','g',{...hit,vertex:{point:[0,0,0]}}),'origin');
 assert.equal(inferMovePick('reference','g',{occurrence:'c',definition:'c',vertex:{point:[0,0,0]}}),'target');
});

test('reorganization remaps expanded descendants with the longest matching occurrence prefix',()=>{
 assert.equal(remapTreePath('g/n/b',{'g':'q/g','g/n':'r/n'}),'r/n/b');
 assert.equal(remapTreePath('g2/a',{'g':'q/g'}),'g2/a');
});

test('world origin remains selectable inside every component or part scope',()=>{
 const origin={worldOrigin:true,occurrence:'',definition:'root'};
 for(const scope of ['', 'g', 'g/n', 'g/n/b'])assert.equal(groupSelection(origin,rows,scope),origin);
});

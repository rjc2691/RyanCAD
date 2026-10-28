import test from 'node:test';
import assert from 'node:assert/strict';
import {groupSelection,expandedGroupSelection,groupCandidates,componentTreeRows,treeDropParent,treeDropProblem,remapTreePath} from '../frontend/src/groupModel.ts';
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

test('component browser expands nested branches without removing top-level siblings',()=>{
 const visible=componentTreeRows(rows,new Set(['g','g/n']));
 assert.deepEqual(visible.map(r=>[r.occurrence.id,r.depth]),[['g',0],['g/a',1],['g/n',1],['g/n/b',2],['c',0]]);
 assert.deepEqual(visible.map(r=>r.childCount),[2,0,1,0,0]);
 assert.deepEqual(componentTreeRows(rows,new Set(['g/n'])).map(r=>r.occurrence.id),['g','c']);
 assert.equal(visible[2].position,2); assert.equal(visible[2].siblings,2);
});

test('tree follows ownership even if children arrive before parents and never mutates occurrences',()=>{
 const shuffled=[rows[3],rows[1],rows[0],rows[2],rows[4]], original=JSON.stringify(shuffled);
 assert.deepEqual(componentTreeRows(shuffled,new Set(['g','g/n'])).map(r=>r.occurrence.id),['g','g/a','g/n','g/n/b','c']);
 assert.equal(JSON.stringify(shuffled),original);
});

test('tree drops distinguish group membership from sibling levels and reject cycles and no-ops',()=>{
 assert.equal(treeDropParent(rows[0]),'g'); assert.equal(treeDropParent(rows[1]),'g'); assert.equal(treeDropParent(null),'');
 assert.equal(treeDropProblem(rows,'c','g'),'');
 assert(treeDropProblem(rows,'g','g/n').includes('descendants'));
 assert(treeDropProblem(rows,'g/a','g').includes('Already'));
 assert(treeDropProblem([...rows,{id:'other',definition:'group',kind:'assembly'}],'c','g').includes('shared'));
 assert(treeDropProblem(rows.map(o=>o.id==='c'?{...o,pattern_mode:'linear'}:o),'c','g').includes('Patterned'));
});

test('reorganization remaps expanded descendants with the longest matching occurrence prefix',()=>{
 assert.equal(remapTreePath('g/n/b',{'g':'q/g','g/n':'r/n'}),'r/n/b');
 assert.equal(remapTreePath('g2/a',{'g':'q/g'}),'g2/a');
});

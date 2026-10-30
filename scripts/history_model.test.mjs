import test from 'node:test';
import assert from 'node:assert/strict';
import {historyLanes,historyPartOwners,historyStep,currentHistoryLane,historyConnections,HISTORY_LAYOUT} from '../frontend/src/historyModel.ts';
const features=[{id:'a1',owner:'a'},{id:'s',owner:'root'},{id:'b1',owner:'b'},{id:'a2',owner:'a'},{id:'t',owner:'tool'}];
const components={a:{name:'Bracket'},b:{name:'Cover'},root:{name:'Design'},tool:{name:'Cutter',purpose:'tool'}};
test('Now belongs to the active visible component lane, or the design lane',()=>{
 const lanes=historyLanes(features,components,true,new Set(['b']));
 assert.equal(currentHistoryLane(lanes,'a'),'a');
 assert.equal(currentHistoryLane(lanes,'b'),'root');
 assert.equal(currentHistoryLane(lanes,null),'root');
 assert.equal(currentHistoryLane(historyLanes(features,components,false,new Set()),'a'),'root');
});
test('parallel timelines preserve global columns and root events across owners',()=>{
 const lanes=historyLanes(features,components,true,new Set());
 assert.deepEqual(lanes.find(l=>l.id==='a').features.map(f=>f.column),[0,3]);
 assert.deepEqual(lanes[0].features.map(f=>f.column),[1]);
 assert.equal(lanes.find(l=>l.id==='tool').name,'Cutter');
 assert.equal(lanes.flatMap(l=>l.features).length,features.length);
});
test('hiding lanes merges events into root without compacting or losing columns',()=>{
 const lanes=historyLanes(features,components,true,new Set(['a','tool']));
 assert.deepEqual(lanes[0].features.map(f=>f.column),[0,1,3,4]);
 assert(!lanes.some(l=>l.id==='a'));
 const unified=historyLanes(features,components,false,new Set(['a']));
 assert.equal(unified.length,1);assert.deepEqual(unified[0].features.map(f=>f.column),[0,1,2,3,4]);
});
test('history steps represent actual feature removal, origin, and return to live design',()=>{
 const order=['a','b','c'];
 assert.equal(historyStep(order,null,-1),'b');
 assert.equal(historyStep(order,'b',-1),'a');
 assert.equal(historyStep(order,'a',-1),'origin');
 assert.equal(historyStep(order,'origin',1),'a');
 assert.equal(historyStep(order,'b',1),null);
 assert.equal(historyStep(['a'],null,-1),'origin');
 assert.equal(historyStep(['a'],'origin',1),null);
});

test('chronology connects consecutive global events, including upward and downward lane jumps',()=>{
 const lanes=historyLanes(features,components,true,new Set());
 const connections=historyConnections(lanes);
 assert.deepEqual(connections.map(c=>[c.from,c.to]),[['a1','s'],['s','b1'],['b1','a2'],['a2','t']]);
 assert.deepEqual(connections.map(c=>[c.fromColumn,c.toColumn]),[[0,1],[1,2],[2,3],[3,4]]);
 assert.deepEqual(connections.map(c=>[c.fromLane,c.toLane]),[['a','root'],['root','b'],['b','a'],['a','tool']]);
 assert(connections.every(c=>c.jump));
 for(const c of connections){
  const fromRow=lanes.findIndex(l=>l.id===c.fromLane),toRow=lanes.findIndex(l=>l.id===c.toLane);
  const {columnWidth,tileWidth,rowHeight,trackY,featureWidth}=HISTORY_LAYOUT;
  const start=`M${c.fromColumn*columnWidth+tileWidth} ${fromRow*rowHeight+trackY}`;
  const end=`${c.toColumn*columnWidth} ${toRow*rowHeight+trackY}`;
  assert(c.path.startsWith(start),c.path);
  assert(c.path.endsWith(end),c.path);
  // A lane-changing curve starts after the source caption, inside the empty
  // column gutter. It enters the next tile on its center line, never its label.
  assert(c.path.includes(` H${c.fromColumn*columnWidth+featureWidth} `));
  assert.equal(c.path.match(/ Q/g).length,2);
  const coordinates=c.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const x=[coordinates[0],coordinates[2],coordinates[3],coordinates[5],coordinates[7],coordinates[9],coordinates[11]];
  for(let i=1;i<x.length;i++)assert(x[i]>=x[i-1],`Connection must move forward in time: ${c.path}`);
 }
});

test('same-lane chronological events use a straight track',()=>{
 const data=[{id:'one',owner:'a'},{id:'two',owner:'a'},{id:'three',owner:'b'},{id:'four',owner:'b'}];
 const connections=historyConnections(historyLanes(data,components,true,new Set()));
 assert.deepEqual(connections.map(c=>c.jump),[false,true,false]);
 assert.equal(connections[0].path,'M43 117 L112 117');
 assert.equal(connections[2].path,'M267 213 L336 213');
});

test('merging and restoring lanes reroutes chronology without changing event order or columns',()=>{
 const original=historyConnections(historyLanes(features,components,true,new Set()));
 const merged=historyConnections(historyLanes(features,components,true,new Set(['a'])));
 assert.deepEqual(merged.map(c=>[c.from,c.to,c.fromColumn,c.toColumn]),original.map(c=>[c.from,c.to,c.fromColumn,c.toColumn]));
 assert.equal(merged[0].fromLane,'root');
 assert.equal(merged[0].toLane,'root');
 assert(!merged[0].jump);
 assert.deepEqual(historyConnections(historyLanes(features,components,true,new Set())),original);
 assert(historyConnections(historyLanes(features,components,false,new Set())).every(c=>!c.jump));
});

test('empty and single-event timelines have no chronological connections',()=>{
 assert.deepEqual(historyConnections(historyLanes([],components,true,new Set())),[]);
 assert.deepEqual(historyConnections(historyLanes(features.slice(0,1),components,true,new Set())),[]);
});

test('structured history uses part names and combines component features without duplicating layout copies',()=>{
 const definitions={root:{name:'Design'},p:{name:'Mounting plate',structure_role:'part'},q:{name:'Cover',structure_role:'part'},group:{name:'Group',structure_role:'group'},a:{name:'Component'},b:{name:'Component'},c:{name:'Component'},tool:{name:'Cutter',purpose:'tool'}};
 const instances={a:{definition:'a',parent:'p'},b:{definition:'b',parent:'group'},group:{definition:'group',parent:'p'},c:{definition:'c',parent:'q'},copy:{definition:'p',parent:'layout1'},copy2:{definition:'p',parent:'layout2'}};
 const owners=historyPartOwners(definitions,instances),events=[{id:'1',owner:'a'},{id:'2',owner:'c'},{id:'3',owner:'b'},{id:'4',owner:'root'},{id:'5',owner:'tool'}];
 const lanes=historyLanes(events,definitions,true,new Set(),owners);
 assert.deepEqual(lanes.map(l=>l.name),['Design / merged','Mounting plate','Cover','Cutter']);
 assert.deepEqual(lanes.find(l=>l.id==='p').features.map(f=>f.column),[0,2]);
 assert.equal(currentHistoryLane(lanes,owners.b),'p');
 assert.deepEqual(historyLanes(events,definitions,true,new Set(['p']),owners)[0].features.map(f=>f.column),[0,2,3]);
 assert.equal(lanes.flatMap(l=>l.features).length,events.length);
 definitions.p.name='Renamed plate';assert.equal(historyLanes(events,definitions,true,new Set(),owners)[1].name,'Renamed plate');
});

test('nearest part wins for nested parts and shared definitions have one stable lane',()=>{
 const defs={p:{name:'Outer',structure_role:'part'},q:{name:'Inner',structure_role:'part'},a:{name:'Component'},orphan:{name:'Unused'}};
 const owners=historyPartOwners(defs,{nested:{definition:'q',parent:'p'},first:{definition:'a',parent:'q'},shared:{definition:'a',parent:'p'}});
 assert.equal(owners.a,'q');assert.equal(owners.q,'q');assert.equal(owners.orphan,'root');
});

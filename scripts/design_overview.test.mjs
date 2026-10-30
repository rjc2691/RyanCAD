import test from 'node:test';
import assert from 'node:assert/strict';
import {designOverview} from '../frontend/src/designOverviewModel.ts';

test('overview separates reusable definitions from placements and excludes virtual variant bodies',()=>{
 const c=(id,kind,structure_role='component',more={})=>({id,name:id,kind,structure_role,...more});
 const s={document:{active_layout:'l',components:{root:c('root','assembly'),l:c('l','assembly','layout'),l2:c('l2','assembly','layout'),p:c('p','assembly','part'),b:c('b','solid'),independent:c('independent','solid','component',{source_definition:'b'}),v__b:c('v__b','solid','component',{source_definition:'b'}),tool:c('tool','solid','component',{purpose:'tool'})},features:{s:{type:'sketch'},op:{type:'operation'}},parameters:{named:{named:true},local:{named:false}},variations:{v:{}}},occurrences:[
  {id:'library',definition:'p',structure_role:'part',kind:'assembly',library:true},
  {id:'library/b',definition:'b',kind:'solid',library:true},
  {id:'first',definition:'p',structure_role:'part',kind:'assembly',layout:'l'},
  {id:'first/b',definition:'b',kind:'solid',layout:'l'},
  {id:'second',definition:'p',structure_role:'part',kind:'assembly',layout:'l2'},
  {id:'second/b',definition:'v__b',kind:'solid',layout:'l2'},
  {id:'suppressed',definition:'p',structure_role:'part',kind:'assembly',layout:'l',suppressed:true},
 ]};
 assert.deepEqual(designOverview(s),{layouts:2,parts:1,components:2,sketches:1,tools:1,variations:1,placements:2,activeLayout:'l',activeParts:1,activeComponents:1,parameters:1});
});

test('blank design has honest zero library counts and one empty layout',()=>{
 const s={document:{active_layout:'layout',components:{layout:{id:'layout',name:'Layout 1',kind:'assembly',structure_role:'layout'}},features:{},parameters:{}},occurrences:[]};
 const d=designOverview(s);assert.equal(d.layouts,1);assert.equal(d.parts,0);assert.equal(d.components,0);assert.equal(d.sketches,0);assert.equal(d.placements,0);assert.equal(d.activeLayout,'Layout 1');
});

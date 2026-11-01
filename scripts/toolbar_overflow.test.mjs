import test from 'node:test';
import assert from 'node:assert/strict';
import {toolbarVisibleCount,toolbarAllocation} from '../frontend/src/toolbarOverflow.ts';

test('overflow appears only when the complete group no longer fits',()=>{
  const widths=[80,90,100];
  assert.equal(toolbarVisibleCount(widths,278),3);
  assert.equal(toolbarVisibleCount(widths,277),2);
  assert.equal(toolbarVisibleCount(widths,123),0);
  assert.equal(toolbarVisibleCount(widths,124),1);
  assert.equal(toolbarVisibleCount([],0),0);
});

test('fractional measurements produce a stable conservative fit at thresholds',()=>{
  const widths=[67.125,111.75,82.25,148.875];
  for(let budget=40;budget<=1000;budget++){
    const count=toolbarVisibleCount(widths,budget+.49);
    assert.equal(toolbarVisibleCount(widths,budget+.01),count);
    assert.equal(toolbarVisibleCount(widths,budget+.99),count);
    const visible=widths.slice(0,count).map(Math.ceil);
    const needed=visible.reduce((sum,width)=>sum+width,0)+4*Math.max(0,count-1)+(count<widths.length?40+(count?4:0):0);
    assert(needed<=budget,`budget ${budget} cannot fit ${count} controls`);
    if(budget>40)assert(count>=toolbarVisibleCount(widths,budget-1));
  }
});

test('fit is independent of the previous allocation or repeated measurements',()=>{
  const widths=[82,106,90,116,94,128,162,90,40];
  for(const budget of [400,800,600,1000,500,400]){
    const expected=toolbarVisibleCount(widths,budget);
    for(let i=0;i<100;i++)assert.equal(toolbarVisibleCount(widths,budget),expected);
  }
});


test('settings remains last in the visible group when other tools overflow',()=>{
  assert.deepEqual(toolbarAllocation([80,90,30],208,2),{visible:[0,1,2],hidden:[]});
  assert.deepEqual(toolbarAllocation([80,90,30],207,2),{visible:[0,2],hidden:[1]});
  assert.deepEqual(toolbarAllocation([30,80,90],207,0),{visible:[1,0],hidden:[2]});
  assert.deepEqual(toolbarAllocation([80,90,30],100,2),{visible:[2],hidden:[0,1]});
});

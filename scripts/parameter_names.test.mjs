import test from 'node:test';
import assert from 'node:assert/strict';
import { parameterNames, expressionParameterNames } from '../frontend/src/parameterNames.ts';
import { formatMeasurement } from '../frontend/src/measurements/MeasurementService.ts';
import { sketchMeasurements } from '../frontend/src/sketchMeasurements.ts';

test('only deliberate named dependencies produce parameter provenance', () => {
  const parameters = {
    p_aaa: {name:'Wall width',named:true,expression:'5'},
    p_bbb: {name:'Private width',named:false,expression:'p_aaa * 2'},
    p_ccc: {name:'Private height',named:false,expression:'5'},
  };
  assert.deepEqual(parameterNames(parameters,'p_bbb'),['Wall width']);
  assert.deepEqual(parameterNames(parameters,'p_ccc'),[]);
  assert.deepEqual(expressionParameterNames(parameters,'[Wall width] * 2'),['Wall width']);
  assert.deepEqual(expressionParameterNames(parameters,'5'),[]);
});
test('parameter annotations keep the evaluated value and expose the exact name', () => {
  assert.equal(formatMeasurement({value:5,kind:'length',parameterNames:['Wall width']},'mm'),'p: 5 mm');
  assert.equal(formatMeasurement({value:5,kind:'length'},'mm'),'5 mm');
  const [annotation] = sketchMeasurements({entities:[{id:'l',type:'line',x1:0,y1:0,x2:5,y2:0}],constraints:[{type:'distance',a:'l.start',b:'l.end',value:5,parameterName:'Wall width'}]});
  assert.equal(annotation.label,'p: 5 mm');
  assert.equal(annotation.parameterName,'Wall width');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {FEATURE_EDIT_SECTION_ORDER,featureEditChanges,featureEditValues,featureFieldSection,featureFieldLabel,featureFieldVisible,featureSavedReferences} from '../frontend/src/featureEditModel.ts';
const feature={id:'f',name:'Block',owner:'p',type:'operation',parameters:{width:'w',distance:'t'},options:{profile:'rectangle',motion:'linear',reverse:false},suppressed:false};
const state={document:{parameters:{w:{named:false,expression:'40'},t:{named:true,name:'Thickness',expression:'6'}}}};
test('editing starts from saved expressions and keeps deliberate named bindings',()=>{
 assert.deepEqual(featureEditValues(feature,state),{width:'40',distance:'@t'});
});
test('unchanged features do not create transactions; updates contain only edited dimensions and options',()=>{
 const initial=featureEditValues(feature,state);
 assert.equal(featureEditChanges(feature,initial,initial,'Block',{},false),null);
 assert.deepEqual(featureEditChanges(feature,initial,{...initial,width:'50'},'Block',{reverse:true},false),{id:'f',name:'Block',values:{width:'50'},options:{reverse:true},suppressed:false});
 assert.deepEqual(featureEditChanges(feature,initial,{...initial,width:'@named'},'Block',{},false).values,{width:{parameter:'named'}});
});
test('historical operation inputs retain consistent origin/profile/path terminology',()=>{
 assert.equal(featureFieldSection(feature,'offset_u'),'Tool Origin');
 assert.equal(featureFieldSection(feature,'width'),'Tool Profile');
 assert.equal(featureFieldSection(feature,'point_0_u'),'Tool Profile');
 assert.equal(featureFieldSection(feature,'path_percent'),'Tool Path');
 assert.equal(featureFieldLabel({...feature,options:{profile:'fillet'}},'amount'),'Fillet radius');
 assert.equal(featureFieldLabel(feature,'point_2_v'),'Profile point 3 V');
});
test('basic history layout keeps placement values without exposing origin or offset inputs',()=>{
 assert.deepEqual(FEATURE_EDIT_SECTION_ORDER.slice(0,3),['Tool Profile','Tool Path','Tool Origin']);
 for(const field of ['offset_u','offset_v','offset_n','origin_x','origin_y','origin_z'])assert.equal(featureFieldVisible(field),false);
 assert.equal(featureFieldVisible('distance'),true);
 assert.equal(featureFieldVisible('axis_x'),true);
 const f={...feature,parameters:{...feature.parameters,offset_u:'u'}};
 const s={...state,document:{parameters:{...state.document.parameters,u:{named:false,expression:'3'}}}};
 const initial=featureEditValues(f,s);const changes=featureEditChanges(f,initial,{...initial,width:'50'},f.name,{},false);
 assert.equal(initial.offset_u,'3');assert.deepEqual(changes.values,{width:'50'});
});
function referenceState(){return {document:{components:{p:{name:'Plate'},external:{name:'Other part'}},features:{}},geometry:{p:{edges:[{name:'Edge 4',signature:'edge'}],faces:[{name:'Face 6',signature:'face'}]}},parameter_graph:{}};}
test('saved local faces and edge chains display current matching names and keep original selection order',()=>{
 const s=referenceState(),f={...feature,references:{},options:{...feature.options,direction:'edge',reference_snapshot:{refs:{
  profile_reference:{local:true,selection:{component:'p',face:'face'}},
  path_reference:{local:true,selection:{component:'p',edge:'edge'}},
  path_1:{local:true,selection:{component:'p',edge:'removed'}},
  path_0:{local:true,selection:{component:'p',edge:'edge'}},
 }}}};
 assert.equal(featureSavedReferences(f,s,'profile')[0].label,'Face 6 · Plate');
 assert.deepEqual(featureSavedReferences(f,s,'path').map(r=>r.label),['Edge 4 · Plate','Saved edge · Plate']);
});
test('copied external geometry never borrows a current component name or topology ID',()=>{
 const s=referenceState(),f={...feature,references:{},options:{...feature.options,profile:'face',reference_snapshot:{refs:{profile_reference:{local:false,selection:{component:'p',face:'face'}}}}}};
 assert.deepEqual(featureSavedReferences(f,s,'profile'),[{label:'Saved face',detail:'Copied reference geometry · read only'}]);
});
test('implicit planes, world directions, origins, saved sketches and travel targets remain readable',()=>{
 const s=referenceState(),f={...feature,references:{},options:{...feature.options,plane:'XY',direction:'normal'}};
 assert.equal(featureSavedReferences(f,s,'profile')[0].label,'World XY plane');
 assert.equal(featureSavedReferences(f,s,'path')[0].label,'Tool Profile normal');
 assert.deepEqual(featureSavedReferences(f,s,'target'),[]);
 f.options.direction='Z';assert.equal(featureSavedReferences(f,s,'path')[0].label,'World Z direction');
 f.options.reference_snapshot={refs:{reference:{local:false,selection:{world:'origin'}},travel_target:{local:true,selection:{component:'p',edge:'edge',anchor:'mid'}}}};
 assert.equal(featureSavedReferences(f,s,'origin')[0].label,'World origin');
 assert.equal(featureSavedReferences(f,s,'target')[0].label,'Midpoint · Edge 4 · Plate');
 f.options.profile='sketch';f.options.reference_snapshot={profile:'copied-brep'};assert.equal(featureSavedReferences(f,s,'profile')[0].label,'Saved sketch profile');
 f.options.profile='fillet';assert.equal(featureSavedReferences(f,s,'profile')[0].label,'Round corner profile');
 assert.equal(featureSavedReferences(f,s,'origin')[0].label,'From Tool Path');
});

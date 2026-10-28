import test from 'node:test';
import assert from 'node:assert/strict';
import {moveReference, movePoint, moveDirection, worldMovePoint, inferMovePick, movementArgs, inferredMoveLabel, worldAxisReference, inferredMovementDistance} from '../frontend/src/movementModel.ts';
const edge={id:'e_0',name:'Edge 1',type:'LINE',start:[0,2,4],end:[8,2,4],center:[99,99,99]};
const state={document:{components:{part:{name:'Part'}}},geometry:{part:{geometry_key:'current',edges:[edge],vertices:[[0,2,4]]}},occurrences:[{id:'a/part',name:'Placed part',matrix:[[0,-1,0,10],[1,0,0,20],[0,0,1,30],[0,0,0,1]]}]};
const s={occurrence:'a/part',definition:'part'};
test('a straight-edge point snaps to exact midpoint, independent of center metadata',()=>{
 const r=moveReference({...s,edge},state);assert.equal(r.anchor,'mid');assert.deepEqual(movePoint(r),{occurrence:'a/part',point:[4,2,4]});
 assert.deepEqual(movePoint({...r,anchor:'start'}).point,[0,2,4]);assert.deepEqual(movePoint({...r,anchor:'end'}).point,[8,2,4]);
});
test('vertices and curved-edge endpoints retain exact local coordinates',()=>{
 const r=moveReference({...s,vertex:{point:[0,2,4],edge,anchor:'start'}},state);assert.deepEqual(movePoint(r).point,[0,2,4]);
 const curve=moveReference({...s,edge:{...edge,type:'CIRCLE'}},state);assert.equal(curve.anchor,'start');
});
test('faces use the geometric center rather than an ambiguous mouse surface hit',()=>{
 const r=moveReference({...s,face:{id:'face_0',center:[1,2,3]},point:[7,8,9]},state);assert.deepEqual(movePoint(r).point,[1,2,3]);
});
test('component origins and local picks resolve through the placed world matrix',()=>{
 const r=moveReference(s,state);assert.deepEqual(movePoint(r).point,[0,0,0]);assert.deepEqual(worldMovePoint(r,state),[10,20,30]);
 assert.deepEqual(worldMovePoint(moveReference({...s,edge},state),state),[8,24,34]);
});
test('reference direction is an explicit straight nonzero edge, never a curve chord',()=>{
 const r=moveReference({...s,edge},state);assert.deepEqual(moveDirection(r),{occurrence:'a/part',start:[0,2,4],end:[8,2,4]});
 for(const bad of [{...edge,type:'CIRCLE'},{...edge,end:[0,2,4]},undefined])assert.throws(()=>moveDirection({...r,selection:{...s,edge:bad}}),/straight edge/);
});
test('implicit point picks use component membership; edges always infer direction',()=>{
 assert.equal(inferMovePick('reference','a/part',{...s,vertex:{point:[0,2,4]}}),'origin');
 assert.equal(inferMovePick('reference','a/part',{...s,occurrence:'other',face:{center:[1,2,3]}}),'target');
 for(const occurrence of ['a/part','other']) assert.equal(inferMovePick('reference','a/part',{...s,occurrence,edge}),'direction');
 assert.equal(inferMovePick('reference','a/part',s),'component');
});
test('explicit point and component picks override implicit edge direction',()=>{
 assert.equal(inferMovePick('reference','a/part',{...s,edge},'origin'),'origin');
 assert.equal(inferMovePick('reference','a/part',{...s,edge},'target'),'target');
 assert.equal(inferMovePick('reference','a/part',{...s,vertex:{point:[0,2,4]}},'component'),'component');
 assert.equal(inferMovePick('rotate','a/part',{...s,edge}),'direction');
 assert.equal(inferMovePick('rotate','a/part',{...s,face:{}}),null);
});
test('reference payload preserves optional selections; clearing distance restores target inference',()=>{
 const refs={target:moveReference({...s,occurrence:'other'},state),direction:moveReference({...s,edge},state)},o={id:'a/part',source_id:'part'};
 let args=movementArgs('reference',o,refs,{distance:'5 mm'},false);assert.equal(args.method,'reference');assert.equal(args.values.distance,'5 mm');assert(args.target&&args.direction);assert.equal(args.origin,undefined);
 args=movementArgs('reference',o,refs,{distance:''},false);assert.deepEqual(args.values,{});assert.equal(inferredMoveLabel(refs,''),'Target projected onto direction');
 args=movementArgs('reference',o,{target:refs.target},{distance:''},false);assert.equal(args.direction,undefined);assert.equal(inferredMoveLabel({target:refs.target},''),'Point to point');
 assert.throws(()=>movementArgs('reference',o,{direction:refs.direction},{distance:''},false),/Enter an exact distance/);
 args=movementArgs('rotate',o,refs,{angle:'@angle_param'},false);assert.deepEqual(args.values,{angle:{parameter:'angle_param'}});assert.equal(args.target,undefined);
});
test('world directions serialize without borrowing a component frame',()=>{
 for(const axis of ['X','Y','Z']) {
  const r=worldAxisReference(axis);assert.deepEqual(moveDirection(r),{axis});
  assert.deepEqual(worldMovePoint({...r,anchor:'end'},state),['X','Y','Z'].map(a=>a===axis?30:0));
  assert.deepEqual(movementArgs('reference',{id:'a/part',source_id:'part'},{direction:r},{distance:'7'},false).direction,{axis});
 }
});
test('automatic distance follows points, is signed along world axes, and stays out of command values',()=>{
 const t={...state,occurrences:[...state.occurrences,{id:'target',matrix:[[1,0,0,5],[0,1,0,32],[0,0,1,30],[0,0,0,1]]}]};
 const refs={target:moveReference({...s,occurrence:'target'},t)},o={id:'a/part',source_id:'part',definition:'part'};
 assert.equal(inferredMovementDistance(refs,t,o,false),'13');
 const directed={...refs,direction:worldAxisReference('X')};assert.equal(inferredMovementDistance(directed,t,o,false),'-5');assert.equal(inferredMovementDistance(directed,t,o,true),'5');
 assert.equal(inferredMovementDistance({...refs,direction:worldAxisReference('Y')},t,o,false),'12');
 assert.deepEqual(movementArgs('reference',o,directed,{distance:''},false).values,{},'An auto-filled display must not freeze native inference');
 assert.equal(inferredMovementDistance({direction:worldAxisReference('Z')},t,o,false),'');
});
test('native midpoint points stay points during reference inference and define edges during rotation',()=>{
 const curve={...edge,type:'CIRCLE',midpoint:[2,9,4]},selection={...s,vertex:{edge:curve,point:curve.midpoint,anchor:'mid'}};
 assert.deepEqual(movePoint(moveReference(selection,state)).point,[2,9,4]);
 assert.deepEqual(movePoint({...moveReference({...s,edge:curve},state),anchor:'mid'}).point,[2,9,4]);
 assert.equal(inferMovePick('reference',s.occurrence,selection),'origin');assert.equal(inferMovePick('reference','other',selection),'target');
 assert.equal(inferMovePick('rotate',s.occurrence,selection),'direction');
});

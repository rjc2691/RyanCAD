import numpy as np
import pytest
from ryancad.commands import reduce,create_instance
from ryancad.model import Actor,Document
from ryancad.parameters import evaluate
from ryancad.placements import flatten_instances
from ryancad.geometry import Evaluator
from ryancad.errors import CadError
from ryancad.service import validate_document

def edit(d,command,**args):
    r=reduce(d,Actor(),command,args)[0];validate_document(d);return r
def rows(d):return {o['id']:o for o in flatten_instances(d,evaluate(d))}
def scene():
    d=Document();parts=[edit(d,'operation.create',profile='rectangle',name=f'Part {i}',values={'width':10,'height':8,'distance':4,'origin_x':i*20}) for i in range(3)]
    return d,parts

def test_grouping_preserves_placement_parameters_world_shapes_and_guarded_references():
    d,p=scene();k=Evaluator();g=k.evaluate(d.model_dump(mode='json'))['components'][p[0]['component_id']]
    face=next(f for f in g['faces'] if f['normal'][2]>.99)
    edit(d,'operation.create',target=p[0]['component_id'],target_occurrence=p[0]['instance_id'],profile='face',origin='reference',reference={'component':p[0]['component_id'],'occurrence':p[0]['instance_id'],'face':face['signature']},profile_reference={'component':p[0]['component_id'],'occurrence':p[0]['instance_id'],'face':face['signature']},result='add',values={'distance':2})
    before=k.evaluate(d.model_dump(mode='json'));placement=dict(d.instances[p[0]['instance_id']].placement)
    r=edit(d,'group.create',name='Pair',occurrences=[a['instance_id'] for a in p[:2]])
    assert d.instances[p[0]['instance_id']].placement==placement
    after=k.evaluate(d.model_dump(mode='json'))
    assert after['components'][p[0]['component_id']]['volume']==pytest.approx(before['components'][p[0]['component_id']]['volume'])
    f=d.features[d.feature_order[-1]];assert f.references['target_occurrence']==r['occurrence_id']+'/'+p[0]['instance_id']
    assert f.references['reference']['occurrence']==f.references['target_occurrence']
    assert len([o for o in rows(d).values() if o['kind']!='assembly'])==3
    edit(d,'group.reparent',occurrence=r['occurrence_id']+'/'+p[0]['instance_id'],parent='')
    assert f.references['target_occurrence']==p[0]['instance_id']
    assert f.references['reference']['occurrence']==p[0]['instance_id']
    rebuilt=k.evaluate(d.model_dump(mode='json'))
    assert rebuilt['components'][p[0]['component_id']]['volume']==pytest.approx(before['components'][p[0]['component_id']]['volume'])

def test_move_rotated_group_add_and_ungroup_keep_every_child_world_transform():
    d,p=scene();g=edit(d,'group.create',occurrences=[a['instance_id'] for a in p[:2]])
    edit(d,'instance.transform',id=g['instance_id'],x=12,y=5,z=3,rx=90,ry=20,rz=-40)
    before=rows(d);outside=before[p[2]['instance_id']]['matrix']
    edit(d,'group.add',group=g['occurrence_id'],occurrences=[p[2]['instance_id']])
    inside=rows(d)[g['occurrence_id']+'/'+p[2]['instance_id']]['matrix'];np.testing.assert_allclose(inside,outside,atol=1e-9)
    before=rows(d);r=edit(d,'group.ungroup',occurrence=g['occurrence_id']);after=rows(d)
    for old,new in r['occurrence_map'].items():np.testing.assert_allclose(after[new]['matrix'],before[old]['matrix'],atol=1e-9)

def test_nested_group_copy_has_independent_structure_and_placement_but_linked_part_geometry():
    d,p=scene();g=edit(d,'group.create',occurrences=[a['instance_id'] for a in p[:2]])
    outer=edit(d,'group.create',occurrences=[g['occurrence_id'],p[2]['instance_id']])
    copy=edit(d,'group.copy',occurrence=outer['occurrence_id'],offset=[30,0,0]);r=rows(d)
    a=[o for o in r.values() if o['kind']!='assembly' and o['id'].startswith(outer['occurrence_id']+'/')]
    b=[o for o in r.values() if o['kind']!='assembly' and o['id'].startswith(copy['occurrence_id']+'/')]
    assert {o['definition'] for o in a}=={o['definition'] for o in b}
    assert {o['source_id'] for o in a}.isdisjoint(o['source_id'] for o in b)
    for old in a:
        new=next(o for o in b if o['definition']==old['definition']);np.testing.assert_allclose(np.array(new['matrix'])[:3,3],np.array(old['matrix'])[:3,3]+[30,0,0])
    child=a[0];edit(d,'instance.transform',id=child['source_id'],x=7)
    after=rows(d)
    for old in b:np.testing.assert_allclose(after[old['id']]['matrix'],old['matrix'])

def test_group_movement_can_pick_an_origin_on_a_descendant_body():
    d,p=scene();g=edit(d,'group.create',occurrences=[a['instance_id'] for a in p[:2]])
    edit(d,'instance.move',id=g['instance_id'],occurrence=g['occurrence_id'],method='reference',origin={'occurrence':g['occurrence_id']+'/'+p[0]['instance_id'],'point':[0,0,0]},target={'occurrence':p[2]['instance_id'],'point':[10,0,0]})
    assert rows(d)[g['occurrence_id']]['matrix'][0][3]==pytest.approx(10)
    assert rows(d)[p[2]['instance_id']]['matrix'][0][3]==pytest.approx(0)

def test_members_must_be_siblings_and_shared_structure_is_not_silently_reorganized():
    d,p=scene();g=edit(d,'group.create',occurrences=[a['instance_id'] for a in p[:2]])
    with pytest.raises(CadError,match='same group level'):edit(d,'group.create',occurrences=[g['occurrence_id']+'/'+p[0]['instance_id'],p[2]['instance_id']])
    create_instance(d,Actor(),g['component_id'])
    with pytest.raises(CadError,match='shared placement'):edit(d,'group.create',occurrences=[g['occurrence_id']+'/'+p[0]['instance_id']])

def test_reparent_between_rotated_groups_and_root_preserves_world_pose_and_references():
    d,p=scene();left=edit(d,'group.create',occurrences=[p[0]['instance_id'],p[1]['instance_id']])
    right=edit(d,'group.insert',kind='assembly')
    edit(d,'instance.transform',id=left['instance_id'],x=12,y=-8,z=3,rx=15,ry=-40,rz=20)
    edit(d,'instance.transform',id=right['instance_id'],x=-9,y=13,z=17,rx=40,ry=10,rz=-35)
    old=left['occurrence_id']+'/'+p[0]['instance_id'];before=rows(d)[old]['matrix']
    feature=d.features[d.feature_order[0]]
    feature.references['external_occurrence']=old
    feature.references['nested']={'occurrence':old}
    moved=edit(d,'group.reparent',occurrence=old,parent=right['occurrence_id'])
    np.testing.assert_allclose(rows(d)[moved['occurrence_id']]['matrix'],before,atol=1e-9)
    assert feature.references['external_occurrence']==moved['occurrence_id']
    assert feature.references['nested']['occurrence']==moved['occurrence_id']
    root=edit(d,'group.reparent',occurrence=moved['occurrence_id'],parent='')
    assert root['occurrence_id']==p[0]['instance_id']
    np.testing.assert_allclose(rows(d)[root['occurrence_id']]['matrix'],before,atol=1e-9)

def test_reparent_entire_subtree_preserves_all_descendant_world_poses():
    d,p=scene();inner=edit(d,'group.create',occurrences=[p[0]['instance_id']])
    outer=edit(d,'group.create',occurrences=[inner['occurrence_id'],p[1]['instance_id']])
    target=edit(d,'group.insert',kind='assembly')
    edit(d,'instance.transform',id=target['instance_id'],x=30,rz=78)
    before=rows(d);moved=edit(d,'group.reparent',occurrence=outer['occurrence_id'],parent=target['occurrence_id'])
    after=rows(d)
    for old,row in before.items():
        if old==outer['occurrence_id'] or old.startswith(outer['occurrence_id']+'/'):
            new=moved['occurrence_id']+old[len(outer['occurrence_id']):]
            np.testing.assert_allclose(after[new]['matrix'],row['matrix'],atol=1e-9)

def test_tree_insert_creates_empty_parts_and_groups_in_the_requested_container():
    d=Document();g=edit(d,'group.insert',kind='assembly')
    part=edit(d,'group.insert',kind='solid',parent=g['occurrence_id'])
    nested=edit(d,'group.insert',kind='assembly',parent=g['occurrence_id'])
    assert rows(d)[part['occurrence_id']]['parent']==g['component_id']
    assert rows(d)[nested['occurrence_id']]['parent']==g['component_id']
    assert d.components[part['component_id']].feature_ids==[]
    assert d.components[nested['component_id']].name!=d.components[g['component_id']].name
    Evaluator().evaluate(d.model_dump(mode='json'))

def test_tree_reparent_rejects_cycles_shared_destinations_and_noop_without_mutation():
    d,p=scene();g=edit(d,'group.create',occurrences=[p[0]['instance_id']])
    child=edit(d,'group.insert',kind='assembly',parent=g['occurrence_id'])
    before=d.model_dump(mode='json')
    with pytest.raises(CadError,match='descendants'):edit(d,'group.reparent',occurrence=g['occurrence_id'],parent=child['occurrence_id'])
    with pytest.raises(CadError,match='already belongs'):edit(d,'group.reparent',occurrence=g['occurrence_id'],parent='')
    assert d.model_dump(mode='json')==before
    create_instance(d,Actor(),g['component_id'])
    with pytest.raises(CadError,match='shared placement'):edit(d,'group.reparent',occurrence=p[1]['instance_id'],parent=g['occurrence_id'])

def test_wrapping_component_replaces_its_sibling_position_in_tree():
    d,p=scene();g=edit(d,'group.create',name='Part 1 group',occurrences=[p[1]['instance_id']])
    assert [o['id'] for o in rows(d).values() if '/' not in o['id']]==[p[0]['instance_id'],g['occurrence_id'],p[2]['instance_id']]

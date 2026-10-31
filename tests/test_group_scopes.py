import pytest
from ryancad.commands import reduce
from ryancad.errors import CadError
from ryancad.model import Document,Actor
from ryancad.project_structure import normalize_structure,validate_structure
from ryancad.placements import flatten_instances
from ryancad.parameters import evaluate


def command(doc,operation,**args):
    result=reduce(doc,Actor(),operation,args)[0]
    normalize_structure(doc,Actor());validate_structure(doc)
    return result


def test_part_groups_contain_components_layout_groups_contain_parts_and_cannot_cross():
    d=Document();command(d,'structure.enable')
    part=command(d,'part.create',name='Plate')['component_id']
    group=command(d,'partgroup.create',parent=part)['component_id']
    component=command(d,'part.component.create',part=group)['component_id']
    assert d.components[group].group_kind=='part'
    assert any(i.parent==group and i.definition==component for i in d.instances.values())
    layout_group=command(d,'layoutgroup.create',parent=d.active_layout)['component_id']
    command(d,'part.insert',part=part,parent=layout_group)
    assert d.components[layout_group].group_kind=='layout'
    with pytest.raises(CadError):command(d,'part.component.create',part=layout_group)
    with pytest.raises(CadError):command(d,'partgroup.create',parent=d.active_layout)
    with pytest.raises(CadError):command(d,'layoutgroup.create',parent=part)
    instance=next(i for i in d.instances.values() if i.definition==group)
    instance.parent=layout_group
    with pytest.raises(CadError,match='Layout groups stay'):validate_structure(d)


def test_group_tool_in_part_creates_part_group_not_new_part():
    d=Document();command(d,'structure.enable')
    part=command(d,'part.create',name='Housing')['component_id']
    command(d,'part.component.create',part=part,name='Body')
    rows=flatten_instances(d,evaluate(d))
    members=[o['id'] for o in rows if o['parent']==part]
    result=command(d,'group.create',name='Internal pieces',occurrences=members)
    group=d.components[result['component_id']]
    assert group.structure_role=='group' and group.group_kind=='part'
    assert len([c for c in d.components.values() if c.structure_role=='part'])==1


def test_layout_group_movement_and_part_group_membership_only():
    d=Document();command(d,'structure.enable')
    layout=command(d,'layoutgroup.create',parent=d.active_layout)
    rows=flatten_instances(d,evaluate(d));row=next(o for o in rows if o['definition']==layout['component_id'])
    result=command(d,'instance.move',id=row['source_id'],occurrence=row['id'],method='axes',values={'x':12})
    moved=next(o for o in flatten_instances(d,evaluate(d)) if o['definition']==layout['component_id'])
    assert moved['matrix'][0][3]==pytest.approx(12)
    part=command(d,'part.create',name='Body')['component_id']
    group=command(d,'partgroup.create',parent=part)['component_id']
    row=next(o for o in flatten_instances(d,evaluate(d)) if o['definition']==group)
    with pytest.raises(CadError,match='organize membership'):
        command(d,'instance.move',id=row['source_id'],occurrence=row['id'],method='axes',values={'x':12})


def test_layout_group_create_and_add_preserve_part_definitions_and_world_placements():
    import numpy as np
    d=Document();command(d,'structure.enable')
    parts=[command(d,'part.create',name=name)['component_id'] for name in ['Plate','Insert','Lid']]
    placements=[command(d,'part.insert',part=p)['instance_id'] for p in parts]
    rows=flatten_instances(d,evaluate(d))
    chosen=[next(o for o in rows if o['source_id']==i) for i in placements]
    group=command(d,'group.create',name='Mold pieces',occurrences=[o['id'] for o in chosen[:2]])
    definition=d.components[group['component_id']]
    assert definition.structure_role=='group' and definition.group_kind=='layout'
    command(d,'instance.move',id=group['instance_id'],occurrence=group['occurrence_id'],method='axes',values={'x':14,'y':7,'rz':30})
    outside=next(o for o in flatten_instances(d,evaluate(d)) if o['source_id']==placements[2])
    command(d,'group.add',group=group['occurrence_id'],occurrences=[outside['id']])
    after=flatten_instances(d,evaluate(d))
    inside=next(o for o in after if o['source_id']==placements[2] and o['layout']==d.active_layout)
    np.testing.assert_allclose(inside['matrix'],outside['matrix'],atol=1e-9)
    assert inside['parent']==definition.id
    assert [d.components[p].name for p in parts]==['Plate','Insert','Lid']
    assert len([o for o in after if o['parent']==definition.id])==3


def test_nested_layout_group_from_group_tool_keeps_layout_scope():
    d=Document();command(d,'structure.enable')
    part=command(d,'part.create',name='Plate')['component_id']
    outer=command(d,'layoutgroup.create',parent=d.active_layout)
    placed=command(d,'part.insert',part=part,parent=outer['component_id'])
    row=next(o for o in flatten_instances(d,evaluate(d)) if o['source_id']==placed['instance_id'] and o['layout']==d.active_layout)
    inner=command(d,'group.create',name='Nested arrangement',occurrences=[row['id']])
    assert d.components[inner['component_id']].group_kind=='layout'

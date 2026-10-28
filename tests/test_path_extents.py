"""Distance/percent path extents preserve native length, parameters and legacy recipes."""
import math
import pytest
from build123d import Edge, Vector, Wire, PositionMode
from ryancad.errors import CadError
from ryancad.geometry import Evaluator
from ryancad.model import Document
from ryancad.operation_selection import trim_path_distance, connected_path, reverse_path
from test_operations import edit, evaluate, plate


def test_linear_percentage_is_parameter_backed_and_tracks_reference_length():
    k=Evaluator();doc,part,out,_=plate(k)
    edge=next(e for e in out['edges'] if abs(e['tangent'][2])>.99)
    ref={'component':part['component_id'],'occurrence':part['instance_id'],'edge':edge['signature'],'anchor':'start'}
    tool=edit(doc,profile='circle',motion='linear',direction='edge',path_reference=ref,path_extent='percent',values={'diameter':2,'path_percent':50})
    feature=doc.features[tool['feature_id']]
    assert feature.options['recipe_version']==3
    assert 'distance' not in feature.parameters
    assert doc.parameters[feature.parameters['path_percent']].kind=='ratio'
    assert evaluate(k,doc)['components'][tool['component_id']]['volume']==pytest.approx(math.pi*3)
    doc.parameters[doc.features[part['feature_id']].parameters['distance']].expression='10'
    assert evaluate(k,doc)['components'][tool['component_id']]['volume']==pytest.approx(math.pi*5)
    doc.parameters[feature.parameters['path_percent']].expression='-25'
    assert evaluate(k,doc)['components'][tool['component_id']]['volume']==pytest.approx(math.pi*2.5)


@pytest.mark.parametrize('mode,values,length', [('distance',{'distance':2},2),('percent',{'path_percent':50},3),('full',{},6)])
def test_sweep_extent_changes_native_volume_and_retains_legacy_full_path(mode,values,length):
    k=Evaluator();doc,part,out,_=plate(k)
    edge=next(e for e in out['edges'] if abs(e['tangent'][2])>.99)
    ref={'component':part['component_id'],'occurrence':part['instance_id'],'edge':edge['signature'],'anchor':'start'}
    tool=edit(doc,profile='circle',motion='sweep',origin='reference',reference=ref,direction='edge',plane='perpendicular',path_reference=ref,path_extent=mode,values={'diameter':2,**values})
    assert evaluate(k,doc)['components'][tool['component_id']]['volume']==pytest.approx(math.pi*length)
    if mode=='full':
        feature=doc.features[tool['feature_id']];feature.options.pop('path_extent');feature.options['recipe_version']=1
        assert evaluate(k,Document.model_validate(doc.model_dump()))['components'][tool['component_id']]['volume']==pytest.approx(math.pi*6)


def test_path_trim_crosses_chain_joints_and_respects_reverse_direction():
    path=connected_path([Edge.make_line((0,0,0),(10,0,0)),Edge.make_line((10,0,0),(10,20,0))])
    trimmed=trim_path_distance(path,15)
    assert trimmed.length==pytest.approx(15)
    assert (trimmed.position_at(1)-Vector(10,5,0)).length<1e-6
    reversed_trim=trim_path_distance(reverse_path(path),7)
    assert reversed_trim.length==pytest.approx(7)
    assert (reversed_trim.position_at(0)-Vector(10,20,0)).length<1e-6
    assert (reversed_trim.position_at(1)-Vector(10,13,0)).length<1e-6


def test_curved_trim_uses_arc_length_not_chord_or_curve_parameter():
    from build123d import Plane
    edge=Edge.make_ellipse(20,5,Plane.XY,0,180)
    distance=edge.length*.37
    trimmed=trim_path_distance(edge,distance)
    assert trimmed.length==pytest.approx(distance,rel=1e-7)
    assert (trimmed.position_at(1)-edge.position_at(distance,PositionMode.LENGTH)).length<1e-6


def test_partial_curved_sweep_is_a_native_solid():
    k=Evaluator();doc=Document();part=edit(doc,profile='circle',values={'diameter':20,'distance':2})
    out=evaluate(k,doc)['components'][part['component_id']];edge=next(e for e in out['edges'] if e['type']=='CIRCLE')
    ref={'component':part['component_id'],'occurrence':part['instance_id'],'edge':edge['signature'],'anchor':'start'}
    tool=edit(doc,profile='circle',motion='sweep',origin='reference',reference=ref,direction='edge',plane='perpendicular',path_reference=ref,path_extent='percent',values={'diameter':2,'path_percent':25})
    volume=evaluate(k,doc)['components'][tool['component_id']]['volume']
    assert volume==pytest.approx(math.pi*edge['length']/4,rel=1e-4)


@pytest.mark.parametrize('mode,values', [('percent',{'path_percent':0}),('percent',{'path_percent':101}),('percent',{'path_percent':-20}),('distance',{'distance':7}),('distance',{'distance':0})])
def test_invalid_sweep_extents_fail_instead_of_clamping_or_silently_using_full_path(mode,values):
    k=Evaluator();doc,part,out,_=plate(k);edge=next(e for e in out['edges'] if abs(e['tangent'][2])>.99)
    ref={'component':part['component_id'],'edge':edge['signature'],'anchor':'start'}
    edit(doc,profile='circle',motion='sweep',origin='reference',reference=ref,direction='edge',plane='perpendicular',path_reference=ref,path_extent=mode,values=values)
    with pytest.raises(CadError) as exc:evaluate(k,doc)
    assert exc.value.code=='invalid_extent'


def test_percentage_requires_finite_path_and_native_finishes_remain_explicitly_full_edge():
    with pytest.raises(CadError) as exc:edit(Document(),path_extent='percent',values={'path_percent':50})
    assert exc.value.code=='missing_path'
    k=Evaluator();doc,part,out,_=plate(k);ref={'component':part['component_id'],'edge':out['edges'][0]['signature']}
    with pytest.raises(CadError) as exc:edit(doc,target=part['component_id'],profile='fillet',path_reference=ref,path_extent='percent',values={'path_percent':50})
    assert exc.value.code=='unsupported_extent'

def test_native_entity_labels_are_unique_and_scoped_to_current_component_geometry():
    k=Evaluator();doc,part,out,_=plate(k)
    for key,prefix in [('faces','Face'),('edges','Edge'),('vertex_info','Vertex')]:
        entities=out[key]
        assert len({e['id'] for e in entities})==len(entities)
        assert [e['name'] for e in entities]==[f'{prefix} {i+1}' for i in range(len(entities))]
    assert [v['point'] for v in out['vertex_info']]==out['vertices']

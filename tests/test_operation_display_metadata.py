"""Tool profile overlays use native contours, never tessellation triangle boundaries."""
import pytest
from ryancad.geometry import Evaluator
from test_operations import plate, edit, evaluate


def test_planar_face_outlines_have_closed_ordered_corners_and_holes():
    kernel=Evaluator()
    doc,part,out,ref=plate(kernel)
    top=next(f for f in out['faces'] if f['normal'][2]>.99)
    loop=top['outlines'][0]
    assert loop[0]==pytest.approx(loop[-1])
    assert len(loop)==5
    assert {tuple(p[:2]) for p in loop}=={(-20,-15),(20,-15),(20,15),(-20,15)}
    edit(doc,target=part['component_id'],target_occurrence=part['instance_id'],profile='circle',result='cut',origin='reference',reference=ref,profile_reference=ref,plane='face',extent='through',values={'diameter':5})
    out=evaluate(kernel,doc)['components'][part['component_id']]
    top=next(f for f in out['faces'] if f['normal'][2]>.99)
    assert len(top['outlines'])==2
    for loop in top['outlines']:
        assert loop[0]==pytest.approx(loop[-1])
        assert all(p[2]==pytest.approx(6) for p in loop)
    assert any(len(loop)>12 for loop in top['outlines'])
    assert all('outlines' not in f for f in out['faces'] if f['type']!='PLANE')


def test_nominal_sketch_outlines_are_cached_and_change_with_dimensions():
    from ryancad.model import Document
    kernel=Evaluator();doc=Document()
    result=edit(doc,profile='rectangle',motion='none',values={'width':20,'height':10})
    first=evaluate(kernel,doc)['profiles'][result['feature_id']]
    assert first['status']=='closed'
    assert all(p[2]==pytest.approx(0) for p in first['outlines'][0])
    again=evaluate(kernel,doc)['profiles'][result['feature_id']]
    assert first is again
    pid=doc.features[result['feature_id']].parameters['width'];doc.parameters[pid].expression='30'
    changed=evaluate(kernel,doc)['profiles'][result['feature_id']]
    assert changed is not first
    assert max(p[0] for p in changed['outlines'][0])==pytest.approx(15)

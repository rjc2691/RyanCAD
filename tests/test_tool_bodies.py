import json
import pytest
from ryancad.commands import reduce
from ryancad.model import Actor,Document
from ryancad.geometry import Evaluator
from ryancad.service import CadService,validate_document
from ryancad.errors import CadError

def edit(d,command,**args):
    result=reduce(d,Actor(),command,args)[0];validate_document(d);return result

def fixture():
    d=Document()
    part=edit(d,'operation.create',name='Enclosure',profile='rectangle',values={'width':20,'height':12,'distance':5})
    tool=edit(d,'toolbody.create',name='Cutter')
    edit(d,'operation.create',target=tool['component_id'],target_occurrence=tool['instance_id'],name='Cutter stock',
         profile='rectangle',result='add',values={'width':4,'height':4,'distance':12})
    return d,part,tool

def test_tool_library_body_builds_and_drives_a_boolean_without_becoming_a_part(tmp_path):
    d,part,tool=fixture()
    edit(d,'operation.create',target=part['component_id'],target_occurrence=part['instance_id'],name='Tool cut',
         profile='body',motion='none',result='cut',keep_body_placement=False,
         profile_reference={'component':tool['component_id'],'occurrence':tool['instance_id']})
    evaluation=Evaluator().evaluate(d.model_dump(mode='json'))
    assert evaluation['components'][part['component_id']]['volume']==pytest.approx(1120)
    assert evaluation['components'][tool['component_id']]['volume']==pytest.approx(192)
    (tmp_path/'manifest.yaml').write_text(json.dumps(d.model_dump(mode='json')),encoding='utf-8')
    service=CadService(tmp_path)
    try:
        service.evaluation=evaluation
        summary=service.state()['summary']
        assert summary['instances']==1 and summary['definitions']==1
        assert summary['volume_mm3']==pytest.approx(1120)
        with pytest.raises(CadError,match='manufactured'):
            service._export({'expected_revision':0,'instance_ids':[tool['instance_id']]})
    finally:service.close()
    with pytest.raises(CadError,match='depend'):
        edit(d,'component.delete',id=tool['component_id'])

def test_tools_stay_flat_and_new_workbench_results_inherit_tool_purpose():
    d,_,tool=fixture()
    with pytest.raises(CadError,match='library'):
        edit(d,'group.create',occurrences=[tool['instance_id']])
    with pytest.raises(CadError,match='library'):
        edit(d,'group.reparent',occurrence=tool['instance_id'],parent='')
    with pytest.raises(CadError,match='workbench'):
        edit(d.model_copy(deep=True),'component.duplicate',id=tool['component_id'])
    made=edit(d,'operation.create',target=tool['component_id'],profile='circle',result='new',values={'diameter':6,'distance':8})
    assert d.components[made['component_id']].purpose=='tool'

def test_history_origin_is_empty_and_original_geometry_returns_after_inspection():
    d,part,tool=fixture();kernel=Evaluator()
    before=kernel.evaluate(d.model_dump(mode='json'))
    origin=kernel.evaluate(d.model_dump(mode='json'),rollback='origin')
    assert not origin['components'][part['component_id']].get('geometry_key')
    after=kernel.evaluate(d.model_dump(mode='json'))
    assert after['components'][part['component_id']]['volume']==before['components'][part['component_id']]['volume']
    assert after['components'][tool['component_id']]['volume']==before['components'][tool['component_id']]['volume']

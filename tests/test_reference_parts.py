import pytest
from ryancad.model import Actor,Document
from ryancad.commands import reduce
from ryancad.service import validate_document
from ryancad.geometry import Evaluator
from ryancad.project_structure import normalize_structure
from ryancad.errors import CadError


def edit(doc,command,**args):
    result=reduce(doc,Actor(),command,args)[0]
    normalize_structure(doc,Actor());validate_document(doc)
    return result


def fixture():
    source=Document(name='Hardware')
    edit(source,'structure.enable')
    part=edit(source,'part.primitive',shape='box',name='M5 spacer',values={'length':5,'width':5,'height':30})['component_id']
    target=Document(name='Assembly');edit(target,'structure.enable')
    imported=edit(target,'reference.import',sources=[{'document':source.model_dump(mode='json'),'part':part}])['parts'][0]
    return source,target,part,imported


def test_reference_snapshot_is_exact_persistent_and_customizable():
    source,target,original,imported=fixture()
    assert target.components[imported].reference_source['design_name']=='Hardware'
    body=next(i.definition for i in target.instances.values() if i.parent==imported)
    engine=Evaluator();assert engine.evaluate(target.model_dump(mode='json'))['components'][body]['volume']==pytest.approx(750)
    target=Document.model_validate_json(target.model_dump_json())
    custom=edit(target,'reference.customize',part=imported)['component_id']
    assert target.components[custom].name=='M5 spacer custom'
    assert not target.components[custom].read_only and not target.components[custom].reference_source
    custom_body=next(i.definition for i in target.instances.values() if i.parent==custom)
    feature=target.components[custom_body].feature_ids[0]
    edit(target,'feature.update',id=feature,values={'height':40})
    result=engine.evaluate(target.model_dump(mode='json'))['components']
    assert result[body]['volume']==pytest.approx(750)
    assert result[custom_body]['volume']==pytest.approx(1000)
    assert source.components[original].name=='M5 spacer'


@pytest.mark.parametrize('mode',['feature','parameter','structure','transform','delete'])
def test_reference_definition_cannot_be_mutated_through_other_commands(mode):
    _,target,_,part=fixture()
    instance=next(i for i in target.instances.values() if i.parent==part)
    feature=target.features[target.components[instance.definition].feature_ids[0]]
    commands={'feature':('feature.update',{'id':feature.id,'values':{'height':80}}),
              'parameter':('parameter.set',{'id':feature.parameters['height'],'value':80}),
              'structure':('part.component.create',{'part':part}),
              'transform':('instance.transform',{'id':instance.id,'x':10}),
              'delete':('component.delete',{'id':instance.definition})}
    name,args=commands[mode]
    with pytest.raises(CadError,match='[Rr]ead.only|Reference parts'):edit(target,name,**args)


def test_reference_placement_is_movable_without_changing_definition():
    _,target,_,part=fixture()
    placed=edit(target,'part.insert',part=part,parent=target.active_layout)['instance_id']
    edit(target,'instance.transform',id=placed,x=25)
    assert target.components[part].read_only

@pytest.mark.parametrize('recipe',['plate','mold'])
def test_public_seed_parts_import_individually(recipe):
    from ryancad.public_workspace import seed_document
    source=seed_document(recipe)
    for part in [c for c in source.components.values() if c.structure_role=='part']:
        target=Document();edit(target,'structure.enable')
        imported=edit(target,'reference.import',sources=[{'document':source.model_dump(mode='json'),'part':part.id}])['parts'][0]
        result=Evaluator().evaluate(target.model_dump(mode='json'))
        assert target.components[imported].read_only
        assert any(g['volume']>0 for g in result['components'].values() if g.get('volume') is not None)

@pytest.mark.parametrize('recipe',['plate','mold'])
def test_part_preview_contains_only_requested_definition_and_preserves_document(recipe):
    import base64,struct
    from ryancad.public_workspace import seed_document
    from ryancad.placements import flatten_instances
    source=seed_document(recipe);before=source.model_dump(mode='json');engine=Evaluator()
    part=next(c for c in source.components.values() if c.structure_role=='part')
    result=engine.reference_preview(before,part.id)
    assert result['placements'] and result['meshes']
    for data in result['meshes'].values():
        buffer=base64.b64decode(data);assert len(buffer)>20
        assert struct.unpack_from('<I',buffer,8)[0]>0
    assert source.model_dump(mode='json')==before
    assert set(result['meshes'])=={p['definition'] for p in result['placements']}
    assert len(result['placements'])==len([i for i in source.instances.values() if i.parent==part.id and source.components[i.definition].kind!='assembly'])

def test_reference_preview_keeps_nested_component_placements_and_excludes_other_parts():
    source=Document();edit(source,'structure.enable')
    outer=edit(source,'part.primitive',name='Fixture',shape='box',values={'length':20,'width':10,'height':5})['component_id']
    nested=edit(source,'part.primitive',name='Pin',shape='cylinder',values={'diameter':4,'height':15})['component_id']
    edit(source,'part.insert',part=nested,parent=outer,placement={'x':30,'ry':90})
    edit(source,'part.primitive',name='Unrelated',shape='box')
    before=source.model_dump(mode='json');report=Evaluator().reference_preview(before,outer)
    assert len(report['placements'])==2 and len(report['meshes'])==2
    assert any(abs(p['matrix'][0][3]-30)<1e-6 for p in report['placements'])
    assert source.model_dump(mode='json')==before

def test_design_preview_uses_only_active_layout_and_preserves_source():
    from ryancad.model import Document
    from ryancad.commands import reduce
    from ryancad.model import Actor
    from ryancad.project_structure import normalize_structure
    d=Document()
    def apply(name,args={}):
        result=reduce(d,Actor(),name,args)[0];normalize_structure(d,Actor());return result
    apply('structure.enable');first=d.active_layout
    made=apply('part.primitive',{'name':'Block','shape':'box','place':True})
    second=apply('layout.create',{'name':'Empty layout'})['component_id']
    before=d.model_dump(mode='json');report=Evaluator().design_preview(before)
    assert report['layout_id']==second and not report['placements'] and not report['meshes']
    assert d.model_dump(mode='json')==before
    apply('layout.select',{'id':first});before=d.model_dump(mode='json');report=Evaluator().design_preview(before)
    assert report['layout_id']==first and len(report['placements'])==1 and report['meshes']
    assert report['placements'][0]['definition']==d.features[made['primitive_feature_id']].owner
    assert d.model_dump(mode='json')==before

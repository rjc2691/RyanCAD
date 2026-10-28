import pytest
from ryancad.model import Document,Actor
from ryancad.commands import reduce
from ryancad.errors import CadError

def test_creation_uniquifies_names_and_rename_rejects_case_insensitive_duplicates():
 d=Document();a=Actor()
 first=reduce(d,a,'component.create',{'name':'Bracket'})[0]
 second=reduce(d,a,'component.create',{'name':'Bracket'})[0]
 assert d.components[second['component_id']].name=='Bracket 2'
 with pytest.raises(CadError,match='already in use'):
  reduce(d,a,'component.rename',{'id':second['component_id'],'name':' bracket '})
 assert d.components[first['component_id']].name=='Bracket'

def test_legacy_normalization_preserves_ids_and_makes_names_unique():
 d=Document();a=Actor()
 ids=[reduce(d,a,'component.create',{'name':'Box'})[0]['component_id'] for _ in range(3)]
 for i in ids:d.components[i].name='Box'
 result=reduce(d,a,'document.normalize_names',{})[0]
 assert result['renamed']==2
 assert [d.components[i].name for i in ids]==['Box','Box 2','Box 3']

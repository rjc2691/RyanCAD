import base64
import copy
import json
import hashlib

import pytest

from ryancad.errors import CadError
from ryancad.model import Actor, Command
from ryancad.service import CadService
from ryancad.workspaces import WorkspaceManager
from ryancad.workspace_folders import export_folder, import_folder


@pytest.fixture
def manager(tmp_path):
    manager = WorkspaceManager(tmp_path / "workspace")
    yield manager
    manager.close()


def test_folder_roundtrip_all_designs_history_exports_and_independence(manager):
    code = "a"*40
    manager.ensure(code)
    manager.rename_workspace(code, 'Tooling workshop')
    manager.claim(code, 'browser-owner-example')
    first = manager.describe(code)["active_design"]
    _, service = manager.service(code, first)
    service._command(Actor(), command=Command(name="document.describe",args={"description":"Keep this history"},expected_revision=0),signature="test")
    service._command(Actor(), command=Command(name="checkpoint.create",args={"name":"Before transfer"},expected_revision=service.document.revision),signature="checkpoint")
    root = service.store.directory / "exports" / "export_test"
    root.mkdir(parents=True)
    (root / "part.stl").write_bytes(b"example export")
    second = manager.create(code, "Other design")
    third = manager.create(code, "Deleted design")
    manager.delete(code, third)
    manager.select(code, second)
    snapshot = export_folder(manager, code)
    assert snapshot["design_count"] == 3
    assert all(not f["path"].endswith('.zip') for f in snapshot['files'])
    index = json.loads(base64.b64decode(next(f['data'] for f in snapshot['files'] if f['path']=='workspace.json')))
    assert 'recovery_code' not in index
    assert 'browser_owners' not in index and index['name']=='Tooling workshop'
    restored = import_folder(manager, snapshot)
    assert restored['workspace_code'] != code
    info = manager.describe(restored['workspace_code'])
    assert info['name']=='Tooling workshop'
    assert info['active_design'] == second
    assert {d['name'] for d in info['designs']} == {'Untitled design','Other design','Deleted design'}
    assert next(d for d in info['designs'] if d['id']==third)['deleted']
    _, current = manager.service(restored['workspace_code'], first)
    assert current.document.notes == 'Keep this history'
    assert current.state()['actions']
    assert current.store.stacks() == service.store.stacks()
    assert current.store.checkpoints() == service.store.checkpoints()
    assert (current.store.directory/'exports'/'export_test'/'part.stl').read_bytes()==b'example export'
    assert manager.describe(code)['active_design']==second


@pytest.mark.parametrize('corruption',['missing','modified','traversal','duplicate','journal'])
def test_bad_folder_never_changes_existing_workspace(manager, corruption):
    code='b'*40;manager.ensure(code)
    payload=copy.deepcopy(export_folder(manager,code))
    if corruption=='missing':payload['files'].pop(0)
    if corruption=='modified':payload['files'][0]['data']=base64.b64encode(b'changed').decode()
    if corruption=='traversal':payload['files'][0]['path']='../other/file'
    if corruption=='duplicate':payload['files'].append(payload['files'][0])
    if corruption=='journal':
        journal=next(f for f in payload['files'] if f['path'].endswith('journal.sqlite3'))
        journal['data']=base64.b64encode(b'not a database').decode()
        index=next(f for f in payload['files'] if f['path']=='workspace.json')
        metadata=json.loads(base64.b64decode(index['data']))
        next(f for f in metadata['files'] if f['path']==journal['path'])['sha256']=hashlib.sha256(b'not a database').hexdigest()
        index['data']=base64.b64encode(json.dumps(metadata).encode()).decode()
    before=manager.describe(code)
    directories=set(manager.root.iterdir())
    with pytest.raises(CadError):import_folder(manager,payload)
    assert manager.describe(code)==before
    assert set(manager.root.iterdir())==directories


def test_folder_api_roundtrip_uses_current_browser_workspace_and_recovery(tmp_path):
    from fastapi.testclient import TestClient
    from ryancad.api import create_app
    app=create_app(tmp_path/'api.rycad','test-token',testing=True)
    with TestClient(app) as client:
        client.get('/')
        original=client.get('/api/workspace').json()
        client.post('/api/workspace/designs',json={'name':'Second design'}).raise_for_status()
        snapshot=client.get('/api/workspace/folder/export')
        snapshot.raise_for_status()
        assert snapshot.json()['design_count']==2
        imported=client.post('/api/workspace/folder/import',json=snapshot.json())
        imported.raise_for_status()
        result=imported.json()
        # Import stages a new workspace; switching is explicit after validation.
        assert client.get('/api/workspace').json()['workspace_code']==original['workspace_code']
        client.post('/api/workspace/recover',json={'code':result['workspace_code']}).raise_for_status()
        restored=client.get('/api/workspace').json()
        assert len(restored['designs'])==2 and restored['active_design']==result['design_id']
        assert restored['workspace_code']!=original['workspace_code']

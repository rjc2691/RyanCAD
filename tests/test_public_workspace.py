from pathlib import Path
from fastapi.testclient import TestClient
from ryancad.api import create_app
from ryancad.public_workspace import PUBLIC_WORKSPACE_CODE,PUBLIC_DESIGNS
from ryancad.storage import ProjectStore
from ryancad.workspaces import WorkspaceManager


def test_fresh_install_has_one_persistent_public_workspace_for_every_browser(tmp_path):
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        assert client.app.state.workspaces.exists(PUBLIC_WORKSPACE_CODE)
        for _ in range(2):
            client.cookies.clear();client.get('/')
            personal=client.get('/api/workspace').json()
            assert personal['workspace_code']!=PUBLIC_WORKSPACE_CODE
            public=[w for w in client.get('/api/workspaces').json()['workspaces'] if w['public']]
            assert len(public)==1 and public[0]['code']==PUBLIC_WORKSPACE_CODE
            assert public[0]['design_count']==2
            groups=client.get('/api/design-library').json()['workspaces']
            assert sum(g['source']=='public' for g in groups)==1
            assert groups[-1]['id']==PUBLIC_WORKSPACE_CODE
            assert {d['id'] for d in groups[-1]['designs']}==set(PUBLIC_DESIGNS.values())
            assert all(d['id'].startswith('design_') for d in groups[-1]['designs'])
            assert client.post('/api/design-library/preview',json={'workspace':'builtin','design':'plate'}).status_code==400
            assert 'recipe.load' not in client.get('/api/capabilities').json()['commands']
        root=client.app.state.workspaces.root
        assert len(list(root.glob('*/workspace.json')))==3  # two personal, one shared


def test_public_initialization_never_replaces_existing_native_files_or_edits(tmp_path):
    project=tmp_path/'server';manager=WorkspaceManager(project)
    directory=manager._directory(PUBLIC_WORKSPACE_CODE)
    identifier=PUBLIC_DESIGNS['plate']
    store=ProjectStore(directory/identifier)
    try:
        document=store.load();identity=document.id
        document.name='Edited mounting plate';document.revision=1
        store.commit(document,None,'test-edit','test-edit',{},[],[])
    finally:store.close()
    manager.close()
    manager=WorkspaceManager(project)
    try:
        designs=manager.describe(PUBLIC_WORKSPACE_CODE)['designs']
        assert len(designs)==2 and next(d for d in designs if d['id']==identifier)['name']=='Edited mounting plate'
        store=ProjectStore(directory/identifier)
        try:assert store.load().id==identity and store.load().revision==1
        finally:store.close()
        assert len(list(directory.glob('design_*')))==2
    finally:manager.close()

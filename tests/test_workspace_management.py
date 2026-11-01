from ryancad.public_workspace import PUBLIC_WORKSPACE_CODE,PUBLIC_WORKSPACE_NAME
import copy

def restore_cookies(client,cookies):
    client.cookies.clear()
    for cookie in cookies:client.cookies.jar.set_cookie(copy.copy(cookie))

from fastapi.testclient import TestClient
from ryancad.api import create_app


def test_browser_workspace_lists_names_admin_unlock_and_restart(tmp_path):
    project=tmp_path/'server'
    with TestClient(create_app(project,'test',testing=True)) as client:
        client.get('/')
        first=client.get('/api/workspace').json()
        client.post('/api/workspace/rename',json={'name':'Casting workshop'}).raise_for_status()
        client.post('/api/workspace/new',json={'name':'Fixtures'}).raise_for_status()
        second=client.get('/api/workspace').json()
        owned=client.get('/api/workspaces').json()
        assert not owned['admin']
        assert {w['name'] for w in owned['workspaces']}=={'Casting workshop','Fixtures',PUBLIC_WORKSPACE_NAME}
        first_cookies=[copy.copy(cookie) for cookie in client.cookies.jar]
        client.cookies.clear();client.get('/')
        foreign=client.get('/api/workspace').json()
        assert len(client.get('/api/workspaces').json()['workspaces'])==2
        restore_cookies(client,first_cookies)
        assert len(client.get('/api/workspaces').json()['workspaces'])==3
        assert client.post('/api/workspaces/admin',json={'password':'wrong'}).json()['error']['code']=='incorrect_password'
        assert not client.get('/api/workspaces').json()['admin']
        client.post('/api/workspaces/admin',json={'password':'ryan'}).raise_for_status()
        all_workspaces=client.get('/api/workspaces').json()
        assert all_workspaces['admin'] and len(all_workspaces['workspaces'])==4
        assert foreign['workspace_code'] in {w['code'] for w in all_workspaces['workspaces']}
        client.post('/api/workspaces/admin/lock').raise_for_status()
        assert len(client.get('/api/workspaces').json()['workspaces'])==3
        client.post('/api/workspace/recover',json={'code':first['workspace_code']}).raise_for_status()
        assert client.get('/api/workspace').json()['name']=='Casting workshop'
        cookies=[copy.copy(cookie) for cookie in client.cookies.jar]
    with TestClient(create_app(project,'test',testing=True)) as client:
        restore_cookies(client,cookies);client.get('/')
        assert client.get('/api/workspace').json()['name']=='Casting workshop'
        assert {w['code'] for w in client.get('/api/workspaces').json()['workspaces']}=={first['workspace_code'],second['workspace_code'],PUBLIC_WORKSPACE_CODE}


def test_bad_workspace_name_does_not_create_orphan(tmp_path):
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        client.get('/')
        before=client.get('/api/workspaces').json()
        assert 'error' in client.post('/api/workspace/new',json={'name':42}).json()
        assert client.get('/api/workspaces').json()==before


def test_workspace_design_cannot_drop_its_last_layout_by_native_replacement(tmp_path):
    from ryancad.model import Document
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        client.get('/')
        response=client.post('/api/commands',json={'name':'document.replace','args':{'document':Document().model_dump(mode='json')},'expected_revision':0}).json()
        import time
        for _ in range(100):
            job=client.get('/api/jobs/'+response['job_id']).json()
            if job['status'] in {'complete','failed'}:break
            time.sleep(.02)
        assert job['status']=='failed' and job['error']['code']=='invalid_structure'
        assert client.get('/api/state').json()['document']['active_layout']


def test_admin_delete_is_confirmable_recoverable_and_dates_are_present(tmp_path):
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        client.get('/')
        first=client.get('/api/workspace').json()['workspace_code']
        listed=client.get('/api/workspaces').json()['workspaces'][0]
        from datetime import datetime
        assert datetime.fromisoformat(listed['changed_at'])>=datetime.fromisoformat(listed['created_at'])
        assert client.post('/api/workspaces/delete',json={'code':first}).status_code==400
        client.post('/api/workspace/new',json={'name':'Second'}).raise_for_status()
        second=client.get('/api/workspace').json()['workspace_code']
        client.post('/api/workspaces/admin',json={'password':'ryan'}).raise_for_status()
        manager=client.app.state.workspaces
        identifier,_=manager.acquire(first)
        try:
            refused=client.post('/api/workspaces/delete',json={'code':first})
            assert refused.json()['error']['code']=='workspace_busy'
            assert manager.exists(first)
        finally:manager.release(first,identifier)
        client.post('/api/workspaces/delete',json={'code':first}).raise_for_status()
        assert not client.app.state.workspaces.exists(first)
        assert list((client.app.state.workspaces.root/'deleted-workspaces').glob('*/workspace.json'))
        assert {w['code'] for w in client.get('/api/workspaces').json()['workspaces']}=={second,PUBLIC_WORKSPACE_CODE}
        assert client.post('/api/workspaces/delete',json={'code':'../escape'}).status_code==400
        result=client.post('/api/workspaces/delete',json={'code':second}).json()
        assert result['reload']
        assert client.get('/api/workspace').json()['workspace_code'] not in {first,second}


def test_rename_listed_workspace_without_switching_and_admin_scope(tmp_path):
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        client.get('/');first=client.get('/api/workspace').json()['workspace_code']
        client.post('/api/workspace/new',json={'name':'Second'}).raise_for_status()
        second=client.get('/api/workspace').json()['workspace_code']
        client.post('/api/workspaces/rename',json={'code':first,'name':'Renamed first'}).raise_for_status()
        assert client.get('/api/workspace').json()['workspace_code']==second
        assert next(w for w in client.get('/api/workspaces').json()['workspaces'] if w['code']==first)['name']=='Renamed first'
        assert client.post('/api/workspaces/rename',json={'code':second,'name':'   '}).status_code==400
        assert client.get('/api/workspace').json()['name']=='Second'
        client.cookies.clear();client.get('/');foreign=client.get('/api/workspace').json()['workspace_code']
        assert client.post('/api/workspaces/rename',json={'code':second,'name':'Not allowed'}).status_code==400
        client.post('/api/workspaces/admin',json={'password':'ryan'}).raise_for_status()
        client.post('/api/workspaces/rename',json={'code':second,'name':'Admin renamed'}).raise_for_status()
        assert client.get('/api/workspace').json()['workspace_code']==foreign
        assert next(w for w in client.get('/api/workspaces').json()['workspaces'] if w['code']==second)['name']=='Admin renamed'

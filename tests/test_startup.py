from ryancad.public_workspace import PUBLIC_WORKSPACE_CODE
import copy
import time
import pytest
from fastapi.testclient import TestClient
from ryancad.api import create_app


def finish(client,result,design):
    if 'job_id' not in result:return result
    for _ in range(3000):
        job=client.get('/api/jobs/'+result['job_id'],headers={'X-RyanCAD-Design':design}).json()
        if job['status'] in {'complete','failed','cancelled'}:
            assert job['status']=='complete',job
            return job['result']
        time.sleep(.02)
    raise AssertionError('Timed out')


def test_browser_name_persists_and_remains_independent(tmp_path):
    path=tmp_path/'server'
    with TestClient(create_app(path,'test',testing=True)) as client:
        client.get('/');original=client.get('/api/workspace').json();assert client.get('/api/workspace/profile').json()=={'name':''}
        response=client.post('/api/workspace/profile',json={'name':'  Alex  '});assert response.json()=={'name':'Alex'}
        assert client.get('/api/workspace').json()['name']=="Alex's Workspace"
        assert client.post('/api/workspace/start',json={'kind':'blank'}).json()['design_id']==original['active_design']
        assert len(client.get('/api/workspace').json()['designs'])==1
        cookies=[copy.copy(c) for c in client.cookies.jar]
        client.cookies.clear();client.get('/');assert client.get('/api/workspace/profile').json()=={'name':''}
        client.post('/api/workspace/profile',json={'name':'Sam'}).raise_for_status()
        assert client.get('/api/workspace').json()['name']=="Sam's Workspace"
    with TestClient(create_app(path,'new-token',testing=True)) as client:
        for cookie in cookies:client.cookies.jar.set_cookie(cookie)
        client.get('/');assert client.get('/api/workspace/profile').json()=={'name':'Alex'}
        assert client.get('/api/workspace').json()['workspace_code']==original['workspace_code']
        client.post('/api/workspace/rename',json={'name':'Workshop'}).raise_for_status()
        client.post('/api/workspace/profile',json={'name':'Alexander'}).raise_for_status()
        assert client.get('/api/workspace').json()['name']=='Workshop'


@pytest.mark.parametrize('name',['','   ','a'*61,'Alex\nBob',None])
def test_invalid_profile_names_are_rejected(tmp_path,name):
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        client.get('/');assert client.post('/api/workspace/profile',json={'name':name}).status_code==400
        assert client.get('/api/workspace/profile').json()=={'name':''}


def test_startup_opens_public_design_without_creating_reference_copies(tmp_path):
    from ryancad.public_workspace import PUBLIC_WORKSPACE_CODE,PUBLIC_DESIGNS
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        client.get('/');original=client.get('/api/workspace').json()
        assert client.post('/api/workspace/start',json={'kind':'reference','recipe':'plate'}).status_code==400
        client.post('/api/design-library/select',json={'workspace':PUBLIC_WORKSPACE_CODE,'design':PUBLIC_DESIGNS['plate']}).raise_for_status()
        assert len(client.get('/api/workspace').json()['designs'])==2
        client.post('/api/design-library/select',json={'workspace':original['workspace_code'],'design':original['active_design']}).raise_for_status()
        assert len(client.get('/api/workspace').json()['designs'])==1


def test_name_changes_update_only_automatically_named_workspaces(tmp_path):
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        client.get('/');client.post('/api/workspace/profile',json={'name':'Alex'}).raise_for_status()
        client.post('/api/workspace/profile',json={'name':'Alexandra'}).raise_for_status()
        assert client.get('/api/workspace').json()['name']=="Alexandra's Workspace"
        client.post('/api/workspace/rename',json={'name':'Workshop'}).raise_for_status()
        client.post('/api/workspace/profile',json={'name':'Sam'}).raise_for_status()
        assert client.get('/api/workspace').json()['name']=='Workshop'


def test_design_picker_lists_accessible_workspaces_and_can_switch_without_copying(tmp_path):
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        client.get('/');first=client.get('/api/workspace').json();id1=first['active_design']
        client.post('/api/workspace/new',json={'name':'Tools'}).raise_for_status()
        second=client.get('/api/workspace').json();id2=second['active_design']
        data=client.get('/api/design-library').json();groups=data['workspaces']
        assert [g['id'] for g in groups]==[second['workspace_code'],first['workspace_code'],PUBLIC_WORKSPACE_CODE]
        assert groups[0]['current'] and not groups[1]['current']
        assert groups[0]['designs'][0]['last_active']
        assert not groups[0]['designs'][0]['last_edited']  # untouched automatic blank
        response=client.post('/api/design-library/select',json={'workspace':first['workspace_code'],'design':id1})
        assert response.status_code==200 and response.json()['design_id']==id1
        assert client.get('/api/workspace').json()['workspace_code']==first['workspace_code']
        assert len(client.get('/api/workspace').json()['designs'])==1
        assert client.post('/api/design-library/select',json={'workspace':second['workspace_code'],'design':id1}).status_code==400
        assert client.get('/api/workspace').json()['workspace_code']==first['workspace_code']
        assert client.post('/api/design-library/select',json={'workspace':'other','design':id2}).status_code==400

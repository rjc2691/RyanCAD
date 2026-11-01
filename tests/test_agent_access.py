import time
from fastapi.testclient import TestClient
from ryancad.api import create_app


def test_discovery_deduplicates_tabs_expires_and_uses_current_design(tmp_path):
    with TestClient(create_app(tmp_path/'server','test',testing=True)) as client:
        client.get('/')
        workspace=client.get('/api/workspace').json()
        design=workspace['active_design']
        for tab in ('a','b'):
            client.post('/api/workspace/presence',json={'tab':tab,'design':design}).raise_for_status()
        targets=client.get('/api/workspace/agent-targets').json()['targets']
        assert len(targets)==1 and targets[0]['design']==design
        assert targets[0]['workspace']==workspace['workspace_code']
        assert client.post('/api/workspace/presence',json={'tab':'c','design':'missing'}).status_code==400
        second=client.post('/api/workspace/designs',json={'name':'Other'}).json()['design_id']
        client.post('/api/workspace/presence',json={'tab':'b','design':second}).raise_for_status()
        assert len(client.get('/api/workspace/agent-targets').json()['targets'])==2
        gateway=client.app.state.agent_access
        for value in gateway.browsers.values(): value['seen']=time.monotonic()-91
        assert client.get('/api/workspace/agent-targets').json()['targets']==[]


def test_disable_revokes_agents_blocks_bearer_preserves_browser_and_survives_restart(tmp_path):
    project=tmp_path/'server'
    with TestClient(create_app(project,'test',testing=True)) as client:
        client.get('/')
        workspace=client.get('/api/workspace').json()
        headers={'Authorization':'Bearer test','X-RyanCAD-Workspace':workspace['workspace_code'],'X-RyanCAD-Design':workspace['active_design']}
        actor=client.post('/api/agents',headers=headers,json={'name':'Tester'}).json()['id']
        headers['X-RyanCAD-Actor']=actor
        client.post(f'/api/agents/{actor}/step_mode').raise_for_status()
        pending=client.post('/api/commands',headers=headers,json={'name':'part.create','args':{},'expected_revision':0}).json()['job_id']
        for _ in range(100):
            if client.get('/api/jobs/'+pending).json()['status']=='waiting':break
            time.sleep(.01)
        assert client.get('/api/jobs/'+pending).json()['status']=='waiting'
        assert client.post('/api/workspace/agents/status',headers=headers,json={'enabled':False}).status_code==400
        result=client.post('/api/workspace/agents/status',json={'enabled':False}).json()
        assert not result['enabled'] and not result['listening'] and result['port']==8790
        assert client.get('/api/state',headers=headers).status_code==403
        state=client.get('/api/state').json()
        agent=next(a for a in state['agents'] if a['actor']['id']==actor)
        assert agent['revoked'] and not agent['connected']
        for _ in range(100):
            if client.get('/api/jobs/'+pending).json()['status'] in {'failed','cancelled'}:break
            time.sleep(.02)
        assert client.get('/api/jobs/'+pending).json()['status'] in {'failed','cancelled'}
        assert client.get('/api/state').json()['document']['revision']==0
        assert client.get('/api/health',headers=headers).status_code==200
    with TestClient(create_app(project,'test',testing=True)) as client:
        client.get('/')
        assert not client.get('/api/workspace/agents/status').json()['enabled']
        client.post('/api/workspace/agents/status',json={'enabled':True}).raise_for_status()
        assert client.get('/api/workspace/agent-targets',headers={'Authorization':'Bearer test'}).status_code==200

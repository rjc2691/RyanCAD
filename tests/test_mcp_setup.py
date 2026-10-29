import tomllib
from fastapi.testclient import TestClient
from ryancad.api import create_app
from ryancad.mcp_setup import codex_setup

def test_codex_config_roundtrips_quoted_paths_and_scoped_target(tmp_path,monkeypatch):
    folder=tmp_path/'CAD files';folder.mkdir();monkeypatch.chdir(folder)
    monkeypatch.setattr('ryancad.mcp_setup.sys.executable',r'C:\Python "CAD"\python.exe')
    data=codex_setup(8898,'workspace-example','design-example','Part study')
    config=tomllib.loads(data['config'])['mcp_servers']['ryancad']
    assert config['command']==r'C:\Python "CAD"\python.exe'
    assert config['cwd']==str(folder)
    assert config['args']==['-m','ryancad.mcp_server','--connection',str(folder/'runtime'/'connection-8898.json'),'--name','Codex','--workspace','workspace-example','--design','design-example']
    assert 'token' not in config
    assert data['format']=='toml' and not data['connection_ready']

def test_setup_uses_browser_workspace_and_design_not_legacy(tmp_path):
    with TestClient(create_app(tmp_path/'project','secret-not-in-config',testing=True)) as client:
        client.get('/')
        workspace=client.get('/api/workspace').json()
        created=client.post('/api/workspace/designs',json={'name':'Target design'}).json()
        response=client.get('/api/agents/setup',headers={'X-RyanCAD-Design':created['design_id']})
        assert response.status_code==200
        result=response.json();args=tomllib.loads(result['config'])['mcp_servers']['ryancad']['args']
        assert args[args.index('--workspace')+1]==workspace['workspace_code']
        assert args[args.index('--design')+1]==created['design_id']
        assert result['design_name']=='Target design'
        assert 'secret-not-in-config' not in response.text

import json
import sys

import httpx
import pytest

from ryancad import mcp_server


@pytest.mark.parametrize("invoke_tools", [False, True])
def test_discovery_does_not_register_and_tool_calls_share_one_session(tmp_path, monkeypatch, invoke_tools):
    config = tmp_path / "connection.json"
    config.write_text(json.dumps({"url": "http://localhost:8790", "token": "test"}), encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["ryancad-mcp", "--connection", str(config), "--workspace", "test-workspace", "--design", "test-design"])
    requests = []
    def handle(request):
        requests.append(request)
        if request.url.path == "/api/workspace":
            return httpx.Response(200, json={"active_design": "test-design"})
        if request.url.path == "/api/agents":
            return httpx.Response(200, json={"id": "test-agent"})
        if request.url.path == "/api/capabilities":
            assert request.headers["X-RyanCAD-Actor"] == "test-agent"
            return httpx.Response(200, json={"revision": 0})
        return httpx.Response(200, json={"ok": True})
    real_client = httpx.Client
    monkeypatch.setattr(mcp_server.httpx, "Client", lambda **kwargs: real_client(**kwargs, transport=httpx.MockTransport(handle)))
    class Server:
        def __init__(self, *args, **kwargs): self.tools = {}
        def tool(self):
            def register(fn):
                self.tools[fn.__name__] = fn
                return fn
            return register
        def run(self, **kwargs):
            assert "cad_capabilities" in self.tools
            assert [r.url.path for r in requests] == ["/api/workspace"]
            if invoke_tools:
                for _ in range(3):
                    assert self.tools["cad_capabilities"]() == {"revision": 0}
    monkeypatch.setattr(mcp_server, "MCPServer", Server)
    mcp_server.main()
    paths = [r.url.path for r in requests]
    assert paths.count("/api/agents") == int(invoke_tools)
    assert paths.count("/api/agents/disconnect") == int(invoke_tools)
    assert paths.count("/api/capabilities") == 3 * int(invoke_tools)


@pytest.mark.parametrize("count", [0,1,2])
def test_automatic_discovery_requires_unambiguous_choice_and_stays_pinned(tmp_path,monkeypatch,count):
    config=tmp_path/'connection.json';config.write_text(json.dumps({'url':'http://localhost:8790','token':'test'}))
    monkeypatch.setattr(sys,'argv',['ryancad-mcp','--connection',str(config)])
    targets=[{'workspace':f'workspace-{i}','design':f'design-{i}'} for i in range(count)]
    requests=[]
    def handle(request):
        requests.append(request)
        if request.url.path=='/api/workspace/agent-targets':return httpx.Response(200,json={'targets':targets})
        if request.url.path=='/api/agents':return httpx.Response(200,json={'id':'agent'})
        if request.url.path=='/api/capabilities':
            assert request.headers['X-RyanCAD-Workspace']=='workspace-0'
            assert request.headers['X-RyanCAD-Design']=='design-0'
            return httpx.Response(200,json={'revision':0})
        return httpx.Response(200,json={'ok':True})
    real_client=httpx.Client
    monkeypatch.setattr(mcp_server.httpx,'Client',lambda **kwargs:real_client(**kwargs,transport=httpx.MockTransport(handle)))
    class Server:
        def __init__(self,*args,**kwargs):self.tools={}
        def tool(self):
            def register(fn):self.tools[fn.__name__]=fn;return fn
            return register
        def run(self,**kwargs):
            assert self.tools['cad_sessions']()['targets']==targets
            assert not any(r.url.path=='/api/agents' for r in requests)
            if count!=1:
                with pytest.raises(ValueError):self.tools['cad_capabilities']()
                assert not any(r.url.path=='/api/agents' for r in requests)
                if count==0:return
                self.tools['cad_select_session']('workspace-0','design-0')
            self.tools['cad_capabilities']()
            targets.clear()  # Browser navigation/closure cannot retarget this connector.
            self.tools['cad_capabilities']()
            with pytest.raises(ValueError):self.tools['cad_select_session']('workspace-1','design-1')
    monkeypatch.setattr(mcp_server,'MCPServer',Server)
    mcp_server.main()
    assert sum(r.url.path=='/api/agents' for r in requests)==int(count>0)

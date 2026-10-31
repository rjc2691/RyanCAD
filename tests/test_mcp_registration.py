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

import json
import socket
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from ryancad import __main__ as cli, api, network


def test_address_discovery_uses_private_interfaces_without_loopback_or_duplicates(monkeypatch):
    addresses = ["192.168.1.11", "10.2.0.8", "172.31.96.1", "192.168.1.11",
                 "127.0.0.1", "0.0.0.0", "8.8.8.8", "224.0.0.1", "169.254.1.3"]
    monkeypatch.setattr(network.socket, "getaddrinfo", lambda *a: [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 0)) for address in addresses])
    assert network.local_ipv4_addresses() == ["10.2.0.8", "169.254.1.3", "172.31.96.1", "192.168.1.11"]


def test_address_discovery_handles_offline_name_resolution(monkeypatch):
    def offline(*args):
        raise OSError("No local address")
    monkeypatch.setattr(network.socket, "getaddrinfo", offline)
    assert network.local_ipv4_addresses() == []


def test_default_listener_does_not_enable_lan_hosts(tmp_path, monkeypatch):
    monkeypatch.delenv("RYANCAD_PUBLIC_URL", raising=False)
    def unexpected_discovery():
        raise AssertionError("LAN discovery must remain opt-in")
    monkeypatch.setattr(api, "local_ipv4_addresses", unexpected_discovery)
    app = api.create_app(tmp_path / "local", "test-capability", testing=True)
    with TestClient(app) as client:
        assert app.state.lan_urls == []
        assert client.get("/api/health", headers={"Host": "192.168.1.11:8790"}).status_code == 403
        assert client.get("/api/health").status_code == 200


def test_lan_browser_bootstraps_session_and_accepts_same_origin_edits(tmp_path, monkeypatch):
    monkeypatch.delenv("RYANCAD_PUBLIC_URL", raising=False)
    monkeypatch.setattr(api, "local_ipv4_addresses", lambda: ["192.168.1.11"])
    app = api.create_app(tmp_path / "lan", "test-capability", lan=True)
    url = "http://192.168.1.11:8790"
    with TestClient(app, base_url=url) as client:
        assert app.state.lan_urls == [url]
        assert client.get("/").status_code == 200
        assert client.get("/api/state", headers={"Origin": url}).status_code == 200
        result = client.post("/api/commands", headers={"Origin": url}, json={
            "name": "document.rename", "args": {"name": "Phone design"}, "expected_revision": 0})
        assert result.status_code == 200
        assert result.json().get("job_id") or result.json().get("status") == "complete"
        assert client.get("/api/health", headers={"Host": "127.0.0.1:8790"}).status_code == 200
        assert client.get("/api/health", headers={"Host": "192.168.1.11:8791"}).status_code == 403
        assert client.get("/api/health", headers={"Host": "other.example:8790"}).status_code == 403
        assert client.get("/api/state", headers={"Origin": "https://unrelated.example"}).status_code == 403
        assert client.get("/api/state", headers={"Origin": "http://192.168.1.11:8791"}).status_code == 403
        assert client.get("/api/state", headers={"Cookie": "ryancad_session_8790=wrong"}).status_code == 401


def test_lan_and_public_proxy_origins_can_coexist(tmp_path, monkeypatch):
    monkeypatch.setenv("RYANCAD_PUBLIC_URL", "https://cad.example.com")
    monkeypatch.setattr(api, "local_ipv4_addresses", lambda: ["192.168.1.11"])
    app = api.create_app(tmp_path / "combined", "test-capability", lan=True)
    with TestClient(app, base_url="https://cad.example.com") as client:
        response = client.get("/")
        assert response.status_code == 200
        assert "Secure" in response.headers["set-cookie"]
        assert client.get("/api/health", headers={"Host": "192.168.1.11:8790"}).status_code == 200
        assert client.get("/api/state", headers={"Origin": "https://cad.example.com"}).status_code == 200


@pytest.mark.parametrize("lan", [False, True])
def test_cli_rejects_an_existing_loopback_listener_even_in_lan_mode(tmp_path, monkeypatch, capsys, lan):
    monkeypatch.chdir(tmp_path)
    def unexpected_app(*args, **kwargs):
        raise AssertionError("An occupied port must be rejected before opening any project")
    monkeypatch.setattr(api, "create_app", unexpected_app)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        monkeypatch.setattr("sys.argv", ["ryancad", "--port", str(port), "--no-browser", "--no-tray"] + (["--lan"] if lan else []))
        with pytest.raises(SystemExit) as error:
            cli.main()
    assert error.value.code == 2
    assert "already in use" in capsys.readouterr().err


@pytest.mark.parametrize("lan", [False, True])
def test_cli_probe_listener_and_connection_metadata_share_lan_mode(tmp_path, monkeypatch, capsys, lan):
    import uvicorn
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "cache"))
    monkeypatch.setenv("PYTHONUTF8", "1")
    monkeypatch.setattr("sys.argv", ["ryancad", "--no-browser", "--no-tray"] + (["--lan"] if lan else []))
    probes, configs, modes, metadata = [], [], [], []
    class Probe:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def bind(self, address): probes.append(address)
    monkeypatch.setattr(cli, "socket", SimpleNamespace(AF_INET=socket.AF_INET, SOCK_STREAM=socket.SOCK_STREAM,
                                                       socket=lambda *a: Probe()))
    def create(*args, **kwargs):
        modes.append(kwargs["lan"])
        return SimpleNamespace(state=SimpleNamespace(lan_urls=["http://192.168.1.11:8790"] if lan else []))
    monkeypatch.setattr(api, "create_app", create)
    def configure(app, **kwargs):
        configs.append(kwargs)
        return kwargs
    monkeypatch.setattr(uvicorn, "Config", configure)
    class Server:
        def __init__(self, config): pass
        def run(self):
            value = json.loads((tmp_path / "runtime" / "connection.json").read_text("utf-8"))
            metadata.append({key: value[key] for key in ("url", "lan_urls")})
    monkeypatch.setattr(uvicorn, "Server", Server)
    cli.main()
    host = "0.0.0.0" if lan else "127.0.0.1"
    assert probes == [(host, 8790)] and configs[0]["host"] == host
    assert modes == [lan]
    assert metadata == [{"url": "http://127.0.0.1:8790", "lan_urls": ["http://192.168.1.11:8790"] if lan else []}]
    assert not (tmp_path / "runtime" / "connection.json").exists()
    assert ("Local network: http://192.168.1.11:8790" in capsys.readouterr().out) == lan

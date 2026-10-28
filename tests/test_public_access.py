import pytest
import httpx

from ryancad.api import create_app


async def test_public_origin_and_local_access(tmp_path, monkeypatch):
    monkeypatch.setenv("RYANCAD_PUBLIC_URL", "https://cad.example.com")
    frontend = tmp_path / "frontend"
    (frontend / "assets").mkdir(parents=True)
    (frontend / "index.html").write_text("<html>RyanCAD</html>")
    app = create_app(tmp_path / "project", "token", frontend=frontend)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://cad.example.com") as client:
        response = await client.get("/")
        assert response.status_code == 200
        assert "Secure" in response.headers["set-cookie"]
        assert (await client.get("/api/health", headers={"Origin": "https://cad.example.com"})).status_code == 200
        assert (await client.get("/api/state", headers={"Origin": "https://evil.example"})).status_code == 403
        assert (await client.get("/api/health", headers={"Host": "evil.example"})).status_code == 403
        assert (await client.get("/api/health", headers={"Host": "127.0.0.1:8790"})).status_code == 200


@pytest.mark.parametrize("url", ["cad.example.com", "https://cad.example.com/path", "https://user@cad.example.com", "https://cad.example.com:bad"])
def test_invalid_public_url_fails_startup(tmp_path, monkeypatch, url):
    monkeypatch.setenv("RYANCAD_PUBLIC_URL", url)
    with pytest.raises(ValueError, match="RYANCAD_PUBLIC_URL"):
        create_app(tmp_path / "project", "token")

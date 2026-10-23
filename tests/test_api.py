import time

import pytest
from fastapi.testclient import TestClient

from ryancad.api import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path / "project.rycad", "test-capability", testing=True)
    with TestClient(app) as current:
        current.get("/")  # Same-origin human session cookie.
        yield current


def wait(client, response):
    response.raise_for_status()
    data = response.json()
    if data.get("status") == "complete":
        return data
    until = time.monotonic() + 60
    while time.monotonic() < until:
        job = client.get("/api/jobs/" + data["job_id"]).json()
        if job["status"] in {"complete", "failed", "cancelled"}:
            return job
        time.sleep(.02)
    raise AssertionError("API job timed out")


def test_local_origin_and_session_boundaries(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/state", headers={"Origin": "https://unrelated.example"}).status_code == 403
    assert client.get("/api/state", headers={"Host": "untrusted.example"}).status_code == 403
    assert client.get("/api/state", headers={"Cookie": "ryancad_session_8790=wrong"}).status_code == 401


def test_bearer_agent_cannot_omit_identity_or_operate_human_controls(client):
    bearer = {"Authorization": "Bearer test-capability"}
    command = {"name": "document.rename", "args": {"name": "External action"}, "expected_revision": 0}
    assert client.post("/api/commands", json=command, headers=bearer).json()["error"]["code"] == "agent_session_required"
    actor = client.post("/api/agents", json={"name": "API agent"}, headers=bearer).json()
    agent_headers = {**bearer, "X-RyanCAD-Actor": actor["id"]}
    assert client.post(f"/api/agents/{actor['id']}/resume", headers=agent_headers).json()["error"]["code"] == "human_control_required"
    completed = wait(client, client.post("/api/commands", json=command, headers=agent_headers))
    assert completed["status"] == "complete"
    state = client.get("/api/state").json()
    assert state["document"]["name"] == "External action"
    assert state["actions"][0]["actor"]["id"] == actor["id"]


def test_preview_and_stale_commit_are_distinct_from_saved_edits(client):
    state = client.get("/api/state").json()
    base = state["document"]["revision"]
    preview = wait(client, client.post("/api/previews", json={"name": "document.rename", "args": {"name": "Candidate"}, "expected_revision": base}))
    assert preview["status"] == "complete"
    token = preview["result"]["preview_token"]
    assert client.get("/api/state").json()["document"]["revision"] == base
    actual = wait(client, client.post("/api/commands", json={"name": "document.rename", "args": {"name": "Human change"}, "expected_revision": base}))
    assert actual["status"] == "complete"
    stale = wait(client, client.post(f"/api/previews/{token}/commit"))
    assert stale["error"]["code"] == "stale_revision"
    assert client.get("/api/state").json()["document"]["name"] == "Human change"


def test_export_and_native_input_validation_are_actionable(client):
    assert client.post("/api/export", json={"expected_revision":0,"tolerance":-1}).status_code == 422
    assert client.post("/api/import", content=b'PKbroken').json()["error"]["code"] == "invalid_archive"
    assert client.post("/api/import", content=b'name: [unterminated').json()["error"]["code"] == "invalid_document"
    job = wait(client, client.post("/api/export", json={"expected_revision":0,"instance_ids":[]}))
    assert job["error"]["code"] == "invalid_selection"


def test_two_local_projects_do_not_overwrite_each_others_browser_cookie(tmp_path):
    app_a = create_app(tmp_path / "first", "first-token", port=8792, testing=True)
    app_b = create_app(tmp_path / "second", "second-token", port=8793, testing=True)
    with TestClient(app_a) as first, TestClient(app_b) as second:
        first.get("/")
        second.get("/")
        first.cookies.update(second.cookies)
        second.cookies.update(first.cookies)
        assert first.get("/api/state").status_code == 200
        assert second.get("/api/state").status_code == 200

import time
import json

import pytest
from fastapi.testclient import TestClient

from ryancad.api import create_app
from ryancad.model import Document
from ryancad.storage import ProjectStore


def browser(client):
    client.cookies.clear()
    assert client.get("/").status_code == 200
    return "; ".join(f"{name}={value}" for name, value in client.cookies.items())


def headers(cookie, design=None):
    result = {"Cookie": cookie}
    if design:
        result["X-RyanCAD-Design"] = design
    return result


def request(client, method, path, cookie, design=None, **kwargs):
    return client.request(method, path, headers=headers(cookie, design), **kwargs)


def wait(client, result, cookie, design):
    result.raise_for_status()
    job = result.json()
    if job.get("status") == "complete":
        return job
    job_id = job["job_id"]
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        job = request(client, "GET", "/api/jobs/" + job_id, cookie, design).json()
        if job["status"] in {"complete", "failed", "cancelled"}:
            return job
        time.sleep(.03)
    raise AssertionError("Design job did not complete")


def test_browser_workspaces_design_routing_restore_and_restart(tmp_path):
    project = tmp_path / "existing"
    with TestClient(create_app(project, "token", testing=True)) as client:
        first = browser(client)
        workspace_a = request(client, "GET", "/api/workspace", first).json()
        a1 = workspace_a["active_design"]
        metadata = client.app.state.workspaces._directory(workspace_a["workspace_code"]) / "workspace.json"
        assert json.loads(metadata.read_text("utf-8"))["recovery_code"] == workspace_a["workspace_code"]
        second = browser(client)
        workspace_b = request(client, "GET", "/api/workspace", second).json()
        b1 = workspace_b["active_design"]
        assert workspace_a["workspace_code"] != workspace_b["workspace_code"]
        assert a1 != b1

        created = request(client, "POST", "/api/workspace/designs", first, json={"name": "Enclosure"}).json()
        a2 = created["design_id"]
        assert request(client, "GET", "/api/state", first, a2).json()["document"]["name"] == "Enclosure"
        assert request(client, "GET", "/api/state", second, b1).json()["document"]["name"] == "Untitled design"
        assert request(client, "GET", "/api/state", second, a2).json()["error"]["code"] == "missing_design"

        renamed = request(client, "POST", "/api/commands", first, a1,
                          json={"name": "document.rename", "args": {"name": "Original"}, "expected_revision": 0})
        assert wait(client, renamed, first, a1)["status"] == "complete"
        # Changing the workspace default cannot redirect a tab or a queued job.
        assert request(client, "GET", "/api/state", first, a1).json()["document"]["name"] == "Original"
        assert request(client, "GET", "/api/state", first, a2).json()["document"]["name"] == "Enclosure"
        assert request(client, "GET", "/api/state", second, b1).json()["document"]["revision"] == 0

        rename_other = request(client, "POST", f"/api/workspace/designs/{a2}/rename", first, json={"name": "Box"})
        assert wait(client, rename_other, first, a2)["status"] == "complete"
        assert request(client, "GET", "/api/workspace", first).json()["designs"][1]["name"] == "Box"
        assert request(client, "POST", f"/api/workspace/designs/{a2}/delete", first).status_code == 200
        assert request(client, "GET", "/api/state", first, a2).json()["error"]["code"] == "missing_design"
        assert request(client, "POST", f"/api/workspace/designs/{a2}/restore", first).status_code == 200
        assert request(client, "GET", "/api/state", first, a2).json()["document"]["name"] == "Box"

        # A bearer agent can pin this exact browser workspace and design.
        agent = {"Authorization": "Bearer token", "X-RyanCAD-Workspace": workspace_a["workspace_code"], "X-RyanCAD-Design": a1}
        actor = client.post("/api/agents", headers=agent, json={"name": "Tester"}).json()
        assert client.get("/api/state", headers=agent).json()["document"]["name"] == "Original"
        assert actor["id"].startswith("agent_")
        agent["X-RyanCAD-Actor"] = actor["id"]
        command = client.post("/api/commands", headers=agent, json={"name": "document.rename", "args": {"name": "Agent edited"}, "expected_revision": 1})
        assert wait(client, command, first, a1)["status"] == "complete"
        assert request(client, "GET", "/api/state", first, a1).json()["document"]["name"] == "Agent edited"
        assert request(client, "GET", "/api/state", first, a2).json()["document"]["name"] == "Box"
        saved_first = first

    # Authentication may change on restart; the browser's workspace cookie does not.
    with TestClient(create_app(project, "new-token", testing=True)) as client:
        assert client.get("/", headers={"Cookie": saved_first}).status_code == 200
        restored_cookie = "; ".join(f"{name}={value}" for name, value in client.cookies.items())
        info = request(client, "GET", "/api/workspace", restored_cookie).json()
        assert info["workspace_code"] == workspace_a["workspace_code"]
        assert {item["name"] for item in info["designs"]} == {"Agent edited", "Box"}
        assert request(client, "GET", "/api/state", restored_cookie, a1).json()["document"]["revision"] == 2
        assert request(client, "GET", "/api/state", restored_cookie, a2).json()["document"]["name"] == "Box"


def test_existing_project_is_copied_deliberately_and_native_import_preserves_history(tmp_path):
    project = tmp_path / "existing"
    store = ProjectStore(project)
    original = store.load()
    original.name = "Existing mold"
    original.revision = 1
    store.commit(original, None, "rename", "rename", {}, [0], [])
    store.close()
    with TestClient(create_app(project, "token", testing=True)) as client:
        cookie = browser(client)
        workspace = request(client, "GET", "/api/workspace", cookie).json()
        blank = workspace["active_design"]
        assert workspace["legacy_available"]
        assert request(client, "GET", "/api/state", cookie, blank).json()["document"]["name"] == "Untitled design"
        copied = request(client, "POST", "/api/workspace/copy-existing", cookie).json()["design_id"]
        assert request(client, "GET", "/api/state", cookie, copied).json()["document"]["name"] == "Existing mold"
        assert request(client, "GET", "/api/state", cookie, copied).json()["document"]["revision"] == 1
        archive = request(client, "GET", "/api/native", cookie, copied).content
        imported = request(client, "POST", "/api/workspace/import", cookie, content=archive).json()["design_id"]
        state = request(client, "GET", "/api/state", cookie, imported).json()
        assert state["document"]["name"] == "Existing mold"
        assert state["document"]["revision"] == 1
        assert state["can_undo"]
        # Deletion cannot race an HTTP request bound to this design.
        manager = client.app.state.workspaces
        manager.acquire(workspace["workspace_code"], blank)
        try:
            blocked = request(client, "POST", f"/api/workspace/designs/{blank}/delete", cookie)
            assert blocked.json()["error"]["code"] == "design_busy"
        finally:
            manager.release(workspace["workspace_code"], blank)
        deleted = request(client, "POST", f"/api/workspace/designs/{blank}/delete", cookie)
        assert deleted.status_code == 200, deleted.json()
        assert request(client, "POST", f"/api/workspace/designs/{copied}/delete", cookie).status_code == 200
        assert request(client, "POST", f"/api/workspace/designs/{imported}/delete", cookie).json()["error"]["code"] == "last_design"
    store = ProjectStore(project)
    try:
        assert store.load().name == "Existing mold" and store.load().revision == 1
    finally:
        store.close()


def test_parallel_designs_keep_geometry_jobs_and_downloads_scoped(tmp_path):
    with TestClient(create_app(tmp_path / "project", "token", testing=True)) as client:
        first = browser(client)
        a = request(client, "GET", "/api/workspace", first).json()["active_design"]
        second = browser(client)
        b = request(client, "GET", "/api/workspace", second).json()["active_design"]
        spec_a = {"name": "operation.create", "expected_revision": 0,
                  "args": {"name": "First box", "values": {"width": 10, "height": 20, "distance": 3}}}
        spec_b = {"name": "operation.create", "expected_revision": 0,
                  "args": {"name": "Second box", "values": {"width": 5, "height": 6, "distance": 7}}}
        job_a = request(client, "POST", "/api/commands", first, a, json=spec_a)
        job_b = request(client, "POST", "/api/commands", second, b, json=spec_b)
        # Switching the default while another design is computing cannot redirect it.
        another = request(client, "POST", "/api/workspace/designs", first, json={"name": "Other"}).json()["design_id"]
        result_a = wait(client, job_a, first, a)
        result_b = wait(client, job_b, second, b)
        assert result_a["status"] == result_b["status"] == "complete"
        state_a = request(client, "GET", "/api/state", first, a).json()
        state_b = request(client, "GET", "/api/state", second, b).json()
        component_a = result_a["result"]["component_id"]
        component_b = result_b["result"]["component_id"]
        assert state_a["geometry"][component_a]["volume"] == pytest.approx(600)
        assert state_b["geometry"][component_b]["volume"] == pytest.approx(210)
        assert component_b not in state_a["geometry"]
        assert request(client, "GET", f"/api/geometry/{component_a}", first, a).status_code == 200
        assert request(client, "GET", f"/api/geometry/{component_a}", second, b).status_code == 400
        exported = request(client, "POST", "/api/export", first, a, json={"expected_revision": 1})
        completed = wait(client, exported, first, a)
        assert completed["status"] == "complete", completed.get("error")
        export_id = completed["result"]["export_id"]
        assert request(client, "GET", f"/api/exports/{export_id}?design_id={a}", first).status_code == 200
        assert request(client, "GET", f"/api/exports/{export_id}", first, another).status_code == 400
        assert request(client, "GET", f"/api/exports/{export_id}?design_id={a}", second).status_code == 400

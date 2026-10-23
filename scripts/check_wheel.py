"""Prove installed wheel code/UI delivery without using the source frontend."""
from pathlib import Path
import json
import re
import sys
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / ".cache/package-proof"
sys.path.insert(0, str(PACKAGE))


def main():
    import ryancad
    from ryancad.api import create_app
    from fastapi.testclient import TestClient
    assert Path(ryancad.__file__).is_relative_to(PACKAGE)
    app = create_app(ROOT / ".cache/package-test" / uuid4().hex, "package-test", testing=True, frontend=ROOT / ".cache/not-the-source-frontend")
    with TestClient(app) as client:
        page = client.get("/")
        assert page.status_code == 200 and "RyanCAD" in page.text
        asset = re.search(r'src="(/assets/[^"]+)"', page.text).group(1)
        assert client.get(asset).status_code == 200
        notices = client.get("/third-party-licenses.txt")
        assert notices.status_code == 200 and "===== react =====" in notices.text
        submitted = client.post("/api/commands", json={"name":"feature.create", "args":{"type":"box"}, "expected_revision":0}).json()
        until = time.monotonic() + 60
        while time.monotonic() < until:
            job = client.get("/api/jobs/" + submitted["job_id"]).json()
            if job["status"] in {"complete", "failed", "cancelled"}:
                break
            time.sleep(.02)
        assert job["status"] == "complete" and job["result"]["saved"], job
        component = job["result"]["component_id"]
        mesh = client.get("/api/geometry/" + component)
        assert mesh.content[:4] == b"RCAD"
        state = client.get("/api/state").json()
        assert state["geometry"][component]["volume"] == 12000
        report = {"installed_module_used": True, "bundled_html_and_assets": True, "bundled_license_notices": True,
                  "native_worker_geometry": True, "durable_command": True, "mesh_bytes": len(mesh.content)}
        (ROOT / "artifacts/package-proof.json").write_text(json.dumps(report, indent=2), "utf-8")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

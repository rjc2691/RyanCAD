"""External-agent stdio adapter to the same live session displayed by the UI."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import time
import threading
from uuid import uuid4

import httpx
from mcp.server import MCPServer


def main():
    parser = argparse.ArgumentParser(description="RyanCAD external-agent MCP connector; start RyanCAD first")
    parser.add_argument("--connection", type=Path, default=Path("runtime/connection.json"))
    parser.add_argument("--name", default="External CAD agent")
    parser.add_argument("--workspace", required=True, help="Browser workspace recovery code")
    parser.add_argument("--design", help="Design ID within the selected browser workspace")
    arguments = parser.parse_args()
    if arguments.design and not arguments.workspace:
        parser.error("--design requires --workspace")
    config = json.loads(arguments.connection.read_text("utf-8"))
    client = httpx.Client(base_url=config["url"], headers={"Authorization": f"Bearer {config['token']}"}, timeout=30)
    if arguments.workspace:
        client.headers["X-RyanCAD-Workspace"] = arguments.workspace
        workspace = client.get("/api/workspace")
        workspace.raise_for_status()
        # Pin the connector for its entire life, even if another tab switches designs.
        client.headers["X-RyanCAD-Design"] = arguments.design or workspace.json()["active_design"]
    server = MCPServer("RyanCAD", instructions="Inspect the live document and capabilities before editing. Use semantic commands with the current revision. Each ordinary command is a visible authored step. Wait for completion before depending on results. Respect paused/revoked controls. No model/chat integration is needed in the CAD app.")

    stopped = threading.Event()
    registration_lock = threading.Lock()
    pulse_thread = None
    def heartbeat():
        # Separate client: keep leases alive even while a tool waits on geometry.
        with httpx.Client(base_url=config["url"], headers=dict(client.headers), timeout=10) as pulse:
            while not stopped.wait(15):
                try:
                    result = pulse.post("/api/agents/heartbeat")
                    if result.status_code in {401, 403}:
                        return
                except httpx.HTTPError:
                    pass  # The server expires this session if the outage persists.

    def ensure_agent():
        nonlocal pulse_thread
        # Hosts can start short-lived connectors just to discover available tools.
        # Only an actual tool invocation creates an authored CAD session.
        with registration_lock:
            if pulse_thread is not None:
                return
            response = client.post("/api/agents", json={"name": arguments.name})
            response.raise_for_status()
            client.headers["X-RyanCAD-Actor"] = response.json()["id"]
            pulse_thread = threading.Thread(target=heartbeat, name="ryancad-agent-heartbeat", daemon=True)
            pulse_thread.start()

    def get(path):
        ensure_agent()
        result = client.get(path)
        result.raise_for_status()
        return result.json()

    def post(path, payload=None):
        ensure_agent()
        result = client.post(path, json=payload or {})
        if result.is_error:
            return result.json()
        return result.json()

    def wait(result, seconds):
        if "job_id" not in result:
            return result
        until = time.monotonic() + min(max(seconds, 0), 25)
        while time.monotonic() < until:
            job = get(f"/api/jobs/{result['job_id']}")
            if job["status"] in {"complete", "failed", "cancelled", "waiting"}:
                return job
            time.sleep(.1)
        return get(f"/api/jobs/{result['job_id']}")

    @server.tool()
    def cad_capabilities() -> dict:
        """Read supported commands, fields, units, limits, document ID and current revision."""
        return get("/api/capabilities")

    @server.tool()
    def cad_inspect(component_id: str | None = None, include_parameters: bool = True, activity_before: int | None = None) -> dict:
        """Inspect the visible document, components, current dimensions, dependencies, fits and recent activity."""
        state = get("/api/state")
        if activity_before is not None:
            state["actions"] = get(f"/api/activity?before={activity_before}&limit=250")["actions"]
        if component_id:
            document = state["document"]
            return {"revision": document["revision"], "component": document["components"].get(component_id),
                    "geometry": state["geometry"].get(component_id),
                    "parameters": {p: v for p, v in document["parameters"].items() if v["owner"] in {component_id, "root"}} if include_parameters else {},
                    "parameter_graph": state["parameter_graph"], "fits": state["fits"]}
        if not include_parameters:
            state["document"].pop("parameters", None)
            state.pop("parameter_graph", None)
        return state

    @server.tool()
    def cad_execute(name: str, args: dict, expected_revision: int, request_id: str | None = None, wait_seconds: float = 20) -> dict:
        """Perform one visible semantic CAD action. Reuse request_id only to retry the identical action. A complete result means durably saved; failed/pending results are not completion."""
        result = post("/api/commands", {"name": name, "args": args, "expected_revision": expected_revision, "request_id": request_id or str(uuid4())})
        return wait(result, wait_seconds)

    @server.tool()
    def cad_preview(name: str, args: dict, expected_revision: int) -> dict:
        """Evaluate a candidate without committing. Returns a revision-bound preview token and dimensional/geometry summary."""
        return wait(post("/api/previews", {"name": name, "args": args, "expected_revision": expected_revision, "request_id": str(uuid4())}), 20)

    @server.tool()
    def cad_commit_preview(preview_token: str) -> dict:
        """Commit this agent's validated preview if its base revision and write permission remain current."""
        return wait(post(f"/api/previews/{preview_token}/commit"), 20)

    @server.tool()
    def cad_job(job_id: str) -> dict:
        """Get a pending job's status, durable result, or actionable error."""
        return get(f"/api/jobs/{job_id}")

    @server.tool()
    def cad_cancel(job_id: str) -> dict:
        """Cancel this agent's own pending job. Previously saved revisions remain available."""
        return post(f"/api/jobs/{job_id}/cancel")

    @server.tool()
    def cad_measure(first_instance: str, second_instance: str) -> dict:
        """Measure static distance/intersection between two placed component occurrences in the live document."""
        return wait(post("/api/measure", {"first": first_instance, "second": second_instance}), 20)

    @server.tool()
    def cad_export_stl(expected_revision: int, instance_ids: list[str] | None = None, frame: str = "part", tolerance_mm: float = .03, angular_radians: float = .1) -> dict:
        """Validate and export selected physical instances to separate STL files with a receipt. Omitting IDs exports all manufactured instances. Files stay inside the project export directory."""
        return wait(post("/api/export", {"expected_revision": expected_revision, "instance_ids": instance_ids, "frame": frame, "tolerance": tolerance_mm, "angular": angular_radians}), 20)

    try:
        server.run(transport="stdio")
    finally:
        stopped.set()
        if pulse_thread is not None:
            pulse_thread.join(timeout=11)
        try:
            if pulse_thread is not None:
                client.post("/api/agents/disconnect")
        finally:
            client.close()


if __name__ == "__main__":
    main()

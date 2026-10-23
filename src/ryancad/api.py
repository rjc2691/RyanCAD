from __future__ import annotations

from contextlib import asynccontextmanager
import io
import json
from pathlib import Path
import secrets
import zipfile

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from . import __version__
from .commands import COMMANDS, FEATURE_FIELDS
from .errors import CadError
from .model import Actor, Command, ExportRequest, uid
from .service import CadService
from .storage import read_manifest


def create_app(project: Path, token: str, port: int = 8790, demo: str | None = None, frontend: Path | None = None, testing=False):
    service = CadService(project)
    cookie_name = f"ryancad_session_{port}"
    frontend = frontend or Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if not frontend.exists():
        frontend = Path(__file__).resolve().parent / "web"

    @asynccontextmanager
    async def lifespan(app):
        if demo and service.document.revision == 0 and not service.document.features:
            service.submit("command", Actor(id="reference-library", name="RyanCAD reference library", kind="system"),
                           command=Command(name="recipe.load", args={"recipe": demo}, expected_revision=0))
        else:
            service.submit("rebuild")
        yield
        service.close()

    app = FastAPI(title="RyanCAD local engine", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.service = service
    app.state.token = token

    @app.middleware("http")
    async def local_access(request: Request, call_next):
        host = request.headers.get("host", "")
        allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if testing:
            allowed_hosts.add("testserver")
        if host not in allowed_hosts:
            return JSONResponse({"error": {"code": "invalid_host", "message": "RyanCAD accepts local application hosts only."}}, status_code=403)
        origin = request.headers.get("origin")
        allowed_origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
        if testing:
            allowed_origins.add("http://testserver")
        if origin and origin not in allowed_origins:
            return JSONResponse({"error": {"code": "invalid_origin", "message": "This page is not authorized to control the local CAD service."}}, status_code=403)
        if int(request.headers.get("content-length", "0")) > 8_000_000:
            return JSONResponse({"error": {"code": "request_limit", "message": "The request exceeds the 8 MB limit."}}, status_code=413)
        if request.url.path.startswith("/api/") and request.url.path != "/api/health":
            bearer = request.headers.get("authorization", "").removeprefix("Bearer ")
            cookie = request.cookies.get(cookie_name, "")
            if not (secrets.compare_digest(bearer, token) or secrets.compare_digest(cookie, token)):
                return JSONResponse({"error": {"code": "unauthorized", "message": "Open RyanCAD locally or connect using the registered service token."}}, status_code=401)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.exception_handler(CadError)
    async def cad_error(request, error):
        return JSONResponse({"error": error.payload()}, status_code=409 if error.code in {"stale_revision", "idempotency_conflict"} else 400)

    @app.exception_handler(ValidationError)
    async def validation_error(request, error):
        return JSONResponse({"error": {"code": "invalid_request", "message": "The command or document failed schema validation.", "details": json.loads(error.json())}}, status_code=422)

    @app.exception_handler(zipfile.BadZipFile)
    async def bad_archive(request, error):
        return JSONResponse({"error": {"code": "invalid_archive", "message": "The native project archive is damaged or incomplete."}}, status_code=400)

    def actor_for(request):
        identifier = request.headers.get("x-ryancad-actor")
        if identifier:
            if identifier not in service.agents:
                raise CadError("unknown_session", "Register an external-agent session before submitting agent actions.")
            return service.agents[identifier]["actor"]
        if request.headers.get("authorization"):
            raise CadError("agent_session_required", "Bearer clients must register and use their external-agent session identity for mutations.")
        return Actor()

    @app.get("/api/health")
    def health():
        return {"application": "RyanCAD", "version": __version__, "status": "running"}

    @app.get("/api/state")
    def state():
        return service.state()

    @app.get("/api/capabilities")
    def capabilities():
        return {"schema_version": "0.2", "commands": COMMANDS, "feature_fields": FEATURE_FIELDS,
                "units": {"internal_length": "mm", "internal_angle": "deg", "export_length": "mm"},
                "session": {"document_id": service.document.id, "revision": service.document.revision},
                "limits": {"components": 250, "features": 2000, "batch_commands": 100, "sketch_entities": 200, "part_span_mm": 10000, "absolute_local_coordinate_mm": 10000},
                "export_validation": "OCCT validity; float32 STL closure/winding/degeneracy/material volume; BVH/SAT nonadjacent triangle intersections with 1e-7 mm tolerance (welded vertex-adjacent pairs excluded)."}

    @app.post("/api/commands")
    async def command(request: Request):
        payload = await request.json()
        return service.submit("command", actor_for(request), command=Command.model_validate(payload))

    @app.post("/api/previews")
    async def preview(request: Request):
        return service.submit("preview", actor_for(request), command=Command.model_validate(await request.json()))

    @app.post("/api/previews/{preview_token}/commit")
    def commit_preview(preview_token: str, request: Request):
        return service.submit("commit_preview", actor_for(request), token=preview_token)

    @app.get("/api/jobs/{job_id}")
    def job(job_id: str):
        if job_id not in service.jobs:
            raise CadError("missing_job", "This job no longer exists.")
        return {k: v for k, v in service.jobs[job_id].items() if k != "signature"}

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel(job_id: str, request: Request):
        if request.headers.get("x-ryancad-actor"):
            existing = service.jobs.get(job_id)
            if not existing or existing["actor"]["id"] != actor_for(request).id:
                raise CadError("not_owner", "An agent can cancel only its own jobs.")
        return service.cancel(job_id)

    @app.get("/api/events")
    def events(after: int = 0):
        with service.state_lock:
            return {"sequence": service.sequence, "reset": bool(service.events and after < service.events[0]["sequence"] - 1),
                    "events": [event for event in service.events if event["sequence"] > after]}

    @app.get("/api/activity")
    def activity(before: int | None = None, limit: int = 250):
        return {"actions": service.store.actions(limit, before)}

    @app.get("/api/geometry/{component_id}")
    def geometry(component_id: str, history_key: str | None = None, preview_token: str | None = None):
        return Response(service.mesh(component_id, history_key, preview_token), media_type="application/octet-stream", headers={"Cache-Control": "no-store"})

    @app.post("/api/history/{feature_id}")
    def history(feature_id: str):
        return service.submit("history", feature_id=feature_id)

    @app.get("/api/history/{feature_id}/cost")
    def history_cost(feature_id: str):
        if feature_id not in service.document.features:
            raise CadError("missing_feature", "This feature no longer exists.")
        prefix = service.document.feature_order[:service.document.feature_order.index(feature_id) + 1]
        timings = service.evaluation.get("timings", {})
        estimate = sum(timings.get(f, {}).get("last_compute_ms", 0) for f in prefix)
        key = f"{service.document.revision}:{feature_id}"
        return {"cached": key in service.history_cache, "estimated_ms": estimate, "explicit_compute_recommended": estimate >= 500 or any(f not in timings for f in prefix),
                "method": "Sum of last measured affected-prefix feature times; first computation may differ."}

    @app.post("/api/agents")
    async def register_agent(request: Request):
        # Agent registration requires the bearer capability, not only a browser cookie.
        if request.headers.get("authorization") != f"Bearer {token}":
            raise CadError("unauthorized", "Register external agents using the local service bearer token.")
        payload = await request.json()
        return service.register_agent(payload.get("name", "External agent")).model_dump()

    @app.post("/api/agents/{actor_id}/{operation}")
    def agent_control(actor_id: str, operation: str, request: Request):
        if request.headers.get("x-ryancad-actor") or request.headers.get("authorization"):
            raise CadError("human_control_required", "Agent controls are operated by the local human session.")
        return service.agent_control(actor_id, operation)

    @app.post("/api/agents/disconnect")
    def agent_disconnect(request: Request):
        actor = actor_for(request)
        if actor.kind != "agent":
            raise CadError("agent_session_required", "This endpoint closes an external-agent session.")
        service.agents[actor.id]["connected"] = False
        service.event("agent_disconnected", actor_id=actor.id)
        return {"ok": True}

    @app.post("/api/measure")
    async def measure(request: Request):
        payload = await request.json()
        return service.submit("measure", actor_for(request), first=payload["first"], second=payload["second"])

    @app.post("/api/export")
    async def export(request: Request):
        payload = ExportRequest.model_validate(await request.json())
        return service.submit("export", actor_for(request), **payload.model_dump())

    @app.get("/api/exports/{export_id}/{filename}")
    def export_file(export_id: str, filename: str):
        if not export_id.startswith("export_") or Path(filename).name != filename:
            raise CadError("invalid_path", "Choose a generated export file.")
        root = (service.store.directory / "exports" / export_id).resolve()
        if root.parent != (service.store.directory / "exports").resolve() or not (root / "receipt.json").exists():
            raise CadError("incomplete_export", "This export set did not complete.")
        target = (root / filename).resolve()
        if target.parent != root or not target.is_file():
            raise CadError("missing_export", "The generated file does not exist.")
        return FileResponse(target, filename=filename)

    @app.get("/api/exports/{export_id}")
    def export_zip(export_id: str):
        root = (service.store.directory / "exports" / export_id).resolve()
        if root.parent != (service.store.directory / "exports").resolve() or not (root / "receipt.json").exists():
            raise CadError("incomplete_export", "This export set did not complete.")
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for file in root.iterdir():
                if file.is_file() and file.suffix in {".stl", ".json"}:
                    archive.write(file, file.name)
        return Response(buffer.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="RyanCAD-{export_id}.zip"'})

    @app.get("/api/native")
    def native():
        target = service.store.directory / "project.rycad.zip"
        service.store.portable_snapshot(target)
        return FileResponse(target, filename=service.document.name.replace("/", "_") + ".rycad.zip", media_type="application/zip")

    @app.get("/api/manifest")
    def manifest():
        service.store.snapshot()
        return FileResponse(service.store.directory / "manifest.yaml", filename="manifest.yaml", media_type="application/yaml")

    @app.post("/api/import")
    async def import_native(request: Request):
        body = await request.body()
        if len(body) > 8_000_000:
            raise CadError("request_limit", "The native document exceeds the upload limit.")
        if body[:2] == b"PK":
            with zipfile.ZipFile(io.BytesIO(body)) as archive:
                names, total = set(), 0
                for entry in archive.infolist():
                    path = Path(entry.filename)
                    if path.is_absolute() or ".." in path.parts or entry.filename in names or "\\" in entry.filename:
                        raise CadError("invalid_archive", "The project archive contains unsafe or duplicate paths.")
                    names.add(entry.filename)
                    total += entry.file_size
                if total > 64_000_000 or "manifest.yaml" not in names:
                    raise CadError("invalid_archive", "The archive is too large or has no native manifest.")
                body = archive.read("manifest.yaml")
        target = service.store.directory / (uid("import") + ".yaml")
        try:
            target.write_bytes(body)
            document = read_manifest(target)
        finally:
            target.unlink(missing_ok=True)
        return service.submit("command", actor_for(request), command=Command(name="document.replace", expected_revision=service.document.revision, args={"document": document.model_dump(mode="json")}))

    if frontend.exists():
        app.mount("/assets", StaticFiles(directory=frontend / "assets"), name="assets")

    @app.get("/third-party-licenses.txt")
    def client_licenses():
        return FileResponse(frontend / "third-party-licenses.txt", media_type="text/plain")

    @app.get("/")
    def index():
        if not (frontend / "index.html").exists():
            return HTMLResponse("<h1>RyanCAD engine is running</h1><p>Build the frontend, then refresh this page.</p>")
        response = HTMLResponse((frontend / "index.html").read_text("utf-8"))
        response.set_cookie(cookie_name, token, httponly=True, samesite="strict", path="/")
        return response

    return app

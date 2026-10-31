from __future__ import annotations

from contextlib import asynccontextmanager
from contextvars import ContextVar
import io
import json
import hmac
import hashlib
import os
from pathlib import Path
import secrets
from urllib.parse import urlsplit
import zipfile

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from . import __version__
from .commands import COMMANDS, FEATURE_FIELDS
from .errors import CadError
from .model import Actor, Command, ExportRequest, uid
from .network import local_ipv4_addresses
from .service import CadService
from .storage import read_manifest
from .workspaces import WorkspaceManager
from .reports import ReportStore, ReportInput


class _RequestService:
    """Resolve existing endpoints to the service bound to this request."""
    def __init__(self):
        self.current: ContextVar[CadService | None] = ContextVar("ryancad_service", default=None)

    def __getattr__(self, name):
        current = self.current.get()
        if current is None:
            raise CadError("workspace_required", "Open RyanCAD in a browser or connect with a workspace code and design ID.")
        return getattr(current, name)


def create_app(project: Path, token: str, port: int = 8790, frontend: Path | None = None, testing=False, lan=False):
    cookie_name = f"ryancad_session_{port}"
    workspace_cookie = f"ryancad_workspace_{port}"
    owner_cookie = f"ryancad_browser_{port}"
    admin_cookie = f"ryancad_workspace_admin_{port}"
    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
    allowed_origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
    lan_urls = []
    if lan:
        for address in local_ipv4_addresses():
            allowed_hosts.add(f"{address}:{port}")
            lan_urls.append(f"http://{address}:{port}")
        allowed_origins.update(lan_urls)
    secure_public_host = None
    public_url = os.environ.get("RYANCAD_PUBLIC_URL", "")
    if public_url:
        try:
            url = urlsplit(public_url)
            url_port = url.port
            if (url.scheme not in {"http", "https"} or not url.hostname or url.username is not None
                    or url.password is not None or url.path not in {"", "/"} or url.query or url.fragment
                    or any(c.isspace() for c in url.netloc)):
                raise ValueError
        except ValueError:
            raise ValueError("RYANCAD_PUBLIC_URL must be an http(s) origin, such as https://cad.example.com") from None
        hostname = url.hostname.lower()
        host = f"[{hostname}]" if ":" in hostname else hostname
        if url_port is not None and url_port != (443 if url.scheme == "https" else 80):
            host += f":{url_port}"
        allowed_hosts.add(host)
        allowed_origins.add(f"{url.scheme}://{host}")
        if url.scheme == "https":
            secure_public_host = host
    if testing:
        allowed_hosts.add("testserver")
        allowed_origins.add("http://testserver")
    workspaces = WorkspaceManager(project)
    service = _RequestService()
    reports = ReportStore(project / "feedback")
    frontend = frontend or Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if not frontend.exists():
        frontend = Path(__file__).resolve().parent / "web"

    @asynccontextmanager
    async def lifespan(app):
        yield
        workspaces.close()

    app = FastAPI(title="RyanCAD local engine", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.workspaces = workspaces
    app.state.token = token
    app.state.lan_urls = lan_urls

    @app.middleware("http")
    async def local_access(request: Request, call_next):
        host = request.headers.get("host", "").lower()
        if host not in allowed_hosts:
            return JSONResponse({"error": {"code": "invalid_host", "message": "RyanCAD accepts configured application hosts only."}}, status_code=403)
        origin = request.headers.get("origin")
        if origin and origin not in allowed_origins:
            return JSONResponse({"error": {"code": "invalid_origin", "message": "This page is not authorized to control the local CAD service."}}, status_code=403)
        request_limit = 90_000_000 if request.url.path == "/api/workspace/folder/import" else 8_000_000
        if int(request.headers.get("content-length", "0")) > request_limit:
            return JSONResponse({"error": {"code": "request_limit", "message": f"The request exceeds the {request_limit // 1_000_000} MB transfer limit."}}, status_code=413)
        if request.url.path.startswith("/api/") and request.url.path != "/api/health":
            bearer = request.headers.get("authorization", "").removeprefix("Bearer ")
            cookie = request.cookies.get(cookie_name, "")
            if not (secrets.compare_digest(bearer, token) or secrets.compare_digest(cookie, token)):
                return JSONResponse({"error": {"code": "unauthorized", "message": "Open RyanCAD locally or connect using the registered service token."}}, status_code=401)
        workspace_code = request.cookies.get(workspace_cookie, "")
        if request.headers.get("authorization") == f"Bearer {token}":
            workspace_code = request.headers.get("x-ryancad-workspace", workspace_code)
        request.state.workspace_code = workspace_code
        request.state.design_id = None
        bound = None
        if request.url.path.startswith("/api/") and request.url.path != "/api/health" and not request.url.path.startswith(("/api/workspace", "/api/reports")):
            try:
                if workspace_code:
                    identifier = request.headers.get("x-ryancad-design") or request.query_params.get("design_id")
                    request.state.design_id, current = workspaces.acquire(workspace_code, identifier)
                    bound = service.current.set(current)
            except CadError as error:
                return JSONResponse({"error": error.payload()}, status_code=400)
        try:
            response = await call_next(request)
        finally:
            if bound is not None:
                service.current.reset(bound)
                workspaces.release(workspace_code, request.state.design_id)
        if request.state.design_id:
            response.headers["X-RyanCAD-Design"] = request.state.design_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
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

    @app.get("/api/reports")
    def list_reports():
        return {"reports": reports.list()}

    @app.post("/api/reports")
    def create_report(values: ReportInput):
        return reports.save(values)

    @app.get("/api/reports/{identifier}")
    def read_report(identifier: str):
        report = next((r for r in reports.list() if r["id"] == identifier), None)
        if not report:
            raise CadError("report_missing", "This report is no longer available.")
        return report

    @app.put("/api/reports/{identifier}")
    def update_report(identifier: str, values: ReportInput):
        return reports.save(values, identifier)

    @app.delete("/api/reports/{identifier}")
    def delete_report(identifier: str, version: int):
        reports.delete(identifier, version)
        return {"deleted": identifier}

    @app.get("/api/reports/{identifier}/images/{image_id}")
    def report_image(identifier: str, image_id: str):
        path, media = reports.image(identifier, image_id)
        return FileResponse(path, media_type=media)

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

    def workspace_code_for(request: Request):
        code = request.state.workspace_code
        if not workspaces.exists(code):
            raise CadError("missing_workspace", "Open RyanCAD in a browser or supply a valid workspace code.")
        return code

    def browser_owner(request: Request):
        owner = request.cookies.get(owner_cookie, "")
        if not workspaces.valid_code(owner):
            raise CadError("browser_required", "Refresh RyanCAD to initialize workspace management.")
        return owner

    def admin_signature(owner):
        return hmac.new(token.encode(), owner.encode(), hashlib.sha256).hexdigest()

    @app.get("/api/workspaces")
    def list_browser_workspaces(request: Request):
        owner = browser_owner(request)
        admin = secrets.compare_digest(request.cookies.get(admin_cookie, ""), admin_signature(owner))
        return {"admin": admin, "workspaces": workspaces.list_workspaces(owner, admin)}

    @app.post("/api/workspaces/admin")
    async def unlock_workspaces(request: Request):
        owner = browser_owner(request)
        payload = await request.json()
        if not isinstance(payload.get("password"), str) or not secrets.compare_digest(payload["password"], "ryan"):
            raise CadError("incorrect_password", "Incorrect admin password.")
        response = JSONResponse({"ok": True})
        response.set_cookie(admin_cookie, admin_signature(owner), max_age=3600, httponly=True, samesite="strict", path="/",
                            secure=bool(secure_public_host and request.headers.get("host", "").lower() == secure_public_host))
        return response

    @app.post("/api/workspaces/admin/lock")
    def lock_workspaces():
        response = JSONResponse({"ok": True})
        response.delete_cookie(admin_cookie, path="/")
        return response

    @app.post("/api/workspace/rename")
    async def rename_workspace(request: Request):
        body = await request.json()
        workspaces.rename_workspace(workspace_code_for(request), body.get("name"))
        return {"ok": True}

    @app.get("/api/workspace")
    def workspace(request: Request):
        return workspaces.describe(workspace_code_for(request))

    @app.get("/api/workspace/folder/export")
    def export_workspace_folder(request: Request):
        from .workspace_folders import export_folder
        return export_folder(workspaces, workspace_code_for(request))

    @app.post("/api/workspace/folder/import")
    async def import_workspace_folder(request: Request):
        from .workspace_folders import import_folder
        from starlette.concurrency import run_in_threadpool
        workspace_code_for(request)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 90_000_000:
                raise CadError("workspace_limit", "Folder transfers support at most 64 MB of files.")
        try:
            payload = json.loads(body)
        except ValueError as exc:
            raise CadError("invalid_workspace_folder", "Choose a valid RyanCAD workspace folder.") from exc
        result = await run_in_threadpool(import_folder, workspaces, payload)
        return result

    @app.post("/api/workspace/designs")
    async def create_design(request: Request):
        body = await request.json()
        identifier = workspaces.create(workspace_code_for(request), body.get("name", "Untitled design"))
        return {"design_id": identifier}

    @app.post("/api/workspace/designs/{identifier}/select")
    def select_design(identifier: str, request: Request):
        workspaces.select(workspace_code_for(request), identifier)
        return {"design_id": identifier}

    @app.post("/api/workspace/designs/{identifier}/rename")
    async def rename_design(identifier: str, request: Request):
        payload = await request.json()
        code = workspace_code_for(request)
        _, current = workspaces.acquire(code, identifier)
        bound = service.current.set(current)
        try:
            return current.submit("command", actor_for(request), command=Command(name="document.rename", args={"name": payload.get("name", "")}, expected_revision=current.document.revision))
        finally:
            service.current.reset(bound)
            workspaces.release(code, identifier)

    @app.post("/api/workspace/designs/{identifier}/delete")
    def delete_design(identifier: str, request: Request):
        return {"design_id": workspaces.delete(workspace_code_for(request), identifier)}

    @app.post("/api/workspace/designs/{identifier}/restore")
    def restore_design(identifier: str, request: Request):
        workspaces.restore(workspace_code_for(request), identifier)
        return {"ok": True}

    @app.post("/api/workspace/import")
    async def import_design(request: Request):
        return {"design_id": workspaces.import_native(workspace_code_for(request), await request.body())}

    @app.post("/api/workspace/recover")
    async def recover_workspace(request: Request):
        body = await request.json()
        code = str(body.get("code", "")).strip()
        if not workspaces.exists(code):
            raise CadError("missing_workspace", "This workspace could not be found. Check its recovery code.")
        workspaces.claim(code, browser_owner(request))
        response = JSONResponse({"ok": True})
        response.set_cookie(workspace_cookie, code, max_age=60 * 60 * 24 * 365 * 5, httponly=True, samesite="strict", path="/",
                            secure=bool(secure_public_host and request.headers.get("host", "").lower() == secure_public_host))
        return response

    @app.post("/api/workspace/new")
    async def new_workspace(request: Request):
        body = await request.body()
        payload = json.loads(body) if body else {}
        code = workspaces.create_workspace(browser_owner(request), payload.get("name", ""))
        response = JSONResponse({"ok": True})
        response.set_cookie(workspace_cookie, code, max_age=60 * 60 * 24 * 365 * 5, httponly=True, samesite="strict", path="/",
                            secure=bool(secure_public_host and request.headers.get("host", "").lower() == secure_public_host))
        return response

    @app.get("/api/state")
    def state():
        return service.state()

    @app.get("/api/capabilities")
    def capabilities():
        from .operations import OperationRequest
        return {"schema_version": "0.2", "commands": COMMANDS, "feature_fields": FEATURE_FIELDS,
                "operation_schema":OperationRequest.model_json_schema(),
                "units": {"internal_length": "mm", "internal_angle": "deg", "export_length": "mm"},
                "session": {"document_id": service.document.id, "revision": service.document.revision},
                "limits": {"components": 250, "features": 2000, "batch_commands": 100, "sketch_entities": 200, "part_span_mm": 10000, "absolute_local_coordinate_mm": 10000},
                "export_validation": "OCCT validity; float32 STL closure/winding/degeneracy/material volume; BVH/SAT nonadjacent triangle intersections with 1e-7 mm tolerance (welded vertex-adjacent pairs excluded)."}

    @app.get('/api/agents/setup')
    def agent_setup(request: Request):
        from .mcp_setup import codex_setup
        code=workspace_code_for(request)
        if not request.state.design_id:
            raise CadError('missing_design','Open a workspace design before copying the Codex setup.')
        return codex_setup(port,code,request.state.design_id,service.document.name)

    @app.post("/api/commands")
    async def command(request: Request):
        payload = await request.json()
        return service.submit("command", actor_for(request), command=Command.model_validate(payload))

    @app.post("/api/previews")
    async def preview(request: Request):
        return service.submit("preview", actor_for(request), command=Command.model_validate(await request.json()))

    @app.post("/api/sketch-preview")
    async def sketch_preview(request: Request):
        command = Command.model_validate(await request.json())
        if command.name not in {"sketch.create", "sketch.update"}:
            raise CadError("invalid_request", "A sketch preview requires sketch.create or sketch.update.")
        return service.submit("sketch_preview", actor_for(request), command=command)

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
        if feature_id=="origin":return {"cached":f"{service.document.revision}:origin" in service.history_cache,"estimated_ms":0,"explicit_compute_recommended":False}
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
        service.disconnect_agent(actor.id)
        return {"ok": True}

    @app.post("/api/agents/heartbeat")
    def agent_heartbeat(request: Request):
        actor = actor_for(request)
        if actor.kind != "agent":
            raise CadError("agent_session_required", "Heartbeat requires an external-agent session.")
        return service.heartbeat_agent(actor.id)

    @app.post("/api/measure")
    async def measure(request: Request):
        payload = await request.json()
        return service.submit("measure", actor_for(request), first=payload["first"], second=payload["second"])

    @app.post("/api/export")
    async def export(request: Request):
        payload = ExportRequest.model_validate(await request.json())
        return service.submit("export", actor_for(request), **payload.model_dump())

    @app.post("/api/import-geometry/{file_type}")
    async def import_geometry(file_type: str, request: Request):
        from .file_formats import stl_options, svg_entities
        body = await request.body()
        if not body or len(body)>8_000_000:
            raise CadError('request_limit', 'Choose a file no larger than 8 MB.')
        name = str(request.query_params.get('name', 'Imported geometry')).strip()[:100] or 'Imported geometry'
        try:
            revision = int(request.query_params.get('revision', '-1'))
        except ValueError:
            raise CadError('invalid_revision', 'Supply the current design revision.') from None
        if file_type == 'stl':
            command_name, args = 'feature.create', {'type':'mesh','name':name,'options':stl_options(body)}
        elif file_type == 'svg':
            command_name, args = 'sketch.create', {'name':name,'owner':'root','plane':'XY','entities':svg_entities(body)}
        else:
            raise CadError('unsupported_format', 'Choose STL or SVG.')
        return service.submit('command', actor_for(request), command=Command(name=command_name, args=args,
            expected_revision=revision))

    @app.post('/api/export-svg')
    async def export_svg(request: Request):
        from .file_formats import sketch_svg
        payload = await request.json()
        ids = payload.get('sketches', [])
        if not isinstance(ids,list) or not 1<=len(ids)<=200 or not all(isinstance(item,str) for item in ids) or len(set(ids))!=len(ids):
            raise CadError('invalid_selection','Select one or more distinct sketches.')
        with service.write_lock:
            if payload.get('expected_revision') != service.document.revision:
                raise CadError('stale_revision','The design changed. Reopen Export and try again.')
            files=[]
            for index, identifier in enumerate(ids):
                feature=service.document.features.get(identifier)
                solved=service.evaluation.get('sketches',{}).get(identifier)
                if not feature or feature.suppressed or not solved:
                    raise CadError('invalid_selection','Select an available sketch.')
                label=''.join(c if c.isalnum() or c in ' -_' else '_' for c in feature.name)[:70] or 'Sketch'
                files.append((f'{index+1:02d}-{label}.svg',sketch_svg(feature.name,solved['entities'])))
        if len(files)==1:
            return Response(files[0][1],media_type='image/svg+xml',headers={'Content-Disposition':'attachment; filename="sketch.svg"'})
        buffer=io.BytesIO()
        with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as archive:
            for name,data in files: archive.writestr(name,data)
        return Response(buffer.getvalue(),media_type='application/zip',headers={'Content-Disposition':'attachment; filename="sketches.zip"'})

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
    def index(request: Request):
        owner = request.cookies.get(owner_cookie, "")
        if not workspaces.valid_code(owner):
            owner = secrets.token_urlsafe(32)
        code = request.cookies.get(workspace_cookie, "")
        if not workspaces.exists(code):
            code = secrets.token_urlsafe(32)
            workspaces.ensure(code)
        workspaces.claim(code, owner)
        content = ((frontend / "index.html").read_text("utf-8") if (frontend / "index.html").exists()
                   else "<h1>RyanCAD engine is running</h1><p>Build the frontend, then refresh this page.</p>")
        response = HTMLResponse(content)
        response.set_cookie(owner_cookie, owner, max_age=60 * 60 * 24 * 365 * 5, httponly=True, samesite="strict", path="/",
                            secure=bool(secure_public_host and request.headers.get("host", "").lower() == secure_public_host))
        response.set_cookie(cookie_name, token, httponly=True, samesite="strict", path="/",
                            secure=bool(secure_public_host and request.headers.get("host", "").lower() == secure_public_host))
        response.set_cookie(workspace_cookie, code, max_age=60 * 60 * 24 * 365 * 5, httponly=True, samesite="strict", path="/",
                            secure=bool(secure_public_host and request.headers.get("host", "").lower() == secure_public_host))
        return response

    return app

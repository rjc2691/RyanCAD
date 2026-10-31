"""Portable, uncompressed workspace snapshots. No credentials or runtime caches."""
import base64
import binascii
import hashlib
import json
from pathlib import Path, PurePosixPath
import secrets
import shutil
import sqlite3

from .errors import CadError
from .projects import restore_project_files
from .workspaces import _DESIGN

LIMIT = 64_000_000
MAX_FILES = 5000


def valid_path(path):
    if not isinstance(path, str) or not path or len(path)>500 or "\\" in path or ":" in path:
        return False
    return not path.startswith("/") and all(p not in {"", ".", ".."} and not p.startswith(".") for p in path.split("/"))


def export_folder(manager, code):
    files, total = [], 0
    def add(path, data):
        nonlocal total
        total += len(data)
        if total > LIMIT or len(files) >= MAX_FILES:
            raise CadError("workspace_limit", "Folder transfers support at most 64 MB and 5,000 files.")
        files.append({"path": path, "data": base64.b64encode(data).decode("ascii"), "sha256": hashlib.sha256(data).hexdigest()})
    with manager.lock:
        metadata = manager._read(code)
        if len(metadata["designs"]) > 100:
            raise CadError("workspace_limit", "Folder transfers support at most 100 designs.")
        designs = []
        for entry in metadata["designs"]:
            identifier = entry["id"]
            # Deleted designs are retained for recovery too.
            current = manager.services.get((code, identifier))
            if current is None:
                from .service import CadService
                current = CadService(manager._directory(code) / identifier)
                close = True
            else:
                close = False
            try:
                with current.store.lock:
                    current.store.snapshot()
                    if current.store.error or current.store.snapshot_error:
                        raise CadError("snapshot_failed", current.store.error or current.store.snapshot_error)
                    backup = sqlite3.connect(":memory:")
                    try:
                        current.store.connection.backup(backup)
                        add(f"designs/{identifier}/journal.sqlite3", backup.serialize())
                    finally:
                        backup.close()
                    add(f"designs/{identifier}/manifest.yaml", (current.store.directory / "manifest.yaml").read_bytes())
                    designs.append({"id": identifier, "name": current.store._latest.name, "deleted": bool(entry.get("deleted"))})
                exports = current.store.directory / "exports"
                if exports.exists():
                    for file in sorted(exports.rglob("*")):
                        relative = file.relative_to(current.store.directory).as_posix()
                        if file.is_symlink() or not valid_path(relative):
                            raise CadError("invalid_path", "A design export contains an unsupported path.")
                        if file.is_file():
                            if file.stat().st_size + total > LIMIT:
                                raise CadError("workspace_limit", "Folder transfers support at most 64 MB.")
                            add(f"designs/{identifier}/{relative}", file.read_bytes())
            finally:
                if close:
                    current.close()
        manifest = {"format": "ryancad-workspace", "version": 1, "name": metadata.get("name", "Local Workspace"), "active_design": metadata["active_design"], "designs": designs,
                    "files": [{"path": f["path"], "sha256": f["sha256"]} for f in files]}
        add("workspace.json", json.dumps(manifest, indent=2).encode("utf-8"))
    return {"files": files, "design_count": len(designs)}


def import_folder(manager, payload):
    records = payload.get("files") if isinstance(payload, dict) else None
    if not isinstance(records, list) or not 1 <= len(records) <= MAX_FILES:
        raise CadError("invalid_workspace_folder", "Choose a RyanCAD workspace folder with workspace.json.")
    files, total, seen = {}, 0, set()
    for record in records:
        path = record.get("path") if isinstance(record, dict) else None
        if not valid_path(path) or path.casefold() in seen:
            raise CadError("invalid_path", "Workspace files have duplicate or unsupported paths.")
        seen.add(path.casefold())
        try:
            raw = base64.b64decode(record["data"], validate=True)
        except (KeyError, ValueError, TypeError, binascii.Error) as exc:
            raise CadError("invalid_workspace_folder", "A workspace file could not be read.") from exc
        total += len(raw)
        if total > LIMIT:
            raise CadError("workspace_limit", "Folder transfers support at most 64 MB.")
        files[path] = raw
    def check(condition):
        if not condition:
            raise ValueError("Invalid workspace snapshot")
    try:
        manifest = json.loads(files["workspace.json"])
        check(manifest["format"] == "ryancad-workspace" and manifest["version"] == 1)
        check(isinstance(manifest.get("name", "Local Workspace"), str) and 0 < len(manifest.get("name", "Local Workspace").strip()) <= 120)
        designs = manifest["designs"]
        check(isinstance(designs, list) and 1 <= len(designs) <= 100)
        ids = [d["id"] for d in designs]
        check(len(ids) == len(set(ids)) and all(isinstance(i,str) and _DESIGN.fullmatch(i) for i in ids))
        check(all(isinstance(d.get("deleted"), bool) for d in designs))
        check(any(d["id"] == manifest["active_design"] and not d["deleted"] for d in designs))
        indexed = manifest["files"]
        expected = {f["path"]: f["sha256"] for f in indexed}
        check(len(expected) == len(indexed) and set(expected) == set(files) - {"workspace.json"})
        for path, digest in expected.items():
            check(hashlib.sha256(files[path]).hexdigest() == digest)
            parts = PurePosixPath(path).parts
            check(len(parts) >= 3 and parts[0] == "designs" and parts[1] in ids)
            check(parts[2:] in [("manifest.yaml",), ("journal.sqlite3",)] or (parts[2] == "exports" and len(parts)>3))
        check(all(f"designs/{i}/{f}" in files for i in ids for f in ["manifest.yaml", "journal.sqlite3"]))
    except (AssertionError, KeyError, TypeError, ValueError, IndexError) as exc:
        raise CadError("invalid_workspace_folder", "The workspace is incomplete, modified or unsupported. No workspace was changed.") from exc
    code = secrets.token_urlsafe(32)
    with manager.lock:
        destination = manager._directory(code)
        destination.mkdir()
        try:
            names = set()
            for identifier in ids:
                prefix = f"designs/{identifier}/"
                doc = restore_project_files(files[prefix+"manifest.yaml"], files[prefix+"journal.sqlite3"], destination / identifier)
                from .service import validate_document
                if doc.structure_version != 1:
                    raise CadError("invalid_structure", "Every workspace design needs parts and at least one layout.")
                validate_document(doc)
                label = " ".join(doc.name.split()).casefold()
                if label in names:
                    raise CadError("duplicate_design_name", "The workspace contains duplicate design names.")
                names.add(label)
                for path, raw in files.items():
                    if path.startswith(prefix+"exports/"):
                        target = destination / identifier / path[len(prefix):]
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(raw)
            manager._write(code, {"version": 1, "name": manifest.get("name", "Local Workspace"), "recovery_code": code, "active_design": manifest["active_design"],
                                  "designs": [{"id": d["id"], "deleted": d["deleted"]} for d in designs]})
        except Exception:
            shutil.rmtree(destination)
            raise
    return {"workspace_code": code, "design_id": manifest["active_design"], "design_count": len(designs)}

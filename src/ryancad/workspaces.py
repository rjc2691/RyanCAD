"""Persistent browser workspaces and independent, revisioned design sessions."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import tempfile
import zipfile

import yaml

from .errors import CadError
from .model import Document
from .service import CadService
from .storage import atomic_text, platform_path, read_manifest
from .projects import restore_project


_CODE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
_DESIGN = re.compile(r"^design_[a-f0-9]{32}$")


class WorkspaceManager:
    """Map an opaque browser workspace to its own collection of project stores.

    The existing single-project service remains separate and can be copied on
    request. Every design has its own journal, worker, jobs and preview tokens.
    """

    def __init__(self, project: Path, legacy: CadService):
        self.root = platform_path(project.resolve().with_name(project.name + ".workspaces"))
        self.root.mkdir(parents=True, exist_ok=True)
        self.legacy = legacy
        self.lock = threading.RLock()
        self.services: dict[tuple[str, str], CadService] = {}
        self.in_flight: dict[tuple[str, str], int] = {}

    @staticmethod
    def valid_code(code: str) -> bool:
        return bool(_CODE.fullmatch(code or ""))

    def _directory(self, code: str) -> Path:
        if not self.valid_code(code):
            raise CadError("invalid_workspace", "The workspace code is invalid.")
        return platform_path(self.root / hashlib.sha256(code.encode("ascii")).hexdigest())

    def exists(self, code: str) -> bool:
        return self.valid_code(code) and (self._directory(code) / "workspace.json").is_file()

    def _read(self, code: str) -> dict:
        path = self._directory(code) / "workspace.json"
        if not path.is_file():
            raise CadError("missing_workspace", "This workspace could not be found. Check its recovery code.")
        try:
            value = json.loads(path.read_text("utf-8"))
            if not isinstance(value, dict) or value.get("version") != 1 or not isinstance(value.get("designs"), list):
                raise ValueError("unsupported workspace metadata")
            entries = value["designs"]
            ids = [entry.get("id") for entry in entries if isinstance(entry, dict)]
            if (len(ids) != len(entries) or len(ids) != len(set(ids)) or any(not isinstance(identifier, str) or not _DESIGN.fullmatch(identifier) for identifier in ids)
                    or not any(entry["id"] == value.get("active_design") and not entry.get("deleted") for entry in entries)):
                raise ValueError("invalid workspace design list")
            return value
        except (OSError, ValueError, TypeError) as exc:
            raise CadError("invalid_workspace", "Workspace metadata could not be read; the saved projects have not been changed.") from exc

    def _write(self, code: str, data: dict):
        atomic_text(self._directory(code) / "workspace.json", json.dumps(data, indent=2) + "\n")

    def ensure(self, code: str):
        with self.lock:
            if self.exists(code):
                return
            directory = self._directory(code)
            directory.mkdir(parents=True, exist_ok=True)
            identifier = self._new_project(directory, "Untitled design")
            self._write(code, {"version": 1, "recovery_code": code, "active_design": identifier,
                               "designs": [{"id": identifier, "deleted": False}]})

    @staticmethod
    def _new_project(directory: Path, name: str) -> str:
        identifier = "design_" + secrets.token_hex(16)
        project = directory / identifier
        project.mkdir()
        document = Document(name=name)
        atomic_text(project / "manifest.yaml", yaml.safe_dump(document.model_dump(mode="json"), sort_keys=False, allow_unicode=True))
        store = CadService(project)
        store.close()
        return identifier

    @staticmethod
    def _entry(data: dict, identifier: str, deleted: bool = False) -> dict:
        for entry in data["designs"]:
            if entry.get("id") == identifier and bool(entry.get("deleted")) == deleted:
                return entry
        raise CadError("missing_design", "This design is not available in this workspace. It may have been deleted.")

    def _name(self, code: str, identifier: str) -> str:
        service = self.services.get((code, identifier))
        if service:
            return service.document.name
        db = self._directory(code) / identifier / "journal.sqlite3"
        try:
            if not db.is_file():
                raise ValueError("missing journal")
            connection = sqlite3.connect(db)
            try:
                row = connection.execute("SELECT document FROM revisions ORDER BY revision DESC LIMIT 1").fetchone()
                return Document.model_validate_json(row[0]).name
            finally:
                connection.close()
        except (sqlite3.Error, ValueError, TypeError, IndexError) as exc:
            raise CadError("invalid_design", "A saved design could not be read. Its files have not been changed.") from exc

    def describe(self, code: str) -> dict:
        with self.lock:
            data = self._read(code)
            if not data.get("recovery_code"):
                data["recovery_code"] = code
                self._write(code, data)
            return {"active_design": data["active_design"], "workspace_code": code,
                    "designs": [{"id": entry["id"], "name": self._name(code, entry["id"]),
                                 "deleted": bool(entry.get("deleted"))} for entry in data["designs"]],
                    "legacy_available": bool(self.legacy.document.revision or self.legacy.document.features or self.legacy.document.instances)}

    def service(self, code: str, identifier: str | None = None) -> tuple[str, CadService]:
        with self.lock:
            data = self._read(code)
            identifier = identifier or data["active_design"]
            self._entry(data, identifier)
            key = (code, identifier)
            if key not in self.services:
                current = CadService(self._directory(code) / identifier)
                self.services[key] = current
                if current.document.features or current.document.instances:
                    current.submit("rebuild")
            return identifier, self.services[key]

    def acquire(self, code: str, identifier: str | None = None) -> tuple[str, CadService]:
        with self.lock:
            identifier, current = self.service(code, identifier)
            key = (code, identifier)
            self.in_flight[key] = self.in_flight.get(key, 0) + 1
            return identifier, current

    def release(self, code: str, identifier: str):
        with self.lock:
            key = (code, identifier)
            count = self.in_flight.get(key, 0)
            if count <= 1:
                self.in_flight.pop(key, None)
            else:
                self.in_flight[key] = count - 1

    def create(self, code: str, name: str = "Untitled design") -> str:
        name = str(name).strip()[:180] or "Untitled design"
        with self.lock:
            data = self._read(code)
            identifier = self._new_project(self._directory(code), name)
            data["designs"].append({"id": identifier, "deleted": False})
            data["active_design"] = identifier
            self._write(code, data)
            return identifier

    def copy_legacy(self, code: str) -> str:
        with self.lock, self.legacy.store.lock:
            data = self._read(code)
            identifier = "design_" + secrets.token_hex(16)
            directory = self._directory(code) / identifier
            directory.mkdir()
            target = sqlite3.connect(directory / "journal.sqlite3")
            try:
                self.legacy.store.connection.backup(target)
            finally:
                target.close()
            # Opening the backed-up journal writes its own consistent manifest.
            current = CadService(directory)
            current.close()
            data["designs"].append({"id": identifier, "deleted": False})
            data["active_design"] = identifier
            self._write(code, data)
            return identifier

    def import_native(self, code: str, body: bytes) -> str:
        """Import as a new project, preserving a full native journal when present."""
        if len(body) > 8_000_000:
            raise CadError("request_limit", "The native document exceeds the upload limit.")
        with self.lock:
            data = self._read(code)
            directory = self._directory(code)
            identifier = "design_" + secrets.token_hex(16)
            destination = directory / identifier
            with tempfile.TemporaryDirectory(prefix="upload-", dir=directory) as temporary:
                source = Path(temporary) / "upload"
                staging = Path(temporary) / "project"
                source.write_bytes(body)
                if body[:2] == b"PK":
                    with zipfile.ZipFile(source) as archive:
                        entries = archive.infolist()
                        names = [entry.filename for entry in entries]
                        if (len(names) != len(set(names)) or "manifest.yaml" not in names
                                or sum(entry.file_size for entry in entries) > 64_000_000
                                or any(Path(name).is_absolute() or ".." in Path(name).parts or "\\" in name for name in names)):
                            raise CadError("invalid_archive", "The project archive is unsafe, too large, or has no native manifest.")
                        full_snapshot = "journal.sqlite3" in names
                        if not full_snapshot:
                            manifest = Path(temporary) / "manifest.yaml"
                            manifest.write_bytes(archive.read("manifest.yaml"))
                    if full_snapshot:
                        restore_project(source, staging)
                    else:
                        document = read_manifest(manifest)
                        staging.mkdir()
                        atomic_text(staging / "manifest.yaml", yaml.safe_dump(document.model_dump(mode="json"), sort_keys=False, allow_unicode=True))
                else:
                    document = read_manifest(source)
                    staging.mkdir()
                    atomic_text(staging / "manifest.yaml", yaml.safe_dump(document.model_dump(mode="json"), sort_keys=False, allow_unicode=True))
                current = CadService(staging)
                current.close()
                os.replace(staging, destination)
            data["designs"].append({"id": identifier, "deleted": False})
            data["active_design"] = identifier
            self._write(code, data)
            return identifier

    def select(self, code: str, identifier: str):
        with self.lock:
            data = self._read(code)
            self._entry(data, identifier)
            data["active_design"] = identifier
            self._write(code, data)

    def delete(self, code: str, identifier: str) -> str:
        with self.lock:
            data = self._read(code)
            entry = self._entry(data, identifier)
            remaining = [item for item in data["designs"] if not item.get("deleted") and item["id"] != identifier]
            if not remaining:
                raise CadError("last_design", "Keep at least one design in the workspace. Create another before deleting this one.")
            current = self.services.get((code, identifier))
            if self.in_flight.get((code, identifier), 0) or (current and any(job["status"] in {"queued", "running", "waiting"} for job in list(current.jobs.values()))):
                raise CadError("design_busy", "Wait for this design's operations to finish before deleting it.")
            entry["deleted"] = True
            if data["active_design"] == identifier:
                data["active_design"] = remaining[0]["id"]
            self._write(code, data)
            return data["active_design"]

    def restore(self, code: str, identifier: str):
        with self.lock:
            data = self._read(code)
            self._entry(data, identifier, deleted=True)["deleted"] = False
            self._write(code, data)

    def close(self):
        with self.lock:
            services = list(self.services.values())
            self.services.clear()
        for service in services:
            service.close()

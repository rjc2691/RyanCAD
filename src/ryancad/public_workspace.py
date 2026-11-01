"""First-install seeds for the ordinary, persistent public workspace.

Templates are installation resources, never an alternate live catalog. After
initialization every read, edit and preview uses the workspace's project stores.
"""
from importlib.resources import files
import hashlib
import yaml

from .model import Document, now, uid
from .storage import ProjectStore, atomic_text

PUBLIC_WORKSPACE_CODE = "ryancad-public-workspace-default-v1"
PUBLIC_WORKSPACE_NAME = "RyanCAD Public Workspace"
PUBLIC_DESIGNS = {name: "design_" + hashlib.sha256(("ryancad-public-" + name).encode()).hexdigest()[:32]
                  for name in ("plate", "mold")}


def seed_document(name):
    if name not in PUBLIC_DESIGNS:
        raise ValueError("Unknown public workspace seed")
    resource = files("ryancad").joinpath("defaults", name + ".yaml")
    return Document.model_validate(yaml.safe_load(resource.read_text("utf-8")))


def initialize(manager):
    with manager.lock:
        if manager.exists(PUBLIC_WORKSPACE_CODE):
            return
        directory = manager._directory(PUBLIC_WORKSPACE_CODE)
        directory.mkdir(parents=True, exist_ok=True)
        for name, identifier in PUBLIC_DESIGNS.items():
            project = directory / identifier
            project.mkdir(exist_ok=True)
            # Resume an interrupted first initialization without replacing any
            # already-written journal, and never reseed an existing workspace.
            if not (project / "journal.sqlite3").exists():
                document = seed_document(name)
                document.id = uid("doc")
                document.created_at = document.modified_at = now()
                atomic_text(project / "manifest.yaml", yaml.safe_dump(document.model_dump(mode="json"), sort_keys=False, allow_unicode=True))
                store = ProjectStore(project)
                store.close()
        manager._write(PUBLIC_WORKSPACE_CODE, {
            "version": 1, "name": PUBLIC_WORKSPACE_NAME, "public": True,
            "created_at": now(), "recovery_code": PUBLIC_WORKSPACE_CODE,
            "active_design": PUBLIC_DESIGNS["plate"],
            "designs": [{"id": identifier, "deleted": False} for identifier in PUBLIC_DESIGNS.values()],
        })

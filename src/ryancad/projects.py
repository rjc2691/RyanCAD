"""Bounded native-archive restoration into a new project, including action history."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sqlite3
import zipfile

from .errors import CadError
from .model import Action, Document
from .storage import ProjectStore, read_manifest


def restore_project(archive_path: Path, destination: Path):
    if destination.exists():
        raise CadError("destination_exists", "Restore into a new project folder; existing projects are never overwritten.")
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)) or set(names) != {"manifest.yaml", "journal.sqlite3"} or sum(entry.file_size for entry in entries) > 128_000_000:
            raise CadError("invalid_archive", "Expected a bounded RyanCAD snapshot containing a manifest and durable journal.")
        manifest, database = archive.read("manifest.yaml"), archive.read("journal.sqlite3")
    return restore_project_files(manifest, database, destination)


def restore_project_files(manifest: bytes, database: bytes, destination: Path):
    """Restore the native pair without requiring a ZIP container."""
    if destination.exists():
        raise CadError("destination_exists", "Restore into a new project folder.")
    if len(manifest) > 8_000_000 or len(database) > 128_000_000:
        raise CadError("archive_limit", "The native snapshot exceeds the size limit.")
    # Validate using a fresh in-memory connection, then rebuild our known schema.
    # Never execute SQL text, triggers, or migration scripts supplied by an archive.
    source = sqlite3.connect(":memory:")
    try:
        source.deserialize(database)
        source.execute("PRAGMA query_only=ON")
        schema = list(source.execute("SELECT name,type FROM sqlite_master WHERE type NOT IN ('index')"))
        if set(schema) != {("revisions", "table"), ("meta", "table"), ("checkpoints", "table")}:
            raise CadError("invalid_archive", "The native journal contains unexpected schema objects.")
        if source.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise CadError("invalid_archive", "The native journal failed its integrity check.")
        rows = source.execute("SELECT revision,document,checksum,action,request_id,signature,result FROM revisions ORDER BY revision").fetchall()
        if not rows or len(rows) > 100000:
            raise CadError("archive_limit", "The native journal has an invalid or excessive revision count.")
        revisions = set()
        for revision, data, checksum, action, request, signature, result in rows:
            document = Document.model_validate_json(data)
            if revision != document.revision or revision in revisions or hashlib.sha256(data.encode()).hexdigest() != checksum:
                raise CadError("invalid_archive", "A journal revision failed identity/checksum validation.")
            revisions.add(revision)
            if action:
                Action.model_validate_json(action)
            if result:
                json.loads(result)
        meta = list(source.execute("SELECT key,value FROM meta"))
        for key, value in meta:
            if key not in {"undo", "redo"} or not isinstance(json.loads(value), list) or any(r not in revisions for r in json.loads(value)):
                raise CadError("invalid_archive", "The journal's undo/redo references are inconsistent.")
        checkpoints = list(source.execute("SELECT name,revision FROM checkpoints"))
        if any(revision not in revisions or len(name) > 120 for name, revision in checkpoints):
            raise CadError("invalid_archive", "The checkpoint references are inconsistent.")
    except (sqlite3.Error, ValueError, TypeError) as exc:
        raise CadError("invalid_archive", "The native snapshot could not be validated.", reason=str(exc)) from exc
    finally:
        source.close()
    destination.mkdir(parents=True)
    manifest_path = destination / "manifest.yaml"
    manifest_path.write_bytes(manifest)
    manifest_document = read_manifest(manifest_path)
    latest_document = Document.model_validate_json(rows[-1][1])
    if manifest_document.model_dump() != latest_document.model_dump():
        raise CadError("invalid_archive", "The native manifest and latest journal revision disagree.")
    store = ProjectStore(destination)
    try:
        with store.lock, store.connection:
            store.connection.execute("DELETE FROM revisions")
            store.connection.executemany("INSERT INTO revisions VALUES(?,?,?,?,?,?,?)", rows)
            store.connection.execute("DELETE FROM meta")
            store.connection.executemany("INSERT INTO meta VALUES(?,?)", meta)
            store.connection.executemany("INSERT INTO checkpoints VALUES(?,?)", checkpoints)
        store._latest = store.load()
        store.snapshot()
    finally:
        store.close()
    return latest_document

"""Durable, revisioned native projects with recoverable human-readable snapshots."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sqlite3
import threading
import time
import zipfile

import yaml

from .errors import CadError
from .model import Action, Document


class UniqueLoader(yaml.SafeLoader):
    pass


def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str) or key in result:
            raise CadError("invalid_document", "YAML mapping keys must be unique strings.")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def read_manifest(path: Path) -> Document:
    if path.stat().st_size > 8_000_000:
        raise CadError("document_limit", "The manifest exceeds the 8 MB limit.")
    text = path.read_text("utf-8")
    try:
        if any(isinstance(token, (yaml.tokens.AliasToken, yaml.tokens.AnchorToken, yaml.tokens.TagToken))
               for token in yaml.scan(text)):
            raise CadError("invalid_document", "YAML tags, anchors and aliases are not supported.")
        payload = yaml.load(text, Loader=UniqueLoader)
        return Document.model_validate(payload)
    except (yaml.YAMLError, ValueError, RecursionError) as exc:
        raise CadError("invalid_document", "The native manifest is malformed or unsupported.", reason=str(exc)) from exc


def atomic_text(path: Path, text: str):
    temporary = path.with_name(path.name + ".pending")
    with temporary.open("w", encoding="utf-8", newline="\n") as file:
        file.write(text)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary, path)


def platform_path(path: Path) -> Path:
    """Use Windows extended-length paths before nested project files get long."""
    path = Path(path).absolute()
    text = str(path)
    if os.name == "nt" and len(text) >= 180 and not text.startswith("\\\\?\\"):
        text = "\\\\?\\UNC\\" + text[2:] if text.startswith("\\\\") else "\\\\?\\" + text
        path = Path(text)
    return path.resolve()


class ProjectStore:
    def __init__(self, directory: Path):
        self.directory = platform_path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self._lock_file = (self.directory / ".session.lock").open("a+b")
        try:
            if os.name == "nt":
                import msvcrt
                self._lock_file.seek(0)
                if not self._lock_file.read(1):
                    self._lock_file.write(b"1")
                    self._lock_file.flush()
                self._lock_file.seek(0)
                msvcrt.locking(self._lock_file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self._lock_file.close()
            raise CadError("project_in_use", "This project is already open in another RyanCAD process.") from exc
        self.lock = threading.RLock()
        self.connection = sqlite3.connect(self.directory / "journal.sqlite3", check_same_thread=False)
        self.connection.execute("PRAGMA synchronous=FULL")
        self.connection.execute("PRAGMA journal_mode=DELETE")
        self.connection.executescript("""
            CREATE TABLE IF NOT EXISTS revisions (
                revision INTEGER PRIMARY KEY, document TEXT NOT NULL, checksum TEXT NOT NULL,
                action TEXT, request_id TEXT UNIQUE, signature TEXT, result TEXT
            );
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS checkpoints (name TEXT PRIMARY KEY, revision INTEGER NOT NULL);
        """)
        self.connection.commit()
        self.error: str | None = None
        self.snapshot_error: str | None = None
        manifest_path = self.directory / "manifest.yaml"
        self._snapshot_hash = hashlib.sha256(manifest_path.read_bytes()).hexdigest() if manifest_path.exists() else None
        self._latest: Document | None = None
        self._dirty_at: float | None = None
        self._first_dirty: float | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._snapshot_loop, name="ryancad-snapshot", daemon=True)
        if not self.connection.execute("SELECT 1 FROM revisions LIMIT 1").fetchone():
            manifest = self.directory / "manifest.yaml"
            document = read_manifest(manifest) if manifest.exists() else Document()
            document.revision = 0
            self.commit(document, None, "initial", "initial", {}, [], [])
        self._latest = self.load()
        self.snapshot()
        self._thread.start()

    def load(self, revision: int | None = None) -> Document:
        with self.lock:
            query = "SELECT document,checksum FROM revisions "
            row = self.connection.execute(query + ("ORDER BY revision DESC LIMIT 1" if revision is None else "WHERE revision=?"),
                                          () if revision is None else (revision,)).fetchone()
            if not row:
                raise CadError("missing_revision", "This saved revision does not exist.")
            if hashlib.sha256(row[0].encode()).hexdigest() != row[1]:
                raise CadError("corrupt_journal", "The saved revision checksum does not match. Restore a known-good project snapshot.")
            document = Document.model_validate_json(row[0])
            # Old files did not distinguish explicit named inputs from the
            # private value slots used by features and placements.
            explicit = set()
            for (action_text,) in self.connection.execute("SELECT action FROM revisions WHERE action IS NOT NULL AND revision <= ?", (document.revision,)):
                action = json.loads(action_text)
                if action.get("command") == "parameter.create":
                    explicit.update(action.get("affected", []))
            for p in document.parameters.values():
                if p.named is None:
                    p.named = p.id in explicit or p.category in {"Shared", "Shared standards", "Design inputs"}
            return document

    def stacks(self):
        with self.lock:
            rows = dict(self.connection.execute("SELECT key,value FROM meta"))
            return json.loads(rows.get("undo", "[]")), json.loads(rows.get("redo", "[]"))

    def request(self, identifier: str, signature: str):
        with self.lock:
            row = self.connection.execute("SELECT signature,result FROM revisions WHERE request_id=?", (identifier,)).fetchone()
            if not row:
                return None
            if row[0] != signature:
                raise CadError("idempotency_conflict", "This request ID was already used for a different command.")
            return json.loads(row[1])

    def commit(self, document: Document, action: Action | None, request_id: str, signature: str,
               result: dict, undo: list[int], redo: list[int], checkpoint: str | None = None):
        data = document.model_dump_json()
        with self.lock:
            try:
                with self.connection:
                    self.connection.execute("INSERT INTO revisions VALUES(?,?,?,?,?,?,?)", (
                        document.revision, data, hashlib.sha256(data.encode()).hexdigest(),
                        action.model_dump_json() if action else None, request_id, signature, json.dumps(result)))
                    self.connection.executemany("INSERT OR REPLACE INTO meta VALUES(?,?)",
                                                [("undo", json.dumps(undo)), ("redo", json.dumps(redo))])
                    if checkpoint:
                        self.connection.execute("INSERT OR REPLACE INTO checkpoints VALUES(?,?)", (checkpoint, document.revision))
            except sqlite3.Error as exc:
                self.error = str(exc)
                raise CadError("save_failed", "The edit could not be saved. The previous durable revision remains current.", reason=str(exc)) from exc
            self.error = None
            self._latest = document.model_copy(deep=True)
            self._dirty_at = time.monotonic()
            self._first_dirty = self._first_dirty or self._dirty_at

    def actions(self, limit=250, before=None):
        with self.lock:
            rows = self.connection.execute("SELECT action FROM revisions WHERE action IS NOT NULL AND revision < ? ORDER BY revision DESC LIMIT ?", (before if before is not None else 2**63-1, min(max(int(limit), 1), 500))).fetchall()
            return [json.loads(row[0]) for row in rows]

    def checkpoints(self):
        with self.lock:
            return [{"name": name, "revision": revision} for name, revision in self.connection.execute("SELECT name,revision FROM checkpoints ORDER BY revision DESC")]

    def checkpoint_revision(self, name):
        with self.lock:
            row = self.connection.execute("SELECT revision FROM checkpoints WHERE name=?", (name,)).fetchone()
            if not row:
                raise CadError("missing_checkpoint", f"Checkpoint '{name}' does not exist.")
            return row[0]

    def snapshot(self):
        with self.lock:
            if self._latest is None:
                return
            try:
                target = self.directory / "manifest.yaml"
                if target.exists() and self._snapshot_hash and hashlib.sha256(target.read_bytes()).hexdigest() != self._snapshot_hash:
                    self.snapshot_error = "The readable manifest was changed outside RyanCAD. Durable edits remain in the journal; the external file has not been overwritten. Import a copy or restore the expected manifest before snapshotting."
                    return
                data = yaml.safe_dump(self._latest.model_dump(mode="json"), sort_keys=False, allow_unicode=True)
                atomic_text(target, data)
                self._snapshot_hash = hashlib.sha256(target.read_bytes()).hexdigest()
                self.snapshot_error = None
                self._dirty_at = self._first_dirty = None
            except OSError as exc:
                self.snapshot_error = f"Journal saved; readable snapshot update failed: {exc}"

    def portable_snapshot(self, destination: Path):
        with self.lock:
            self.snapshot()
            if self.error or self.snapshot_error:
                raise CadError("snapshot_failed", self.error or self.snapshot_error)
            temporary = destination.with_suffix(destination.suffix + ".pending")
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.write(self.directory / "manifest.yaml", "manifest.yaml")
                backup = sqlite3.connect(":memory:")
                self.connection.backup(backup)
                archive.writestr("journal.sqlite3", backup.serialize())
                backup.close()
            os.replace(temporary, destination)

    def _snapshot_loop(self):
        while not self._stop.wait(.1):
            with self.lock:
                current = time.monotonic()
                if self._dirty_at and (current - self._dirty_at >= .5 or current - self._first_dirty >= 2):
                    self.snapshot()

    def close(self):
        self._stop.set()
        self._thread.join(timeout=3)
        with self.lock:
            self.snapshot()
            self.connection.close()
            self._lock_file.close()

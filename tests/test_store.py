import json
import sqlite3

import pytest

from ryancad.errors import CadError
from ryancad.model import Action, Actor, Document
from ryancad.storage import ProjectStore, read_manifest


def test_latest_acknowledged_revision_recovers_without_snapshot(tmp_path):
    store = ProjectStore(tmp_path)
    document = store.load()
    document.revision = 1
    document.name = "Durable edit"
    store.commit(document, Action(revision=1, actor=Actor(), command="rename", description="Rename", affected=[]), "request", "signature", {"saved": True}, [0], [])
    # Manifest intentionally lags: the journal must remain the recovery authority.
    assert read_manifest(tmp_path / "manifest.yaml").revision == 0
    recovered = store.load()
    assert recovered.name == "Durable edit"
    assert store.request("request", "signature") == {"saved": True}
    with pytest.raises(CadError) as exc:
        store.request("request", "other")
    assert exc.value.code == "idempotency_conflict"
    store.close()
    reopened = ProjectStore(tmp_path)
    assert reopened.load().name == "Durable edit"
    assert reopened.stacks() == ([0], [])
    reopened.close()


def test_duplicate_writer_is_rejected(tmp_path):
    store = ProjectStore(tmp_path)
    with pytest.raises(CadError) as exc:
        ProjectStore(tmp_path)
    assert exc.value.code == "project_in_use"
    store.close()


@pytest.mark.parametrize("text", ["name: first\nname: second\n", "x: &a [1,2]\ny: *a\n", "!!python/object:foo {}"])
def test_yaml_rejects_duplicate_keys_aliases_and_object_tags(tmp_path, text):
    path = tmp_path / "bad.yaml"
    path.write_text(text)
    with pytest.raises(CadError):
        read_manifest(path)


def test_failed_commit_preserves_previous_revision(tmp_path):
    store = ProjectStore(tmp_path)
    document = store.load()
    document.revision = 1
    store.connection.execute("PRAGMA query_only=ON")
    with pytest.raises(CadError) as exc:
        store.commit(document, None, "failed", "sig", {}, [0], [])
    assert exc.value.code == "save_failed"
    assert store.load().revision == 0
    store.connection.execute("PRAGMA query_only=OFF")
    store.close()


def test_external_manifest_edits_are_never_silently_overwritten(tmp_path):
    store = ProjectStore(tmp_path)
    path = tmp_path / "manifest.yaml"
    external = path.read_text("utf-8") + "\n# external editor note\n"
    path.write_text(external, "utf-8")
    store.snapshot()
    assert store.snapshot_error and "outside" in store.snapshot_error
    assert path.read_text("utf-8") == external
    assert store.load().revision == 0
    store.close()


def test_abrupt_process_exit_recovers_acknowledged_journal(tmp_path):
    import os
    import subprocess
    import sys
    script = """
import os,sys
from pathlib import Path
from ryancad.storage import ProjectStore
from ryancad.model import Action,Actor
s=ProjectStore(Path(sys.argv[1]))
d=s.load();d.revision=1;d.name='Acknowledged before crash'
s.commit(d,Action(revision=1,actor=Actor(),command='rename',description='Rename'),'ack','sig',{'saved':True},[0],[])
os._exit(0)
"""
    completed = subprocess.run([sys.executable, "-c", script, str(tmp_path / "crash-project")], check=False, capture_output=True, text=True)
    assert completed.returncode == 0, completed.stderr
    recovered = ProjectStore(tmp_path / "crash-project")
    assert recovered.load().name == "Acknowledged before crash"
    assert recovered.request("ack", "sig")["saved"]
    recovered.close()

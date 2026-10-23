from pathlib import Path
import zipfile

import pytest

from ryancad.errors import CadError
from ryancad.model import Action, Actor
from ryancad.projects import restore_project
from ryancad.storage import ProjectStore


def test_native_snapshot_restores_document_actions_undo_and_checkpoints(tmp_path):
    original = ProjectStore(tmp_path / "original")
    document = original.load()
    document.revision, document.name = 1, "Archived design"
    original.commit(document, Action(revision=1, actor=Actor(), command="rename", description="Rename"), "request", "sig", {"saved": True}, [0], [], "Named revision")
    archive = tmp_path / "portable.rycad.zip"
    original.portable_snapshot(archive)
    original.close()
    restored = restore_project(archive, tmp_path / "restored")
    assert restored.name == "Archived design"
    store = ProjectStore(tmp_path / "restored")
    assert store.actions()[0]["description"] == "Rename"
    assert store.stacks() == ([0], [])
    assert store.checkpoint_revision("Named revision") == 1
    store.close()


def test_archive_rejects_unsafe_entries_and_never_overwrites(tmp_path):
    path = tmp_path / "unsafe.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("../manifest.yaml", "malicious")
    with pytest.raises(CadError):
        restore_project(path, tmp_path / "new")
    assert not (tmp_path / "new").exists()
    existing = tmp_path / "existing"
    existing.mkdir()
    with pytest.raises(CadError) as exc:
        restore_project(path, existing)
    assert exc.value.code == "destination_exists"

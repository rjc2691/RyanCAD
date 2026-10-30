import time
import pytest
from ryancad.commands import reduce
from ryancad.errors import CadError
from ryancad.model import Actor, Command, Document
from ryancad.service import CadService


def execute(service, name, args=None):
    job = service.submit("command", command=Command(name=name, args=args or {}, expected_revision=service.document.revision))
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        result = service.jobs[job["job_id"]]
        if result["status"] == "complete":
            return result["result"]
        assert result["status"] not in {"failed", "cancelled"}, result.get("error")
        time.sleep(.02)
    raise AssertionError("Command timed out")


def test_design_settings_persist_and_undo_without_rescaling_geometry(tmp_path):
    path = tmp_path / "design.rycad"
    service = CadService(path)
    try:
        execute(service, "operation.create", {"values": {"width": 25.4, "height": 10, "distance": 5}})
        geometry = service.state()["summary"]
        execute(service, "document.describe", {"description": "  Mounting plate\nFirst prototype  "})
        assert service.document.notes == "Mounting plate\nFirst prototype"
        execute(service, "document.units", {"units": "in"})
        assert service.state()["summary"] == geometry
        execute(service, "history.undo")
        assert service.document.display_units == "mm"
        execute(service, "history.redo")
        assert service.document.display_units == "in"
    finally:
        service.close()
    reopened = CadService(path)
    try:
        assert reopened.document.notes == "Mounting plate\nFirst prototype"
        assert reopened.document.display_units == "in"
        reopened.evaluation = reopened.geometry.call("evaluate", payload=reopened.document.model_dump(mode="json"))
        assert reopened.state()["summary"] == geometry
    finally:
        reopened.close()


@pytest.mark.parametrize("value", [None, 42, {}, "x"*4001])
def test_invalid_description_leaves_existing_notes_unchanged(value):
    doc = Document(notes="Keep this description")
    with pytest.raises(CadError) as error:
        reduce(doc, Actor(), "document.describe", {"description": value})
    assert error.value.code == "invalid_description"
    assert doc.notes == "Keep this description"


def test_description_can_be_cleared():
    doc = Document(notes="Old description")
    reduce(doc, Actor(), "document.describe", {"description": ""})
    assert doc.notes == ""

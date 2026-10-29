import time

import pytest

from ryancad.service import CadService
from ryancad.model import Command, Actor, Document
from ryancad.commands import reduce
from ryancad.storage import ProjectStore


def execute(service, name, args, preview=False):
    job = service.submit("preview" if preview else "command", command=Command(name=name, args=args, expected_revision=service.document.revision))
    if job.get("status") == "complete": return job["result"]
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        state = service.jobs[job["job_id"]]
        if state["status"] in {"complete", "failed", "cancelled"}:
            assert state["status"] == "complete", state.get("error")
            return state["result"]
        time.sleep(.02)
    raise AssertionError("Timed out")


def test_world_reference_is_consumed_and_real_geometry_moves(tmp_path):
    service = CadService(tmp_path / "world")
    try:
        made = execute(service, "operation.create", {"profile": "circle", "origin": "reference", "reference": {"component": "root", "world": "origin"}, "values": {"diameter": 5, "distance": 5}})
        part, instance = made["component_id"], made["instance_id"]
        before = service.evaluation["components"][part]["bounds"]
        feature = service.document.features[made["feature_id"]]
        assert feature.options["reference_snapshot"]
        assert not feature.references
        execute(service, "instance.move", {"id": instance, "occurrence": instance, "method": "axes", "values": {"x": 10}})
        assert service.evaluation["components"][part]["bounds"] == before
        occurrence = next(o for o in service.state()["occurrences"] if o["id"] == instance)
        assert occurrence["matrix"][0][3] == pytest.approx(10)
        execute(service, "history.undo", {})
        assert next(o for o in service.state()["occurrences"] if o["id"] == instance)["matrix"][0][3] == 0
    finally:
        service.close()


def test_cross_component_body_is_a_snapshot_and_source_can_change_or_be_deleted(tmp_path):
    service = CadService(tmp_path / "cross")
    try:
        source = execute(service, "operation.create", {"values": {"width": 10, "height": 8, "distance": 5}})
        copied = execute(service, "operation.create", {"profile": "body", "motion": "none", "profile_reference": {"component": source["component_id"], "occurrence": source["instance_id"]}})
        part = copied["component_id"]
        original = service.evaluation["components"][part]["volume"]
        width = service.document.features[source["feature_id"]].parameters["width"]
        execute(service, "parameter.set", {"id": width, "value": 20})
        assert service.evaluation["components"][part]["volume"] == pytest.approx(original)
        execute(service, "component.delete", {"id": source["component_id"]})
        assert service.evaluation["components"][part]["volume"] == pytest.approx(original)
        service.geometry.cancel()  # Force a fresh native process with no source-shape cache.
        execute(service, "document.rename", {"name": "Detached copy"})
        assert service.evaluation["components"][part]["volume"] == pytest.approx(original)
    finally:
        service.close()


def test_only_explicit_named_values_are_reusable_and_local_dimensions_stay_independent(tmp_path):
    service = CadService(tmp_path / "named")
    try:
        named = execute(service, "parameter.create", {"name": "Wall width", "value": 10})["parameter_id"]
        a = execute(service, "operation.create", {"values": {"width": "[Wall width]", "height": 8, "distance": 5}})
        b = execute(service, "operation.create", {"values": {"width": 10, "height": 8, "distance": 5}})
        assert [p.id for p in service.document.parameters.values() if p.named] == [named]
        execute(service, "parameter.set", {"id": named, "value": 12})
        assert service.evaluation["components"][a["component_id"]]["volume"] == pytest.approx(480)
        assert service.evaluation["components"][b["component_id"]]["volume"] == pytest.approx(400)
        assert service.evaluation["components"][a["component_id"]]["named_extents"]["0"] == ["Wall width"]
        sketch = execute(service, "sketch.create", {"name": "Local sketch", "entities": [{"id": "line", "type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 0}], "constraints": [{"type": "distance", "a": "line.start", "b": "line.end", "value": "[Wall width]"}]})
        execute(service, "parameter.set", {"id": named, "value": 14})
        solved = service.evaluation["sketches"][sketch["feature_id"]]["entities"][0]
        import math
        assert math.dist(solved["start"], solved["end"]) == pytest.approx(14)
    finally:
        service.close()


@pytest.mark.parametrize("existing_offset", [0, 10])
def test_legacy_world_anchored_operation_migrates_before_movement(tmp_path, existing_offset):
    doc = Document()
    made, _, _ = reduce(doc, Actor(), "operation.create", {"profile": "circle", "origin": "reference", "reference": {"component": "root", "world": "origin"}})
    doc.features[made["feature_id"]].references["target_occurrence"] = made["instance_id"]
    if existing_offset:
        reduce(doc, Actor(), "instance.move", {"id": made["instance_id"], "method": "axes", "values": {"x": existing_offset}})
    store = ProjectStore(tmp_path / "legacy")
    doc.revision = 1
    store.commit(doc, None, "legacy", "legacy", {}, [], [])
    store.close()
    service = CadService(tmp_path / "legacy")
    try:
        execute(service, "instance.move", {"id": made["instance_id"], "method": "axes", "values": {"x": 5}})
        bounds = service.evaluation["components"][made["component_id"]]["bounds"]
        assert bounds["min"][0] == pytest.approx(-2.5 - existing_offset)
        assert next(o for o in service.state()["occurrences"] if o["id"] == made["instance_id"])["matrix"][0][3] == pytest.approx(5 + existing_offset)
        assert not service.document.features[made["feature_id"]].references
    finally:
        service.close()

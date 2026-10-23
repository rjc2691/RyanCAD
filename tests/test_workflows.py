import json
import struct
import time

import numpy as np
import pytest

from ryancad.geometry import validate_mesh
from ryancad.model import Actor, Command
from ryancad.service import CadService


def wait(service, submitted):
    if submitted.get("status") == "complete":
        return submitted["result"]
    until = time.monotonic() + 60
    while time.monotonic() < until:
        job = service.jobs[submitted["job_id"]]
        if job["status"] in {"complete", "failed", "cancelled"}:
            if job["status"] != "complete":
                raise AssertionError(job["error"])
            return job["result"]
        time.sleep(.02)
    raise AssertionError("Job timed out")


@pytest.fixture
def service(tmp_path):
    current = CadService(tmp_path / "design.rycad")
    yield current
    current.close()


def execute(service, name, args=None, actor=None, request_id=None):
    command = Command(name=name, args=args or {}, expected_revision=service.document.revision)
    if request_id:
        command.request_id = request_id
    return wait(service, service.submit("command", actor, command=command))


def test_plate_geometry_parameter_edit_linked_instances_undo_and_recovery(service):
    execute(service, "recipe.load", {"recipe": "plate"})
    state = service.state()
    assert state["summary"]["instances"] == 3
    assert state["summary"]["definitions"] == 2
    plate = next(c for c in service.document.components.values() if c.name == "Mounting plate")
    width = next(p for p in service.document.parameters.values() if p.name == "Plate length")
    volume = state["geometry"][plate.id]["volume"]
    execute(service, "checkpoint.create", {"name": "Original plate"})
    execute(service, "parameter.set", {"id": width.id, "value": "100 mm"})
    assert service.state()["geometry"][plate.id]["bounds"]["size"][0] == pytest.approx(100)
    assert service.state()["geometry"][plate.id]["volume"] > volume
    assert service.store.load().parameters[width.id].expression == "quantity(100, 'mm')"
    execute(service, "history.undo")
    assert service.state()["geometry"][plate.id]["bounds"]["size"][0] == pytest.approx(80)
    execute(service, "history.redo")
    assert service.state()["geometry"][plate.id]["bounds"]["size"][0] == pytest.approx(100)
    execute(service, "checkpoint.restore", {"name": "Original plate"})
    assert service.state()["geometry"][plate.id]["volume"] == pytest.approx(volume)


def test_preview_creation_commits_the_exact_validated_ids_and_ownership(service):
    command = Command(name="feature.create", args={"type": "box"}, expected_revision=0)
    proposed = wait(service, service.submit("preview", command=command))
    assert not service.document.features and not proposed["committed"]
    feature = proposed["changes"]["feature_id"]
    component = proposed["changes"]["component_id"]
    saved = wait(service, service.submit("commit_preview", token=proposed["preview_token"]))
    assert saved["feature_id"] == feature and component in service.evaluation["components"]
    assert service.document.features[feature].owner == component
    assert service.store.load().features[feature].owner == component


def test_initial_disconnected_addition_previews_automatic_component_but_regeneration_cannot_split(service):
    first = execute(service, "feature.create", {"type": "box"})
    command = Command(name="feature.create", args={"type": "box", "owner": first["component_id"], "values": {"x": 100}}, expected_revision=1)
    proposed = wait(service, service.submit("preview", command=command))
    assert proposed["changes"]["ownership_change"]["reason"] == "disconnected_addition"
    assert service.document.revision == 1 and len(service.document.components) == 2
    saved = wait(service, service.submit("commit_preview", token=proposed["preview_token"]))
    assert service.state()["summary"]["instances"] == 2
    assert saved["component_id"] != first["component_id"]
    assert len(service.document.components[first["component_id"]].feature_ids) == 1
    execute(service, "history.undo")
    assert service.state()["summary"]["instances"] == 1
    addition = execute(service, "feature.create", {"type": "box", "owner": first["component_id"], "values": {"length": 10, "x": 20}})
    position = service.document.features[addition["feature_id"]].parameters["x"]
    submitted = service.submit("command", command=Command(name="parameter.set", args={"id": position, "value": 100}, expected_revision=service.document.revision))
    with pytest.raises(AssertionError):
        wait(service, submitted)
    assert service.jobs[submitted["job_id"]]["error"]["code"] == "separate_components_required"
    assert service.state()["summary"]["instances"] == 1


def test_shared_parameter_edit_attributes_affected_features_to_human_without_erasing_creator(service):
    agent = service.register_agent("Part author")
    execute(service, "recipe.load", {"recipe": "mold"}, actor=agent)
    root = next(p for p in service.document.parameters.values() if p.name == "Concrete casting diameter")
    execute(service, "parameter.set", {"id": root.id, "value": 46})
    changed = [f for f in service.document.features.values() if f.modified_by == "local-human"]
    assert len(changed) >= 3
    assert all(f.created_by == agent.id for f in changed)
    assert all(f.id in service.store.actions()[0]["affected"] for f in changed)


def test_agent_authorship_stale_revision_and_duplicate_request(service):
    actor = service.register_agent("Test CAD agent")
    command = Command(name="recipe.load", args={"recipe": "plate"}, expected_revision=0, request_id="same-action")
    first = wait(service, service.submit("command", actor, command=command))
    second = wait(service, service.submit("command", actor, command=command))
    assert first == second
    assert service.document.revision == 1
    assert service.store.actions()[0]["actor"]["name"] == "Test CAD agent"
    assert all(f.created_by == actor.id for f in service.document.features.values())
    stale = service.submit("command", actor, command=Command(name="document.rename", args={"name": "Wrong"}, expected_revision=0))
    while service.jobs[stale["job_id"]]["status"] not in {"failed", "complete"}:
        time.sleep(.01)
    assert service.jobs[stale["job_id"]]["error"]["code"] == "stale_revision"
    assert service.document.revision == 1


def test_failed_geometry_keeps_last_durable_part(service):
    execute(service, "recipe.load", {"recipe": "plate"})
    radius = next(p for p in service.document.parameters.values() if p.name == "Standard edge fillet")
    revision = service.document.revision
    job = service.submit("command", command=Command(name="parameter.set", args={"id": radius.id, "value": "100 mm"}, expected_revision=revision))
    while service.jobs[job["job_id"]]["status"] not in {"failed", "complete"}:
        time.sleep(.01)
    assert service.jobs[job["job_id"]]["status"] == "failed"
    assert service.document.revision == revision
    assert service.store.load().revision == revision
    assert service.evaluation["values"][radius.id] == 3


def test_mold_batch_exports_independent_watertight_stls(service):
    execute(service, "recipe.load", {"recipe": "mold"})
    assert service.state()["summary"]["instances"] == 4
    exported = wait(service, service.submit("export", expected_revision=service.document.revision))
    assert len(exported["files"]) == 4
    directory = service.store.directory / "exports" / exported["export_id"]
    for filename in exported["files"]:
        data = (directory / filename).read_bytes()
        count = struct.unpack_from("<I", data, 80)[0]
        assert len(data) == 84 + 50 * count
        points = []
        for index in range(count):
            record = struct.unpack_from("<12fH", data, 84 + index * 50)
            points.extend([record[3:6], record[6:9], record[9:12]])
        mesh = validate_mesh(np.asarray(points), np.arange(count * 3).reshape(-1, 3))
        assert mesh["valid"], mesh
    receipt = json.loads((directory / "receipt.json").read_text())
    assert receipt["complete"] and receipt["units"] == "mm"


def test_linked_copy_becomes_independent_without_mutating_original(service):
    execute(service, "recipe.load", {"recipe": "plate"})
    state = service.state()
    pins = [i for i in state["occurrences"] if service.document.components[i["definition"]].name == "Alignment pin"]
    assert pins[0]["definition"] == pins[1]["definition"]
    result = execute(service, "component.independent", {"instance_id": pins[1]["source_id"]})
    assert result["component_id"] != pins[0]["definition"]
    assert service.document.instances[pins[0]["source_id"]].definition == pins[0]["definition"]
    assert service.state()["summary"]["definitions"] == 3


def test_revoked_agent_cannot_commit(service):
    actor = service.register_agent("Agent")
    service.agent_control(actor.id, "revoke")
    result = service.submit("command", actor, command=Command(name="document.rename", args={"name": "No"}, expected_revision=0))
    while service.jobs[result["job_id"]]["status"] not in {"failed", "complete"}:
        time.sleep(.01)
    assert service.jobs[result["job_id"]]["error"]["code"] == "agent_revoked"
    assert service.document.revision == 0


def test_component_patterns_remain_linked_and_regenerate_count(service):
    execute(service, "recipe.load", {"recipe": "plate"})
    state = service.state()
    pin = next(i for i in state["occurrences"] if service.document.components[i["definition"]].name == "Alignment pin")
    execute(service, "component.pattern", {"instance_id": pin["source_id"], "mode": "circular", "axis": "Z", "count": 4, "angle": 90})
    assert service.state()["summary"]["instances"] == 6
    pattern = service.document.instances[pin["source_id"]]
    execute(service, "parameter.set", {"id": pattern.pattern["count"], "value": 3})
    assert service.state()["summary"]["instances"] == 5
    generated = next(i for i in service.state()["occurrences"] if i["source_id"] == pin["source_id"] and i["pattern_index"] == 1)
    before = generated["matrix"]
    result = execute(service, "component.independent", {"instance_id": pin["source_id"], "pattern_index": 1})
    independent = next(i for i in service.state()["occurrences"] if i["definition"] == result["component_id"])
    assert np.asarray(independent["matrix"]) == pytest.approx(np.asarray(before))
    assert service.state()["summary"]["instances"] == 5


def test_static_placed_measurement_and_visibility_quantities(service):
    execute(service, "recipe.load", {"recipe": "plate"})
    state = service.state()
    plate = next(i for i in state["occurrences"] if service.document.components[i["definition"]].name == "Mounting plate")
    pin = next(i for i in state["occurrences"] if service.document.components[i["definition"]].name == "Alignment pin")
    measurement = wait(service, service.submit("measure", first=plate["id"], second=pin["id"]))
    assert measurement["intersection_volume"] == pytest.approx(0, abs=1e-6)
    assert measurement["distance"] == pytest.approx(0, abs=1e-6)  # shoulder touches the underside
    count, volume = state["summary"]["instances"], state["summary"]["volume_mm3"]
    execute(service, "instance.visibility", {"id": pin["source_id"], "visible": False})
    assert service.state()["summary"]["instances"] == count
    assert service.state()["summary"]["volume_mm3"] == pytest.approx(volume)


def test_nested_assembly_cycles_are_rejected_even_if_unreachable(service):
    first = execute(service, "component.create", {"name": "First", "kind": "assembly"})
    second = execute(service, "component.create", {"name": "Second", "kind": "assembly"})
    execute(service, "instance.reparent", {"id": first["instance_id"], "parent": second["component_id"]})
    job = service.submit("command", command=Command(name="instance.reparent", args={"id": second["instance_id"], "parent": first["component_id"]}, expected_revision=service.document.revision))
    while service.jobs[job["job_id"]]["status"] not in {"failed", "complete"}:
        time.sleep(.01)
    assert service.jobs[job["job_id"]]["error"]["code"] == "ownership_cycle"


def test_native_worker_cancel_and_restart_keeps_durable_state(service):
    command = Command(name="recipe.load", args={"recipe": "plate"}, expected_revision=0)
    submitted = service.submit("command", command=command)
    until = time.monotonic() + 10
    while service.geometry.status != "starting" and time.monotonic() < until:
        time.sleep(.005)
    assert service.geometry.status == "starting"
    service.cancel(submitted["job_id"])
    while service.current_actor is not None and time.monotonic() < until:
        time.sleep(.01)
    assert service.store.load().revision == 0
    execute(service, "recipe.load", {"recipe": "plate"})
    assert service.document.revision == 1
    assert service.state()["summary"]["instances"] == 3


def test_feature_rollback_is_cached_read_only_and_does_not_replace_live_geometry(service):
    execute(service, "recipe.load", {"recipe": "plate"})
    first = service.document.feature_order[0]
    current = service.document.revision
    live = service.evaluation
    historical = wait(service, service.submit("history", feature_id=first))
    repeated = wait(service, service.submit("history", feature_id=first))
    assert historical["history_key"] == repeated["history_key"]
    assert historical["history_key"] in service.history_cache
    assert service.document.revision == current and service.evaluation is live
    plate = service.document.features[first].owner
    assert historical["components"][plate]["volume"] > live["components"][plate]["volume"]


def test_step_mode_does_not_block_human_edits_and_resume_releases_agent(service):
    actor = service.register_agent("Observed agent")
    service.agent_control(actor.id, "step_mode")
    submitted = service.submit("command", actor, command=Command(name="document.rename", args={"name": "Agent design"}, expected_revision=0))
    time.sleep(.1)
    assert service.document.revision == 0
    execute(service, "document.rename", {"name": "Human design"})
    service.agent_control(actor.id, "resume")
    until = time.monotonic() + 10
    while service.jobs[submitted["job_id"]]["status"] not in {"failed", "complete"} and time.monotonic() < until:
        time.sleep(.01)
    assert service.jobs[submitted["job_id"]]["error"]["code"] == "stale_revision"
    assert service.document.name == "Human design"

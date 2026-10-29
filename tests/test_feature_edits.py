"""Historical edits retain recipe identity and validate the complete rebuild."""
import copy

import pytest

from ryancad.commands import reduce
from ryancad.errors import CadError
from ryancad.model import Actor, Document
from ryancad.parameters import evaluate
from test_api import client, wait


def test_edit_preserves_identity_order_and_named_values():
    doc = Document(); actor = Actor()
    shared = reduce(doc, actor, "parameter.create", {"name": "Thickness", "value": 6})[0]["parameter_id"]
    made = reduce(doc, actor, "operation.create", {"profile": "rectangle", "values": {"width": 40, "height": 30, "distance": {"parameter": shared}}})[0]
    feature = doc.features[made["feature_id"]]
    original_id = feature.parameters["width"]
    order = list(doc.feature_order)
    creator = feature.created_by
    other_actor = Actor(id="editor", name="Editor")
    result, _, _ = reduce(doc, other_actor, "feature.update", {"id": feature.id, "name": "Wider plate", "values": {"width": 50, "distance": 8}})
    assert result["feature_id"] == feature.id
    assert doc.feature_order == order
    assert doc.components[feature.owner].feature_ids == order
    assert feature.parameters["width"] == original_id
    assert feature.parameters["distance"] != shared
    assert evaluate(doc)[shared] == 6
    assert evaluate(doc)[feature.parameters["distance"]] == 8
    assert feature.created_by == creator and feature.modified_by == other_actor.id
    reduce(doc, actor, "feature.update", {"id": feature.id, "values": {"distance": "Thickness"}})
    assert feature.parameters["distance"] == shared


@pytest.mark.parametrize("edit,code", [
    ({"values": {"not_a_dimension": 3}}, "unknown_field"),
    ({"options": {"reference_snapshot": {}}}, "unsupported_edit"),
    ({"options": {"result": "bad"}}, "invalid_operation"),
    ({"options": {"reverse": "yes"}}, "invalid_value"),
    ({"options": {"extent": "bad"}}, "invalid_extent"),
    ({"owner": "another"}, "unknown_field"),
    ({"name": " "}, "invalid_name"),
])
def test_rejects_invalid_recipe_edits(edit, code):
    doc = Document(); actor = Actor()
    made = reduce(doc, actor, "operation.create", {"profile": "rectangle"})[0]
    with pytest.raises(CadError) as exc:
        reduce(doc, actor, "feature.update", {"id": made["feature_id"], **edit})
    assert exc.value.code == code


def command(client, name, args):
    revision = client.get("/api/state").json()["document"]["revision"]
    job = wait(client, client.post("/api/commands", json={"name": name, "args": args, "expected_revision": revision}))
    assert job["status"] == "complete", job
    return job["result"]


def preview(client, args):
    revision = client.get("/api/state").json()["document"]["revision"]
    return wait(client, client.post("/api/previews", json={"name": "feature.update", "args": args, "expected_revision": revision}))


def test_preview_commit_downstream_rebuild_cancel_undo_redo_and_persistence(client):
    made = command(client, "operation.create", {"name": "Plate", "profile": "rectangle", "values": {"width": 40, "height": 30, "distance": 6}})
    state = client.get("/api/state").json()
    top = next(f for f in state["geometry"][made["component_id"]]["faces"] if f["normal"][2] > .99)
    ref = {"component": made["component_id"], "occurrence": made["instance_id"], "face": top["signature"]}
    hole = command(client, "operation.create", {"name": "Hole", "target": made["component_id"], "target_occurrence": made["instance_id"], "profile": "circle", "result": "cut", "origin": "reference", "reference": ref, "profile_reference": ref, "plane": "face", "extent": "through", "values": {"diameter": 5}})
    before = client.get("/api/state").json()
    frozen = copy.deepcopy(before["document"]["features"][hole["feature_id"]])
    edit = preview(client, {"id": made["feature_id"], "values": {"width": 50}, "name": "Wider plate"})
    assert edit["status"] == "complete", edit
    candidate = edit["result"]
    volume = candidate["components"][made["component_id"]]["volume"]
    assert volume == pytest.approx(before["geometry"][made["component_id"]]["volume"] + 10 * 30 * 6)
    # An uncommitted preview (including one the user cancels) never changes disk/state.
    assert client.get("/api/state").json()["document"] == before["document"]
    committed = wait(client, client.post(f'/api/previews/{candidate["preview_token"]}/commit'))
    assert committed["status"] == "complete", committed
    after = client.get("/api/state").json()
    assert after["document"]["feature_order"] == before["document"]["feature_order"]
    assert after["document"]["features"][hole["feature_id"]] == frozen
    assert after["geometry"][made["component_id"]]["volume"] == pytest.approx(volume)
    assert after["actions"][0]["command"] == "feature.update"
    command(client, "history.undo", {})
    undone = client.get("/api/state").json()
    assert undone["geometry"][made["component_id"]]["volume"] == pytest.approx(before["geometry"][made["component_id"]]["volume"])
    command(client, "history.redo", {})
    assert client.get("/api/state").json()["geometry"][made["component_id"]]["volume"] == pytest.approx(volume)


def test_invalid_downstream_edit_retains_saved_design(client):
    made = command(client, "operation.create", {"profile": "rectangle", "values": {"width": 40, "height": 30, "distance": 6}})
    state = client.get("/api/state").json()
    edge = next(e for e in state["geometry"][made["component_id"]]["edges"] if abs(e["tangent"][2]) > .99)
    finish = command(client, "operation.create", {"target": made["component_id"], "profile": "fillet", "path_reference": {"component": made["component_id"], "edge": edge["signature"]}, "values": {"amount": 2}})
    before = client.get("/api/state").json()["document"]
    failed = preview(client, {"id": made["feature_id"], "values": {"width": 1}})
    assert failed["status"] == "failed", failed
    assert client.get("/api/state").json()["document"] == before
    valid = preview(client, {"id": finish["feature_id"], "values": {"amount": 1}})
    assert valid["status"] == "complete", valid


def test_legacy_dimensions_and_suppression_remain_editable(client):
    made = command(client, "feature.create", {"type": "box", "name": "Legacy box", "values": {"length": 20, "width": 10, "height": 5}})
    edited = preview(client, {"id": made["feature_id"], "values": {"height": 8}})
    assert edited["status"] == "complete", edited
    assert edited["result"]["components"][made["component_id"]]["volume"] == pytest.approx(1600)
    hidden = preview(client, {"id": made["feature_id"], "suppressed": True})
    assert hidden["status"] == "complete", hidden
    assert hidden["result"]["components"][made["component_id"]]["status"] == "draft"
    assert client.get("/api/state").json()["geometry"][made["component_id"]]["volume"] == pytest.approx(1000)

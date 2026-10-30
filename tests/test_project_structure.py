import numpy as np
import pytest

from ryancad.commands import reduce
from ryancad.errors import CadError
from ryancad.geometry import Evaluator
from ryancad.model import Actor, Document
from ryancad.parameters import evaluate
from ryancad.placements import flatten_instances
from ryancad.project_structure import normalize_structure, part_parameters, variation_definition
from ryancad.service import validate_document, CadService


def edit(doc, command, **args):
    result = reduce(doc, Actor(), command, args)[0]
    normalize_structure(doc, Actor())
    validate_document(doc)
    return result


def sample():
    d = Document()
    p = edit(d, "parameter.create", name="Width", value=20)["parameter_id"]
    body = edit(d, "component.create", name="Plate")
    feature = edit(d, "feature.create", owner=body["component_id"], type="box",
                   values={"length": {"parameter": p}, "width": 10, "height": 5})
    edit(d, "instance.transform", id=body["instance_id"], x=12, ry=30)
    before = flatten_instances(d, evaluate(d))[0]["matrix"]
    edit(d, "structure.enable")
    part = next(c for c in d.components.values() if c.structure_role == "part")
    return d, part, body, feature, p, before


def test_conversion_preserves_geometry_identity_and_world_placement():
    d, part, body, feature, p, before = sample()
    rows = flatten_instances(d, evaluate(d))
    placed = next(o for o in rows if o["definition"] == body["component_id"] and o["layout"])
    assert np.allclose(placed["matrix"], before)
    assert d.features[feature["feature_id"]].owner == body["component_id"]
    assert part_parameters(d, part.id) == [p]
    assert sum(o["definition"] == body["component_id"] and o["library"] for o in rows) == 1
    assert Document.model_validate_json(d.model_dump_json()) == d


def test_components_may_share_names_but_parts_cannot():
    d, part, *_ = sample()
    a = edit(d, "part.component.create", part=part.id, name="Body")
    b = edit(d, "part.component.create", part=part.id, name="Body")
    assert d.components[a["component_id"]].name == d.components[b["component_id"]].name
    with pytest.raises(CadError, match="unique"):
        edit(d, "part.create", name=part.name.upper())


def test_layouts_have_independent_placements_and_shared_geometry():
    d, part, body, feature, p, _ = sample()
    first_layout = d.active_layout
    edit(d, "layout.create", name="Second layout")
    placed = edit(d, "part.insert", part=part.id, placement={"x": 50})
    assert d.instances[placed["instance_id"]].parent == d.active_layout
    rows = flatten_instances(d, evaluate(d))
    assert {o["layout"] for o in rows if o["definition"] == body["component_id"] and not o["library"]} == {first_layout, d.active_layout}
    edit(d, "structure.remove", instance=placed["instance_id"])
    assert body["component_id"] in d.components
    assert len(d.features) == 1


def test_variations_share_features_and_only_override_their_part():
    d, part, body, feature, p, _ = sample()
    v = edit(d, "variation.create", part=part.id, name="Wide", overrides={p: 30})["variation_id"]
    edit(d, "part.insert", part=part.id, variation=v, placement={"y": 25})
    kernel = Evaluator()
    result = kernel.evaluate(d.model_dump(mode="json"))
    virtual = variation_definition(v, body["component_id"])
    assert result["components"][body["component_id"]]["volume"] == pytest.approx(1000)
    assert result["components"][virtual]["volume"] == pytest.approx(1500)
    assert len(d.features) == 1 and len(d.feature_order) == 1
    edit(d, "feature.update", id=feature["feature_id"], values={"height": 7})
    result = kernel.evaluate(d.model_dump(mode="json"))
    assert result["components"][body["component_id"]]["volume"] == pytest.approx(1400)
    assert result["components"][virtual]["volume"] == pytest.approx(2100)
    assert float(kernel.shapes[virtual].volume) == pytest.approx(2100)
    edit(d, "parameter.set", id=p, value=25)
    result = kernel.evaluate(d.model_dump(mode="json"))
    assert result["components"][body["component_id"]]["volume"] == pytest.approx(1750)
    assert result["components"][virtual]["volume"] == pytest.approx(2100)


@pytest.mark.parametrize("case", ["empty", "private", "unrelated", "dimension"])
def test_invalid_variations_rejected(case):
    d, part, body, feature, p, _ = sample()
    private = d.features[feature["feature_id"]].parameters["height"]
    unrelated = edit(d, "parameter.create", name="Unrelated", value=4)["parameter_id"]
    overrides = {"empty": {}, "private": {private: 3}, "unrelated": {unrelated: 3}, "dimension": {p: "20 deg"}}[case]
    with pytest.raises(CadError):
        edit(d, "variation.create", part=part.id, name="Bad", overrides=overrides)


def test_part_groups_reject_bodies_and_cycles_rejected():
    d, part, body, *_ = sample()
    group = edit(d, "partgroup.create")
    with pytest.raises(CadError, match="only parts"):
        candidate=d.model_copy(deep=True)
        edit(candidate, "component.create", parent=group["component_id"])
    with pytest.raises(CadError, match="itself|ancestors"):
        edit(d, "part.insert", part=part.id, parent=part.id)


def test_service_conversion_undo_and_variant_roundtrip(tmp_path):
    from ryancad.model import Command
    service = CadService(tmp_path / "project.rycad")
    # Service's public job interface exercises persistence, preview and undo.
    import time
    def run(command_name, **args):
        job = service.submit("command", command=Command(name=command_name,args=args,expected_revision=service.document.revision))
        deadline=time.monotonic()+40
        while service.jobs[job["job_id"]]["status"] in {"queued","running"} and time.monotonic()<deadline:
            time.sleep(.02)
        result=service.jobs[job["job_id"]]
        assert result["status"]=="complete",result
        return result["result"]
    try:
        run("structure.enable")
        part=run("part.create",name="Bracket")["component_id"]
        body=run("part.component.create",part=part)["component_id"]
        param=run("parameter.create",name="Height",value=10)["parameter_id"]
        run("feature.create",owner=body,type="box",values={"height":{"parameter":param}})
        run("part.insert",part=part)
        variation=run("variation.create",part=part,name="Tall",overrides={param:20})["variation_id"]
        run("part.insert",part=part,variation=variation)
        state=service.state()
        assert state["summary"]["instances"]==2
        assert state["summary"]["volume_mm3"]==pytest.approx(36000)
        assert variation_definition(variation,body) in state["document"]["components"]
        assert variation_definition(variation,body) not in service.document.components
        run("history.undo")
        assert service.state()["summary"]["instances"]==1
        run("history.redo")
        assert service.state()["summary"]["instances"]==2
        exported=service._export({"expected_revision":service.document.revision,"frame":"assembly"})
        assert len(exported["files"])==2
        saved=service.store.load()
        assert saved.variations[variation].overrides=={param:"20"}
    finally:
        service.close()


def test_delete_part_removes_placements_but_retains_child_geometry():
    d, part, body, feature, *_ = sample()
    edit(d, "part.delete", id=part.id)
    assert part.id not in d.components
    assert body["component_id"] in d.components
    assert feature["feature_id"] in d.features
    assert not any(i.definition == part.id or i.parent == part.id for i in d.instances.values())


def test_sketch_delete_removes_history_and_preserves_other_features():
    d = Document()
    made = edit(d, "sketch.create", name="Drawing", entities=[{"id":"c","type":"circle","x":0,"y":0,"radius":2,"fixed":True}])
    edit(d, "sketch.delete", id=made["feature_id"])
    assert made["feature_id"] not in d.features
    assert made["feature_id"] not in d.feature_order


def test_primitive_placement_creates_independent_parts_with_configured_dimensions():
    d=Document()
    edit(d,"structure.enable")
    first=edit(d,"part.primitive",shape="box",values={"length":12,"width":8,"height":3},place=True)
    second=edit(d,"part.primitive",shape="box",values={"length":20,"width":8,"height":3},place=True)
    assert first["component_id"] != second["component_id"]
    assert d.instances[first["instance_id"]].parent == d.active_layout
    features=[d.features[item["primitive_feature_id"]] for item in (first,second)]
    assert features[0].owner != features[1].owner
    values=evaluate(d)
    assert values[features[0].parameters["length"]]==12
    assert values[features[1].parameters["length"]]==20


def test_default_layout_names_are_numbered_independently_of_design():
    d=Document(name="Mounting plate")
    edit(d,"structure.enable")
    assert d.components[d.active_layout].name=="Layout 1"
    edit(d,"layout.create")
    assert d.components[d.active_layout].name=="Layout 2"
    edit(d,"layout.create",name="Print arrangement")
    assert d.components[d.active_layout].name=="Print arrangement"


def test_default_part_names_start_at_one_and_skip_existing_names():
    d=Document()
    edit(d,"structure.enable")
    first=edit(d,"part.create")
    assert d.components[first["component_id"]].name=="Part 1"
    edit(d,"part.create",name="Part 2")
    third=edit(d,"part.create")
    assert d.components[third["component_id"]].name=="Part 3"

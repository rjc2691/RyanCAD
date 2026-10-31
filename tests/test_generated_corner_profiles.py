import math
import pytest

from ryancad.commands import reduce
from ryancad.errors import CadError
from ryancad.geometry import Evaluator
from ryancad.model import Actor, Document
from test_operation_targets import scene, edit


@pytest.mark.parametrize("profile,area", [("fillet", 4-math.pi), ("chamfer", 2)])
@pytest.mark.parametrize("effect", ["cut", "intersect", "auto"])
def test_generated_profile_has_explicit_boolean_effect_and_shared_display_geometry(profile, area, effect):
    kernel, doc, part, edge, ref = scene()
    made = edit(doc, target=part["component_id"], profile=profile, result=effect, path_reference=ref, values={"amount":2})
    feature=doc.features[made["feature_id"]]
    assert feature.options["result"] == effect
    result=kernel.evaluate(doc.model_dump(mode="json"))
    volume=result["components"][part["component_id"]]["volume"]
    assert volume == pytest.approx(area*10 if effect=="intersect" else 4000-area*10, rel=1e-6)
    display=result["operation_displays"][feature.id]
    generated=display["tool_profile"]
    assert generated["id"] == f"generated:{feature.id}" and generated["temporary"]
    assert generated["area"] == pytest.approx(area)
    assert generated["loops"] == display["finish_section"]["loops"]
    assert generated["effect"] == "removed"
    if effect=="auto": assert result["operation_decisions"][feature.id]["mode"] == "cut"


def test_incompatible_effect_is_reported_instead_of_silently_rounding_anyway():
    kernel, doc, part, edge, ref = scene()
    edit(doc, target=part["component_id"], profile="fillet", result="add", path_reference=ref, values={"amount":2})
    with pytest.raises(CadError, match="Change Tool Effect to Remove Material") as error:
        kernel.evaluate(doc.model_dump(mode="json"))
    profile=error.value.details["operation_display"]["tool_profile"]
    assert profile["temporary"] and profile["loops"]
    assert profile["area"] == pytest.approx(4-math.pi)
    assert error.value.details["feature_values"]["amount"] == 2


@pytest.mark.parametrize("effect", ["add", "auto", "cut"])
def test_concave_path_uses_addition_only_when_requested(effect):
    kernel=Evaluator();doc=Document()
    part=edit(doc,profile="polygon",points=[[0,0],[20,0],[20,6],[6,6],[6,20],[0,20]],values={"distance":10})
    before=kernel.evaluate(doc.model_dump(mode="json"))["components"][part["component_id"]]
    edge=next(e for e in before["edges"] if abs(e["tangent"][2])>.99 and abs(e["center"][0]-6)<1e-6 and abs(e["center"][1]-6)<1e-6)
    made=edit(doc,target=part["component_id"],profile="fillet",result=effect,path_reference={"component":part["component_id"],"edge":edge["signature"]},values={"amount":2})
    if effect=="cut":
        with pytest.raises(CadError,match="Change Tool Effect to Add Material"):kernel.evaluate(doc.model_dump(mode="json"))
    else:
        result=kernel.evaluate(doc.model_dump(mode="json"))
        assert result["components"][part["component_id"]]["volume"]==pytest.approx(before["volume"]+(4-math.pi)*10)
        assert result["operation_displays"][made["feature_id"]]["tool_profile"]["effect"]=="added"


def test_old_ignored_effect_does_not_change_geometry_and_edit_upgrades_it():
    kernel, doc, part, edge, ref=scene()
    made=edit(doc,target=part["component_id"],profile="fillet",path_reference=ref,values={"amount":2})
    feature=doc.features[made["feature_id"]];feature.options.pop("corner_effect_version");feature.options["result"]="add"
    before=kernel.evaluate(doc.model_dump(mode="json"))["components"][part["component_id"]]["volume"]
    assert before==pytest.approx(4000-(4-math.pi)*10)
    reduce(doc,Actor(),"feature.update",{"id":feature.id,"values":{"amount":1}})
    result=kernel.evaluate(doc.model_dump(mode="json"))
    assert feature.options["corner_effect_version"]==1
    assert result["operation_decisions"][feature.id]["mode"]=="cut"
    assert result["components"][part["component_id"]]["volume"]==pytest.approx(4000-(1-math.pi/4)*10)

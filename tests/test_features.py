import pytest

from ryancad.commands import reduce
from ryancad.errors import CadError
from ryancad.geometry import Evaluator
from ryancad.model import Actor, Document
from ryancad.parameters import evaluate


@pytest.fixture(scope="module")
def evaluator():
    return Evaluator()


def edit(doc, name, args):
    return reduce(doc, Actor(), name, args)[0]


def test_extruded_profile_and_subsequent_sketch_cut_preserve_body(evaluator):
    doc = Document()
    rectangle = edit(doc, "feature.create", {"type": "rectangle", "values": {"length": 40, "width": 30}})
    owner = rectangle["component_id"]
    edit(doc, "feature.create", {"type": "extrude", "owner": owner, "references": {"profile": rectangle["feature_id"]}, "values": {"distance": 6}})
    circle = edit(doc, "feature.create", {"type": "circle", "owner": owner, "values": {"diameter": 10}})
    edit(doc, "feature.create", {"type": "extrude", "owner": owner, "references": {"profile": circle["feature_id"]}, "values": {"distance": 6}, "options": {"operation": "cut"}})
    output = evaluator.evaluate(doc.model_dump(mode="json"))["components"][owner]
    import math
    assert output["volume"] == pytest.approx(40 * 30 * 6 - math.pi * 25 * 6)


def test_disconnected_addition_cannot_silently_create_loose_bodies(evaluator):
    doc = Document()
    first = edit(doc, "feature.create", {"type": "box"})
    edit(doc, "feature.create", {"type": "box", "owner": first["component_id"], "values": {"x": 100}, "options": {"operation": "add"}})
    with pytest.raises(CadError) as exc:
        evaluator.evaluate(doc.model_dump(mode="json"))
    assert exc.value.code == "separate_components_required"


def test_chamfer_and_semantic_selection_count_guard(evaluator):
    doc = Document()
    first = edit(doc, "feature.create", {"type": "box"})
    finish = edit(doc, "feature.create", {"type": "chamfer", "owner": first["component_id"], "values": {"distance": 1}, "options": {"selector": {"group": "vertical"}}})
    result = evaluator.evaluate(doc.model_dump(mode="json"))
    assert result["bindings"][finish["feature_id"]]["expected_count"] == 4
    doc.features[finish["feature_id"]].options["selector"]["expected_count"] = 5
    with pytest.raises(CadError) as exc:
        evaluator.evaluate(doc.model_dump(mode="json"))
    assert exc.value.code == "ambiguous_reference"


def test_native_fixed_arc_and_closed_rectangle_sketch(evaluator):
    doc = Document()
    sketch = edit(doc, "sketch.create", {"entities": [
        {"id": "a", "type": "arc", "x": 0, "y": 0, "radius": 10, "start_angle": 0, "end_angle": 90, "fixed": True},
        {"id": "l1", "type": "line", "x1": 0, "y1": 10, "x2": 0, "y2": 0, "fixed": True},
        {"id": "l2", "type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 0, "fixed": True},
    ]})
    output = evaluator.evaluate(doc.model_dump(mode="json"))
    assert output["sketches"][sketch["feature_id"]]["fully_defined"]
    assert output["profiles"][sketch["feature_id"]]["status"] == "closed"
    assert not output["components"]  # A design sketch is construction, not a part.


def test_mirror_uses_source_component_geometry(evaluator):
    doc = Document()
    original = edit(doc, "feature.create", {"type": "box", "values": {"x": 30, "length": 10}})
    mirrored = edit(doc, "feature.create", {"type": "mirror", "references": {"component": original["component_id"]}, "options": {"plane": "YZ"}})
    result = evaluator.evaluate(doc.model_dump(mode="json"))
    assert result["components"][mirrored["component_id"]]["bounds"]["min"][0] == pytest.approx(-35)


def test_revolve_xz_profile_around_z(evaluator):
    doc = Document()
    profile = edit(doc, "sketch.create", {"owner": None, "plane": "XZ", "entities": [
        {"id": "a", "type": "line", "x1": 5, "y1": 0, "x2": 10, "y2": 0, "fixed": True},
        {"id": "b", "type": "line", "x1": 10, "y1": 0, "x2": 10, "y2": 10, "fixed": True},
        {"id": "c", "type": "line", "x1": 10, "y1": 10, "x2": 5, "y2": 10, "fixed": True},
        {"id": "d", "type": "line", "x1": 5, "y1": 10, "x2": 5, "y2": 0, "fixed": True}]})
    edit(doc, "feature.create", {"type": "revolve", "owner": profile["component_id"], "references": {"profile": profile["feature_id"]}, "values": {"angle": 360}, "options": {"axis": "Z"}})
    import math
    result = evaluator.evaluate(doc.model_dump(mode="json"))
    assert result["components"][profile["component_id"]]["volume"] == pytest.approx(math.pi * 75 * 10)


def test_top_face_edits_identify_the_actual_generating_feature(evaluator):
    doc = Document()
    base = edit(doc, "feature.create", {"type": "box", "values": {"height": 6}})
    addition = edit(doc, "feature.create", {"type": "box", "owner": base["component_id"], "values": {"length": 10, "width": 10, "height": 12, "z": 6}})
    result = evaluator.evaluate(doc.model_dump(mode="json"))["components"][base["component_id"]]
    top = next(face for face in result["faces"] if face.get("controlling_parameter"))
    assert top["controlling_parameter"] == doc.features[addition["feature_id"]].parameters["height"]


def test_hole_pattern_cannot_succeed_with_missing_requested_holes(evaluator):
    doc = Document()
    base = edit(doc, "feature.create", {"type": "box"})
    edit(doc, "feature.create", {"type": "holes", "owner": base["component_id"], "values": {"count_x": 2, "spacing_x": 100}})
    with pytest.raises(CadError) as exc:
        evaluator.evaluate(doc.model_dump(mode="json"))
    assert exc.value.code == "hole_outside_material"


def test_planar_cut_and_stock_preview_remain_one_planar_part(evaluator):
    import math
    from ryancad.parameters import graph
    from ryancad.service import validate_document
    doc = Document()
    plate = edit(doc, "feature.create", {"type": "rectangle", "values": {"length": 60, "width": 40}})
    owner = plate["component_id"]
    profile = edit(doc, "feature.create", {"type": "circle", "owner": owner, "values": {"diameter": 10}, "options": {"operation": "cut"}})
    stock = edit(doc, "component.stock", {"id": owner, "value": "3 mm", "preview": True})
    validate_document(doc)
    output = evaluator.evaluate(doc.model_dump(mode="json"))["components"][owner]
    assert output["thickness_preview"] and output["stock_thickness_mm"] == 3
    assert output["status"] == "planar" and output["solid_count"] == 0 and output["volume"] is None
    assert output["area"] == pytest.approx(2400 - math.pi * 25)
    assert output["bounds"]["size"][2] == 0
    assert graph(doc, evaluate(doc))["parameters"][stock["parameter_id"]]["use_count"] == 1
    edit(doc, "feature.create", {"type": "extrude", "owner": owner, "references": {"profile": profile["feature_id"]}, "values": {"distance": {"parameter": stock["parameter_id"]}}})
    output = evaluator.evaluate(doc.model_dump(mode="json"))["components"][owner]
    assert not output["thickness_preview"] and output["volume"] == pytest.approx((2400 - math.pi * 25) * 3)


def test_circle_profiles_respect_their_named_plane(evaluator):
    doc = Document()
    profile = edit(doc, "feature.create", {"type": "circle", "values": {"diameter": 20}, "options": {"plane": "XZ"}})
    edit(doc, "feature.create", {"type": "extrude", "owner": profile["component_id"], "references": {"profile": profile["feature_id"]}, "values": {"distance": 5}})
    size = evaluator.evaluate(doc.model_dump(mode="json"))["components"][profile["component_id"]]["bounds"]["size"]
    assert size == pytest.approx([20, 5, 20])


def test_identical_mesh_cache_does_not_share_controlling_parameter_identity(evaluator):
    doc = Document()
    a = edit(doc, "feature.create", {"type": "box"})
    b = edit(doc, "feature.create", {"type": "box"})
    result = evaluator.evaluate(doc.model_dump(mode="json"))["components"]
    for created in (a, b):
        top = next(face for face in result[created["component_id"]]["faces"] if face.get("controlling_parameter"))
        assert top["controlling_parameter"] == doc.features[created["feature_id"]].parameters["height"]

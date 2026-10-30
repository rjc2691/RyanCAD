import pytest
import math

from ryancad.errors import CadError
from ryancad.model import Actor, Document
from ryancad.parameters import evaluate
from ryancad.sketches import edit_sketch, solve_sketch


def sketch(entities, constraints=()):
    doc = Document()
    result, _, _ = edit_sketch(doc, Actor(), "sketch.create", {"entities": entities, "constraints": list(constraints)})
    feature = doc.features[result["feature_id"]]
    return doc, feature


@pytest.mark.parametrize("reverse_a", [False, True])
@pytest.mark.parametrize("reverse_b", [False, True])
@pytest.mark.parametrize("orientation", [-1, 1])
@pytest.mark.parametrize("angle", [60, 120, 270])
def test_positive_interior_angles_preserve_corner_side_and_endpoint_direction(reverse_a, reverse_b, orientation, angle):
    a = {"id": "a", "type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 0, "fixed": True}
    ray = math.radians(orientation * angle)
    b = {"id": "b", "type": "line", "x1": 0, "y1": 0, "x2": 10 * math.cos(ray), "y2": 10 * math.sin(ray)}
    for entity, reverse in [(a, reverse_a), (b, reverse_b)]:
        if reverse:
            entity["x1"], entity["x2"] = entity["x2"], entity["x1"]
            entity["y1"], entity["y2"] = entity["y2"], entity["y1"]
    frame = {"a": "end" if reverse_a else "start", "b": "end" if reverse_b else "start", "orientation": orientation}
    origin = "b.end" if reverse_b else "b.start"
    doc, feature = sketch([a, b], [{"type": "fix", "a": origin},
        {"type": "angle", "a": "a", "b": "b", "value": angle, "angle_frame": frame}])
    # Change the named dimension; the solver must retain the intended interior sector.
    constraint = feature.options["constraints"][1]
    pid = feature.parameters[constraint["parameter_key"]]
    doc.parameters[pid].expression = str(angle + 10)
    solved = solve_sketch(feature, evaluate(doc))["entities"][1]
    joint, other = (solved["end"], solved["start"]) if reverse_b else (solved["start"], solved["end"])
    measured = (orientation * math.degrees(math.atan2(other[1]-joint[1], other[0]-joint[0]))) % 360
    assert measured == pytest.approx(angle + 10, abs=1e-5)
    assert constraint["angle_frame"] == frame


def test_interior_angle_frame_survives_sketch_update_and_legacy_conversion():
    entities = [{"id": "a", "type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 0},
                {"id": "b", "type": "line", "x1": 10, "y1": 0, "x2": 5, "y2": -8.66}]
    doc, feature = sketch(entities, [{"type": "angle", "a": "a", "b": "b", "value": -120}])
    frame = {"a": "end", "b": "start", "orientation": 1}
    supplied = {**feature.options["constraints"][0], "value": 60, "angle_frame": frame}
    edit_sketch(doc, Actor(), "sketch.update", {"feature_id": feature.id, "entities": entities, "constraints": [supplied]})
    assert feature.options["constraints"][0]["angle_frame"] == frame
    solve_sketch(feature, evaluate(doc))

    supplied = {**feature.options["constraints"][0], "value": 65}
    edit_sketch(doc, Actor(), "sketch.update", {"feature_id": feature.id, "entities": entities, "constraints": [supplied]})
    assert feature.options["constraints"][0]["angle_frame"] == frame
    solve_sketch(feature, evaluate(doc))


@pytest.mark.parametrize("plane,axis", [("XY", "X"), ("XY", "Y"), ("XZ", "Z"), ("YZ", "Z")])
@pytest.mark.parametrize("angle", [0, 30, 90, 180])
def test_world_axis_angle_dimensions(plane, axis, angle):
    from ryancad.sketches import sketch_axis_direction
    # Start near the requested sector so this tests the same incremental edit as the UI.
    doc, feature = sketch([{"id": "a", "type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 3}], [
        {"type": "fix", "a": "a.start"}, {"type": "distance", "a": "a.start", "b": "a.end", "value": 10},
        {"type": "angle", "a": "a", "b": f"world:{axis}", "value": angle,
         "angle_frame": {"a": "start", "b": "start", "orientation": -1}}])
    feature.options["plane"] = plane
    x, y = sketch_axis_direction(feature, axis)
    theta = math.atan2(y, x) + math.radians(angle + (1 if angle < 180 else -1))
    for key, value in [("a.x2", 10*math.cos(theta)), ("a.y2", 10*math.sin(theta))]:
        doc.parameters[feature.parameters[key]].expression = str(value)
    solved = solve_sketch(feature, evaluate(doc))["entities"][0]
    dx, dy = [end-start for start, end in zip(solved["start"], solved["end"])]
    measured = math.degrees(math.acos(max(-1, min(1, (dx*x+dy*y)/math.hypot(dx, dy)))))
    assert measured == pytest.approx(angle, abs=1e-4)
    assert len(feature.options["entities"]) == 1  # World-axis references are not extra sketch entities.


def test_axis_angles_on_tilted_plane_use_true_3d_angle_and_reject_impossible_values():
    q = 2**-.5
    doc, feature = sketch([{"id": "a", "type": "line", "x1": 0, "y1": 0, "x2": 8, "y2": 5}], [
        {"type": "fix", "a": "a.start"},
        {"type": "angle", "a": "a", "b": "world:X", "value": 60,
         "angle_frame": {"a": "start", "b": "start", "orientation": -1}}])
    feature.options["frame"] = {"origin": [0, 0, 0], "u": [q, 0, q], "normal": [-q, 0, q]}
    solved = solve_sketch(feature, evaluate(doc))["entities"][0]
    dx, dy = [end-start for start, end in zip(solved["start"], solved["end"])]
    assert math.degrees(math.acos(q*dx/math.hypot(dx, dy))) == pytest.approx(60, abs=1e-5)
    pid = feature.parameters[feature.options["constraints"][1]["parameter_key"]]
    doc.parameters[pid].expression = "20"
    with pytest.raises(CadError, match="45.00 to 135.00"):
        solve_sketch(feature, evaluate(doc))


def test_perpendicular_axis_cannot_constrain_in_plane_line_direction():
    doc, feature = sketch([{"id": "a", "type": "line", "x1": 0, "y1": 0, "x2": 8, "y2": 5}], [
        {"type": "angle", "a": "a", "b": "world:Z", "value": 90,
         "angle_frame": {"a": "start", "b": "start", "orientation": -1}}])
    with pytest.raises(CadError, match="perpendicular"):
        solve_sketch(feature, evaluate(doc))


def test_legacy_named_angle_converts_to_interior_without_rewriting_shared_parameter():
    entities = [{"id": "a", "type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 0},
                {"id": "b", "type": "line", "x1": 10, "y1": 0, "x2": 5, "y2": -8.66}]
    doc, feature = sketch(entities, [{"type": "angle", "a": "a", "b": "b", "value": -120}])
    prior = feature.options["constraints"][0]
    source = feature.parameters[prior["parameter_key"]]
    doc.parameters[source].named = True
    doc.parameters[source].name = "Corner turn"
    edit_sketch(doc, Actor(), "sketch.update", {"feature_id": feature.id, "entities": entities,
        "constraints": [{**prior, "value": "([Corner turn]) + 180 deg",
                         "angle_frame": {"a": "end", "b": "start", "orientation": 1}}]})
    values = evaluate(doc)
    target = feature.parameters[feature.options["constraints"][0]["parameter_key"]]
    assert values[target] == pytest.approx(60)
    assert values[source] == pytest.approx(-120)
    solve_sketch(feature, values)


def test_native_solver_fully_defines_line_with_length_horizontal_and_anchor():
    doc, feature = sketch([{"id": "line", "type": "line", "x1": 0, "y1": 0, "x2": 8, "y2": 2}], [
        {"type": "fix", "a": "line.start"}, {"type": "horizontal", "a": "line"},
        {"type": "distance", "a": "line.start", "b": "line.end", "value": 10}])
    result = solve_sketch(feature, evaluate(doc))
    assert result["fully_defined"]
    assert result["entities"][0]["end"] == pytest.approx([10, 0])


def test_native_solver_reports_unconstrained_freedom():
    doc, feature = sketch([{"id": "line", "type": "line", "x1": 0, "y1": 0, "x2": 8, "y2": 2}])
    assert solve_sketch(feature, evaluate(doc))["degrees_of_freedom"] == 4


def test_conflicting_constraints_do_not_produce_success():
    doc, feature = sketch([{"id": "line", "type": "line", "x1": 0, "y1": 0, "x2": 8, "y2": 2}], [
        {"type": "distance", "a": "line.start", "b": "line.end", "value": 10},
        {"type": "distance", "a": "line.start", "b": "line.end", "value": 20}])
    with pytest.raises(CadError) as exc:
        solve_sketch(feature, evaluate(doc))
    assert exc.value.code == "constraint_conflict"


@pytest.mark.parametrize("kind", ["parallel", "perpendicular", "equal", "angle"])
def test_line_constraint_corpus_uses_actual_solver(kind):
    constraints = [{"type": kind, "a": "a", "b": "b", **({"value": 45} if kind == "angle" else {})}]
    doc, feature = sketch([
        {"id": "a", "type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 0, "fixed": True},
        {"id": "b", "type": "line", "x1": 0, "y1": 3, "x2": 7, "y2": 7},
    ], constraints)
    result = solve_sketch(feature, evaluate(doc))
    assert result["solver"].startswith("PlaneGCS")
    line = result["entities"][1]
    dx, dy = [end - start for start, end in zip(line["start"], line["end"])]
    if kind == "parallel":
        assert dy == pytest.approx(0, abs=1e-6)
    elif kind == "perpendicular":
        assert dx == pytest.approx(0, abs=1e-6)
    elif kind == "equal":
        assert (dx * dx + dy * dy) ** .5 == pytest.approx(10)
    else:
        assert abs(abs(dx) - abs(dy)) < 1e-6


def test_circle_tangency_and_diameter_are_consistent():
    doc, feature = sketch([
        {"id": "a", "type": "line", "x1": -20, "y1": 0, "x2": 20, "y2": 0, "fixed": True},
        {"id": "c", "type": "circle", "x": 0, "y": 6, "radius": 4},
    ], [{"type": "diameter", "a": "c", "value": 10}, {"type": "tangent", "a": "c", "b": "a"}])
    circle = solve_sketch(feature, evaluate(doc))["entities"][1]
    assert circle["radius"] == pytest.approx(5)
    assert abs(circle["center"][1]) == pytest.approx(5)


def test_equal_arc_circle_is_order_independent_and_arc_radius_is_dimensional():
    doc, feature = sketch([
        {"id": "c", "type": "circle", "x": 0, "y": 0, "radius": 5, "fixed": True},
        {"id": "a", "type": "arc", "x": 20, "y": 0, "radius": 3, "start_angle": 0, "end_angle": 90},
    ], [{"type": "equal", "a": "a", "b": "c"}])
    result = solve_sketch(feature, evaluate(doc))
    assert result["entities"][1]["radius"] == pytest.approx(5)


def test_degenerate_line_produces_specific_failure():
    doc, feature = sketch([{"id": "a", "type": "line", "x1": 0, "y1": 0, "x2": 0, "y2": 0}])
    with pytest.raises(CadError) as exc:
        solve_sketch(feature, evaluate(doc))
    assert exc.value.code == "degenerate_sketch"

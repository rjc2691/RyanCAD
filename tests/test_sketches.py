import pytest

from ryancad.errors import CadError
from ryancad.model import Actor, Document
from ryancad.parameters import evaluate
from ryancad.sketches import edit_sketch, solve_sketch


def sketch(entities, constraints=()):
    doc = Document()
    result, _, _ = edit_sketch(doc, Actor(), "sketch.create", {"entities": entities, "constraints": list(constraints)})
    feature = doc.features[result["feature_id"]]
    return doc, feature


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

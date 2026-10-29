import pytest

from ryancad.commands import parameter, reduce
from ryancad.errors import CadError
from ryancad.model import Actor, Document
from ryancad.parameters import bind_expression, evaluate, graph


def test_units_and_derived_dimensions_remain_linked_after_rename():
    doc, actor = Document(), Actor()
    width = parameter(doc, actor, "root", "Width", "2 in", named=True)
    half = parameter(doc, actor, "root", "Half width", "[Width]/2")
    assert evaluate(doc)[width] == pytest.approx(50.8)
    assert evaluate(doc)[half] == pytest.approx(25.4)
    reduce(doc, actor, "parameter.rename", {"id": width, "name": "Overall width"})
    assert evaluate(doc)[half] == pytest.approx(25.4)
    assert graph(doc, evaluate(doc))["parameters"][half]["roots"] == [width]


def test_equal_numbers_are_independent_until_explicit_reuse():
    doc, actor = Document(), Actor()
    first = parameter(doc, actor, "root", "First", 5)
    second = parameter(doc, actor, "root", "Second", 5)
    assert first != second
    doc.parameters[first].expression = "8 mm"
    assert evaluate(doc)[second] == 5


@pytest.mark.parametrize("expression", ["__import__('os').system('echo bad')", "(1).__class__", "[p for p in []]", "open('x')"])
def test_expression_language_cannot_execute_python(expression):
    doc = Document()
    with pytest.raises(CadError):
        parameter(doc, Actor(), "root", "Unsafe", expression)
        evaluate(doc)


def test_dimensional_mismatch_and_cycles_are_actionable():
    doc, actor = Document(), Actor()
    length = parameter(doc, actor, "root", "Width", 20)
    angle = parameter(doc, actor, "root", "Angle", "90 deg", "angle")
    bad = parameter(doc, actor, "root", "Bad", f"{length}+{angle}")
    with pytest.raises(CadError, match="matching dimensions"):
        evaluate(doc)
    doc.parameters.pop(bad)
    doc.parameters[length].expression = length
    with pytest.raises(CadError) as error:
        evaluate(doc)
    assert error.value.code == "dependency_cycle"


def test_fit_tolerance_is_unspecified_until_both_limits_are_supplied():
    from ryancad.model import Fit, Tolerance
    doc, actor = Document(), Actor()
    pin = parameter(doc, actor, "root", "Pin", 6)
    socket = parameter(doc, actor, "root", "Socket", 6.3)
    doc.fits["fit"] = Fit(id="fit", name="Fit", pin_parameter=pin, socket_parameter=socket)
    assert graph(doc, evaluate(doc))["fits"][0]["limits"] is None
    doc.parameters[pin].tolerance = Tolerance(minus=.1, plus=.1)
    doc.parameters[socket].tolerance = Tolerance(minus=.1, plus=.1)
    assert graph(doc, evaluate(doc))["fits"][0]["limits"] == pytest.approx([.1, .5])


def test_scoped_duplicate_names_cannot_rebind_independent_parts():
    from ryancad.model import Component
    doc, actor = Document(), Actor()
    doc.components["left"] = Component(id="left", name="Left")
    doc.components["right"] = Component(id="right", name="Right")
    first = parameter(doc, actor, "left", "Thickness", 4, named=True)
    second = parameter(doc, actor, "right", "Thickness", 8, named=True)
    left_derived = parameter(doc, actor, "left", "Half", "[Thickness]/2")
    right_derived = parameter(doc, actor, "right", "Half", "[Thickness]/2")
    assert evaluate(doc)[left_derived] == 2
    assert evaluate(doc)[right_derived] == 4
    assert bind_expression("[Right::Thickness]", doc) == second
    with pytest.raises(CadError) as exc:
        bind_expression("[Thickness]", doc)
    assert exc.value.code == "ambiguous_parameter"
def test_shared_dependency_dag_traces_roots_without_repeated_exponential_expansion():
    from ryancad.commands import reduce
    from ryancad.model import Actor, Document
    from ryancad.parameters import evaluate, graph
    doc = Document()
    inputs = []
    for index in range(45):
        value = "1" if index < 2 else f"({inputs[-1]} + {inputs[-2]}) / 2"
        result, _, _ = reduce(doc, Actor(), "parameter.create", {"name": f"Dependency {index}", "kind": "ratio", "value": value})
        inputs.append(result["parameter_id"])
    result = graph(doc, evaluate(doc))["parameters"]
    assert set(result[inputs[-1]]["roots"]) == set(inputs[:2])
    assert result[inputs[-1]]["value"] == 1


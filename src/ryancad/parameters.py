"""A deliberately bounded, dimensional expression language. No eval/exec."""
from __future__ import annotations

import ast
import math
import operator
import re
from dataclasses import dataclass
from functools import lru_cache

from .errors import CadError
from .model import Document, Parameter

KINDS = {"length": (1, 0), "angle": (0, 1), "count": (0, 0), "ratio": (0, 0)}
UNITS = {"mm": (1., (1, 0)), "cm": (10., (1, 0)), "m": (1000., (1, 0)),
         "in": (25.4, (1, 0)), "inch": (25.4, (1, 0)), "ft": (304.8, (1, 0)),
         "deg": (1., (0, 1)), "rad": (180 / math.pi, (0, 1))}
UNIT_RE = re.compile(r"(?<![\w.])((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm|cm|inch|in|ft|deg|rad|m)\b")


@dataclass(frozen=True)
class Quantity:
    value: float
    dim: tuple[int, int] = (0, 0)


def parse_tree(expression: str):
    if len(expression) > 1000:
        raise CadError("expression_limit", "Expressions are limited to 1,000 characters.")
    text = UNIT_RE.sub(lambda m: f"quantity({m[1]}, '{m[2]}')", expression.strip())
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError as exc:
        raise CadError("invalid_expression", "Use a number, a parameter, or a dimensional expression.", expression=expression) from exc
    if sum(1 for _ in ast.walk(tree)) > 150:
        raise CadError("expression_limit", "This expression is too complex.")
    return tree


FUNCTIONS = {"quantity", "abs", "min", "max", "sqrt", "sin", "cos", "tan"}


def dependencies(expression: str) -> set[str]:
    return {n.id for n in ast.walk(parse_tree(expression)) if isinstance(n, ast.Name) and n.id not in FUNCTIONS | {"pi"}}


def bind_expression(expression: str | int | float, document: Document, owner: str = "root") -> str:
    """Bind readable parameter names to stable IDs once, preserving rename safety."""
    text = str(expression).strip()
    def bracket_reference(match):
        label = match[1]
        if "::" in label:
            scope, label = label.split("::", 1)
            candidates = [p for p in document.parameters.values() if p.name == label and
                          document.components.get(p.owner) and document.components[p.owner].name == scope]
        else:
            candidates = [p for p in document.parameters.values() if p.name == label]
            local = [p for p in candidates if p.owner == owner]
            candidates = local or candidates
        if len(candidates) != 1:
            raise CadError("ambiguous_parameter" if candidates else "unknown_parameter", f"The parameter reference [{match[1]}] is not unique in this scope. Use its stable ID.", candidates=[p.id for p in candidates])
        return candidates[0].id
    text = re.sub(r"\[([^\]]+)\]", bracket_reference, text)
    tree = parse_tree(text)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Name) or node.id in FUNCTIONS | {"pi"}:
            continue
        if node.id in document.parameters:
            continue
        candidates = [p for p in document.parameters.values()
                      if re.sub(r"\W+", "_", p.name).strip("_").lower() == node.id.lower()]
        local = [p for p in candidates if p.owner == owner]
        candidates = local or candidates
        if len(candidates) != 1:
            raise CadError("unknown_parameter" if not candidates else "ambiguous_parameter",
                           f"Parameter '{node.id}' is not uniquely identified. Use its ID or [exact name].",
                           candidates=[p.id for p in candidates])
        node.id = candidates[0].id
    return ast.unparse(tree.body).replace("quantity(", "quantity(")


def evaluate(document: Document) -> dict[str, float]:
    resolved: dict[str, Quantity] = {}
    visiting: list[str] = []

    def resolve(identifier: str) -> Quantity:
        if identifier in resolved:
            return resolved[identifier]
        if identifier in visiting:
            raise CadError("dependency_cycle", "Parameters cannot depend on themselves.", cycle=visiting + [identifier])
        if identifier not in document.parameters:
            raise CadError("missing_parameter", f"Parameter {identifier} no longer exists.")
        visiting.append(identifier)
        if len(visiting) > 100:
            raise CadError("dependency_limit", "Parameter dependency chains are limited to 100 levels.")
        parameter = document.parameters[identifier]
        try:
            result = node_value(parse_tree(parameter.expression).body)
            expected = KINDS[parameter.kind]
            # A unitless literal is expressed in canonical mm/degrees for its declared kind.
            if result.dim == (0, 0) and not dependencies(parameter.expression):
                result = Quantity(result.value, expected)
            if result.dim != expected:
                raise CadError("unit_mismatch", f"'{parameter.name}' requires a {parameter.kind} expression.", actual_dimension=result.dim)
            if not math.isfinite(result.value) or abs(result.value) > 1e9:
                raise CadError("value_out_of_range", f"'{parameter.name}' must be finite and within the supported size range.")
            if parameter.kind == "count" and (not result.value.is_integer() or not 1 <= result.value <= 1000):
                raise CadError("invalid_count", f"'{parameter.name}' must be an integer from 1 to 1,000.")
            resolved[identifier] = result
            return result
        finally:
            visiting.pop()

    def same(args):
        if not args or any(a.dim != args[0].dim for a in args):
            raise CadError("unit_mismatch", "This operation requires quantities with matching dimensions.")

    def node_value(node) -> Quantity:
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return Quantity(float(node.value))
        if isinstance(node, ast.Name):
            return Quantity(math.pi) if node.id == "pi" else resolve(node.id)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            value = node_value(node.operand)
            return Quantity((-1 if isinstance(node.op, ast.USub) else 1) * value.value, value.dim)
        if isinstance(node, ast.BinOp):
            left, right = node_value(node.left), node_value(node.right)
            if isinstance(node.op, (ast.Add, ast.Sub)):
                same([left, right])
                return Quantity((operator.add if isinstance(node.op, ast.Add) else operator.sub)(left.value, right.value), left.dim)
            if isinstance(node.op, (ast.Mult, ast.Div)):
                sign = 1 if isinstance(node.op, ast.Mult) else -1
                if sign == -1 and abs(right.value) < 1e-15:
                    raise CadError("division_by_zero", "A parameter expression divides by zero.")
                return Quantity(left.value * right.value if sign == 1 else left.value / right.value,
                                tuple(a + sign * b for a, b in zip(left.dim, right.dim)))
            if isinstance(node.op, ast.Pow) and right.dim == (0, 0) and right.value.is_integer() and abs(right.value) <= 4:
                return Quantity(left.value ** right.value, tuple(int(v * right.value) for v in left.dim))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
            name = node.func.id
            if name == "quantity" and len(node.args) == 2 and isinstance(node.args[1], ast.Constant):
                unit = node.args[1].value
                if unit not in UNITS:
                    raise CadError("unknown_unit", f"Unsupported unit {unit!r}.")
                amount = node_value(node.args[0])
                if amount.dim != (0, 0):
                    raise CadError("unit_mismatch", "A unit suffix requires a unitless amount.")
                scale, dim = UNITS[unit]
                return Quantity(amount.value * scale, dim)
            args = [node_value(arg) for arg in node.args]
            if name == "abs" and len(args) == 1:
                return Quantity(abs(args[0].value), args[0].dim)
            if name in {"min", "max"}:
                same(args)
                return Quantity((min if name == "min" else max)(a.value for a in args), args[0].dim)
            if name == "sqrt" and len(args) == 1 and all(d % 2 == 0 for d in args[0].dim):
                return Quantity(math.sqrt(args[0].value), tuple(d // 2 for d in args[0].dim))
            if name in {"sin", "cos", "tan"} and len(args) == 1 and args[0].dim == (0, 1):
                return Quantity(getattr(math, name)(math.radians(args[0].value)))
        raise CadError("unsupported_expression", "Only arithmetic, parameters, units, abs/min/max/sqrt and angle trig functions are allowed.")

    try:
        for identifier in document.parameters:
            resolve(identifier)
    except (ValueError, OverflowError, ZeroDivisionError) as exc:
        raise CadError("invalid_expression", str(exc)) from exc
    return {identifier: quantity.value for identifier, quantity in resolved.items()}


def graph(document: Document, values: dict[str, float]) -> dict:
    upstream = {p.id: sorted(dependencies(p.expression)) for p in document.parameters.values()}
    downstream = {p: [] for p in document.parameters}
    consumers = {p: [] for p in document.parameters}
    for component in document.components.values():
        if component.stock_thickness:
            consumers[component.stock_thickness].append({"kind": "component", "id": component.id, "owner": component.id, "field": "stock_thickness"})
    for target, sources in upstream.items():
        for source in sources:
            downstream[source].append(target)
    for feature in document.features.values():
        for field, parameter in feature.parameters.items():
            consumers[parameter].append({"kind": "feature", "id": feature.id, "owner": feature.owner, "field": field})
    for instance in document.instances.values():
        for field, parameter in instance.placement.items():
            consumers[parameter].append({"kind": "placement", "id": instance.id, "owner": instance.parent, "field": field})
        for field, parameter in instance.pattern.items():
            consumers[parameter].append({"kind": "pattern", "id": instance.id, "owner": instance.parent, "field": field})

    @lru_cache(maxsize=None)
    def roots(identifier):
        return sorted({root for parent in upstream[identifier] for root in roots(parent)} if upstream[identifier] else {identifier})

    fits = []
    for fit in document.fits.values():
        pin, socket = document.parameters[fit.pin_parameter], document.parameters[fit.socket_parameter]
        p, s = values[pin.id], values[socket.id]
        factor = 0.5 if fit.convention == "radial" else 1.
        limits = None
        if pin.tolerance and socket.tolerance:
            limits = [(s - socket.tolerance.minus - p - pin.tolerance.plus) * factor,
                      (s + socket.tolerance.plus - p + pin.tolerance.minus) * factor]
        fits.append({**fit.model_dump(), "nominal": (s - p) * factor, "limits": limits,
                     "status": "interference" if (s - p) < 0 else "nominal_clearance",
                     "assumptions": "Dimensional limits with independent manufacturing deviations; printed fit is unverified."})
    return {"parameters": {p: {"value": values[p], "upstream": upstream[p], "downstream": downstream[p],
                               "roots": roots(p), "consumers": consumers[p], "root": not upstream[p],
                               "use_count": len(consumers[p]) + len(downstream[p])} for p in upstream}, "fits": fits}

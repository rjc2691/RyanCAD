"""A bounded adapter to the real FreeCAD PlaneGCS solver."""
from __future__ import annotations

import math

from .errors import CadError
from .model import Feature, uid

ENTITY_FIELDS = {
    "point": {"x": "length", "y": "length"},
    "line": {"x1": "length", "y1": "length", "x2": "length", "y2": "length"},
    "circle": {"x": "length", "y": "length", "radius": "length"},
    "arc": {"x": "length", "y": "length", "radius": "length", "start_angle": "angle", "end_angle": "angle"},
}
CONSTRAINTS = {"coincident", "horizontal", "vertical", "parallel", "perpendicular", "equal", "distance", "line_distance",
               "angle", "radius", "diameter", "fix", "tangent", "point_on_line", "point_on_circle"}


def sketch_plane(options):
    """A frozen, explicit world frame; projected references are currently snapshots."""
    from build123d import Plane, Vector
    frame = options.get("frame")
    if not frame:
        from .geometry import primitive_plane
        return primitive_plane(options.get("plane", "XY"))
    try:
        origin, u, normal = (Vector(*frame[k]) for k in ("origin", "u", "normal"))
        if any(not math.isfinite(x) or abs(x) > 10000 for x in origin):
            raise ValueError()
        if abs(u.length - 1) > 1e-6 or abs(normal.length - 1) > 1e-6 or abs(u.dot(normal)) > 1e-6:
            raise ValueError()
        return Plane(origin=origin, x_dir=u, z_dir=normal)
    except (ValueError, TypeError, KeyError, RuntimeError) as exc:
        raise CadError("invalid_plane", "Sketch frame needs a finite origin and perpendicular unit U/normal vectors.") from exc


def edit_sketch(document, actor, command, args):
    from .commands import create_component, parameter, require
    if command == "sketch.create":
        name = str(args.get("name", "Sketch")).strip()
        if not name or len(name)>120:
            raise CadError("invalid_name", "Sketch names must contain 1–120 characters.")
        entities = args.get("entities", [])
        if not 1 <= len(entities) <= 200:
            raise CadError("sketch_limit", "A sketch contains 1–200 entities in this release.")
        owner = args.get("owner", "root")
        created = {}
        if not owner:
            component, instance = create_component(document, actor, args.get("name", "Sketch part"), "planar")
            owner = component.id
            created = {"component_id": owner, "instance_id": instance.id}
        component = require(document.components, owner, "component")
        if component.kind == "assembly" and owner != "root":
            raise CadError("invalid_owner", "Sketches belong to the design root or a legacy physical part.")
        plane = args.get("plane", "XY")
        if plane not in {"XY", "XZ", "YZ"}:
            raise CadError("invalid_plane", "Choose XY, XZ or YZ.")
        feature = Feature(id=uid("ft"), owner=owner, type="sketch", name=name,
                          options={"plane": plane, "entities": [], "constraints": []}, created_by=actor.id, modified_by=actor.id)
        if args.get("frame") is not None:
            feature.options["frame"] = args["frame"]
        sketch_plane(feature.options)
        identifiers = set()
        for index, entity in enumerate(entities):
            kind, identifier = entity.get("type"), str(entity.get("id", f"e{index + 1}"))
            if kind not in ENTITY_FIELDS or identifier in identifiers or "." in identifier:
                raise CadError("invalid_sketch_entity", "Use unique entity IDs and supported point/line/circle/arc types.")
            identifiers.add(identifier)
            feature.options["entities"].append({"id": identifier, "type": kind, "construction": bool(entity.get("construction", False)), "fixed": bool(entity.get("fixed", False))})
            for field, quantity in ENTITY_FIELDS[kind].items():
                feature.parameters[f"{identifier}.{field}"] = parameter(document, actor, owner,
                    f"{feature.name} · {identifier} {field}", entity.get("expressions", {}).get(field, entity.get(field, 0)), quantity, "Sketch geometry" if entity.get("fixed") else "Sketch seeds")
        document.features[feature.id] = feature
        component.feature_ids.append(feature.id)
        document.feature_order.append(feature.id)
        for constraint in args.get("constraints", []):
            edit_sketch(document, actor, "sketch.constraint", {**constraint, "feature_id": feature.id})
        return {**created, "feature_id": feature.id}, [owner, feature.id], f"Create constrained sketch · {component.name}"
    feature = require(document.features, args["feature_id"], "sketch")
    if feature.type != "sketch":
        raise CadError("invalid_selection", "Choose a general sketch feature.")
    if command == "sketch.update":
        if "name" in args:
            name = str(args["name"]).strip()
            if not name or len(name)>120:
                raise CadError("invalid_name", "Sketch names must contain 1–120 characters.")
            feature.name = name
        from .parameters import evaluate
        original_values = evaluate(document)
        entities = args.get("entities", [])
        if not 1 <= len(entities) <= 200:
            raise CadError("sketch_limit", "A sketch contains 1–200 entities in this release.")
        existing_parameters = dict(feature.parameters)
        preserved = {}
        new_entities, seen = [], set()
        for entity in entities:
            identifier, kind = str(entity["id"]), entity["type"]
            if identifier in seen or "." in identifier or kind not in ENTITY_FIELDS:
                raise CadError("invalid_sketch_entity", "Sketch IDs must be unique and geometry types supported.")
            seen.add(identifier)
            new_entities.append({"id": identifier, "type": kind, "construction": bool(entity.get("construction", False)), "fixed": bool(entity.get("fixed", False))})
            for field, quantity in ENTITY_FIELDS[kind].items():
                key = f"{identifier}.{field}"
                old = existing_parameters.get(key)
                if old:
                    p = document.parameters[old]
                    from .parameters import bind_expression
                    supplied_value = entity.get("expressions", {}).get(field, entity.get(field, 0))
                    if not isinstance(supplied_value, (int, float)) or abs(supplied_value - original_values[old]) > 1e-10:
                        if p.named:
                            old = parameter(document, actor, feature.owner, f"{feature.name} · {identifier} {field}", supplied_value, quantity, "Sketch geometry")
                        else:
                            p.expression, p.modified_by = bind_expression(supplied_value, document, feature.owner), actor.id
                    preserved[key] = old
                else:
                    preserved[key] = parameter(document, actor, feature.owner, f"{feature.name} · {identifier} {field}", entity.get("expressions", {}).get(field, entity.get(field, 0)), quantity, "Sketch geometry")
        old_constraints = {c["id"]: c for c in feature.options["constraints"]}
        feature.parameters = preserved
        feature.options["entities"] = new_entities
        feature.options["constraints"] = []
        for supplied in args.get("constraints", []):
            prior = old_constraints.get(supplied.get("id"))
            if prior and all(prior.get(k) == supplied.get(k) for k in ("type", "a", "b", "angle_frame")):
                if "parameter_key" in prior:
                    key = prior["parameter_key"]
                    identifier = existing_parameters[key]
                    p = document.parameters[identifier]
                    from .parameters import bind_expression
                    supplied_value = supplied.get("value", 1)
                    if isinstance(supplied_value, dict):
                        identifier = parameter(document, actor, feature.owner, f"{feature.name} · {prior['type']}", supplied_value,
                                               "angle" if prior["type"] == "angle" else "length", "Sketch constraints")
                    elif not isinstance(supplied_value, (int, float)) or abs(supplied_value - original_values[identifier]) > 1e-10:
                        # A reused parameter is shared design intent. Editing this dimension
                        # must not silently rewrite the shared source for every consumer.
                        shared = list(existing_parameters.values()).count(identifier) > 1 or any(
                            f.id != feature.id and identifier in f.parameters.values() for f in document.features.values())
                        if p.category != "Sketch constraints" or shared:
                            identifier = parameter(document, actor, feature.owner, f"{feature.name} · {prior['type']}", supplied_value,
                                                   "angle" if prior["type"] == "angle" else "length", "Sketch constraints")
                        else:
                            p.expression, p.modified_by = bind_expression(supplied_value, document, feature.owner), actor.id
                    feature.parameters[key] = identifier
                feature.options["constraints"].append(prior)
            else:
                edit_sketch(document, actor, "sketch.constraint", {**supplied, "feature_id": feature.id})
        feature.modified_by = actor.id
        return {"feature_id": feature.id}, [feature.id], f"Edit sketch geometry and relationships · {feature.name}"
    if command == "sketch.remove_constraint":
        before = len(feature.options["constraints"])
        feature.options["constraints"] = [c for c in feature.options["constraints"] if c["id"] != args["constraint_id"]]
        if before == len(feature.options["constraints"]):
            raise CadError("missing_constraint", "The selected constraint does not exist.")
        return {}, [feature.id], f"Remove constraint from {feature.name}"
    kind = args.get("type")
    if kind not in CONSTRAINTS:
        raise CadError("unsupported_constraint", "Choose a supported sketch constraint.", supported=sorted(CONSTRAINTS))
    constraint = {"id": uid("c"), "type": kind, "a": args.get("a", ""), "b": args.get("b", "")}
    if kind == "angle" and args.get("angle_frame") is not None:
        frame = args["angle_frame"]
        if not isinstance(frame, dict) or frame.get("a") not in {"start", "end"} or frame.get("b") not in {"start", "end"} or frame.get("orientation") not in {-1, 1}:
            raise CadError("invalid_angle_frame", "An interior angle needs endpoint rays and a winding direction.")
        constraint["angle_frame"] = {k: frame[k] for k in ("a", "b", "orientation")}
    if kind in {"distance", "line_distance", "angle", "radius", "diameter"}:
        key = f"{constraint['id']}.value"
        feature.parameters[key] = parameter(document, actor, feature.owner, args.get("name", f"{feature.name} · {kind}"),
                                           args.get("value", 1), "angle" if kind == "angle" else "length", "Sketch constraints")
        constraint["parameter_key"] = key
    feature.options["constraints"].append(constraint)
    feature.modified_by = actor.id
    return {"constraint_id": constraint["id"]}, [feature.id], f"Constrain {feature.name} · {kind}"


def sketch_axis_direction(feature, axis):
    index = "XYZ".find(axis)
    if index < 0 or len(axis) != 1:
        raise CadError("invalid_axis", "Choose a world X, Y or Z axis.")
    frame = feature.options.get("frame")
    if frame:
        u, n = frame["u"], frame["normal"]
    else:
        u, n = {"XY": ([1, 0, 0], [0, 0, 1]), "XZ": ([1, 0, 0], [0, -1, 0]), "YZ": ([0, 1, 0], [1, 0, 0])}[feature.options.get("plane", "XY")]
    v = [n[1]*u[2]-n[2]*u[1], n[2]*u[0]-n[0]*u[2], n[0]*u[1]-n[1]*u[0]]
    return u[index], v[index]


def solve_sketch(feature, values):
    import planegcs
    solver = planegcs.Sketch()
    entities, points, seeds, tags = {}, {}, {}, {}

    def add_point(key, x, y, fixed=False):
        result = solver.add_fixed_point(x, y) if fixed else solver.add_point(x, y)
        points[key], seeds[key] = result, (x, y)
        return result

    for entity in feature.options["entities"]:
        identifier, kind, fixed = entity["id"], entity["type"], entity.get("fixed", False)
        q = {field: values[feature.parameters[f"{identifier}.{field}"]] for field in ENTITY_FIELDS[kind]}
        if kind == "point":
            entities[identifier] = add_point(identifier, q["x"], q["y"], fixed)
        elif kind == "line":
            a = add_point(identifier + ".start", q["x1"], q["y1"], fixed)
            b = add_point(identifier + ".end", q["x2"], q["y2"], fixed)
            if math.dist(seeds[identifier + ".start"], seeds[identifier + ".end"]) < 1e-8:
                raise CadError("degenerate_sketch", "Sketch lines must have nonzero length.", entity=identifier)
            entities[identifier] = solver.add_line(a, b)
        else:
            if q["radius"] <= 1e-6:
                raise CadError("invalid_radius", "Sketch radii must be positive.", entity=identifier)
            center = add_point(identifier + ".center", q["x"], q["y"], fixed)
            if kind == "circle":
                radius = solver.add_fixed_param(q["radius"]) if fixed else solver.add_param(q["radius"])
                entities[identifier] = solver.add_circle(center, radius)
            else:
                start, end = math.radians(q["start_angle"]), math.radians(q["end_angle"])
                a = add_point(identifier + ".start", q["x"] + q["radius"] * math.cos(start), q["y"] + q["radius"] * math.sin(start), fixed)
                b = add_point(identifier + ".end", q["x"] + q["radius"] * math.cos(end), q["y"] + q["radius"] * math.sin(end), fixed)
                entities[identifier] = solver.add_arc_cse(center, a, b, q["radius"], start, end)
                solver.arc_rules(entities[identifier])
                if fixed:
                    solver.set_arc_radius(entities[identifier], q["radius"])

    def entity(key):
        if key not in entities:
            raise CadError("missing_sketch_reference", f"Sketch entity '{key}' does not exist.")
        return entities[key]

    def point(key):
        if key not in points:
            raise CadError("missing_sketch_reference", f"Sketch point '{key}' does not exist. Use e.g. line1.start, circle1.center.")
        return points[key]

    for constraint in feature.options["constraints"]:
        kind, a, b = constraint["type"], constraint["a"], constraint["b"]
        value = values[feature.parameters[constraint["parameter_key"]]] if "parameter_key" in constraint else None
        if kind in {"distance", "radius", "diameter"} and value <= 1e-8:
            raise CadError("invalid_dimension", "Sketch lengths and radii must be positive.", constraint=constraint["id"])
        try:
            if kind == "coincident":
                tag = solver.coincident(point(a), point(b))
            elif kind in {"horizontal", "vertical"}:
                tag = getattr(solver, kind)(entity(a))
            elif kind in {"parallel", "perpendicular", "equal"}:
                types = {item["id"]: item["type"] for item in feature.options["entities"]}
                if kind == "equal" and types.get(a) == "arc" and types.get(b) == "circle":
                    a, b = b, a
                method = {("circle", "circle"): "equal_radius_cc", ("arc", "arc"): "equal_radius_aa", ("circle", "arc"): "equal_radius_ca"}.get((types.get(a), types.get(b)), "equal_length") if kind == "equal" else kind
                tag = getattr(solver, method)(entity(a), entity(b))
            elif kind == "distance":
                tag = solver.set_p2p_distance(point(a), point(b), value)
            elif kind == "line_distance":
                if value < 0:
                    raise CadError("invalid_dimension", "Distance between parallel lines must be nonnegative.", constraint=constraint["id"])
                types = {item["id"]: item["type"] for item in feature.options["entities"]}
                if types.get(a) != "line" or types.get(b) != "line":
                    raise CadError("invalid_constraint", "Parallel distance requires two line segments.")
                tag = (solver.parallel(entity(a), entity(b)), solver.set_p2l_distance(point(b + ".start"), entity(a), value))
            elif kind == "angle":
                frame = constraint.get("angle_frame")
                directed = value
                if frame:
                    if not b.startswith("world:") and not 0 <= value < 360:
                        raise CadError("invalid_dimension", "Angles must be at least 0 and less than 360 degrees.", constraint=constraint["id"])
                    offset = (180 if frame["b"] == "end" else 0) - (180 if frame["a"] == "end" else 0)
                    directed = (frame["orientation"] * value - offset + 180) % 360 - 180
                if b.startswith("world:"):
                    x, y = sketch_axis_direction(feature, b[6:])
                    projection = math.hypot(x, y)
                    if projection < 1e-8:
                        raise CadError("invalid_axis", "This world axis is perpendicular to the sketch plane. Choose another axis.")
                    ratio = math.cos(math.radians(value)) / projection
                    if not 0 <= value <= 180 or abs(ratio) > 1 + 1e-8:
                        minimum = math.degrees(math.acos(min(1, projection)))
                        raise CadError("invalid_dimension", f"This axis allows angles from {minimum:.2f} to {180-minimum:.2f} degrees on this sketch plane.")
                    directed = (frame["orientation"] if frame else 1) * math.degrees(math.acos(max(-1, min(1, ratio))))
                    reference = solver.add_line(solver.add_fixed_point(0, 0), solver.add_fixed_point(x, y))
                    tag = solver.set_l2l_angle(entity(a), reference, math.radians(directed))
                else:
                    tag = solver.set_l2l_angle(entity(a), entity(b), math.radians(directed))
            elif kind in {"radius", "diameter"}:
                entity_type = next((item["type"] for item in feature.options["entities"] if item["id"] == a), "circle")
                tag = getattr(solver, f"set_{'arc' if entity_type == 'arc' else 'circle'}_{kind}")(entity(a), value)
            elif kind == "fix":
                tag = solver.fix_point(point(a), *seeds[a])
            elif kind == "tangent":
                types = {item["id"]: item["type"] for item in feature.options["entities"]}
                order = {"line": 0, "circle": 1, "arc": 2}
                if order.get(types.get(a), 99) > order.get(types.get(b), 99):
                    a, b = b, a
                method = {("line", "circle"): "tangent_line_circle", ("line", "arc"): "tangent_line_arc", ("circle", "circle"): "tangent_circle_circle", ("circle", "arc"): "tangent_circle_arc", ("arc", "arc"): "tangent_arc_arc"}.get((types.get(a), types.get(b)))
                if not method:
                    raise CadError("invalid_constraint", "Tangency requires a line/circular curve pair or two circular curves.")
                tag = getattr(solver, method)(entity(a), entity(b))
            elif kind == "point_on_line":
                tag = solver.point_on_line(point(a), entity(b))
            elif kind == "point_on_circle":
                tag = solver.point_on_circle(point(a), entity(b))
            for item in tag if isinstance(tag, tuple) else (tag,):
                tags[int(item)] = constraint["id"]
        except (TypeError, RuntimeError) as exc:
            raise CadError("invalid_constraint", f"The {kind} constraint has incompatible entity types.", constraint=constraint["id"], reason=str(exc)) from exc
    status = solver.solve()
    diagnosis = solver.diagnose()
    if status != planegcs.SolveStatus.Success or diagnosis.conflicting:
        raise CadError("constraint_conflict", "The sketch constraints cannot all be satisfied. Remove or revise the conflicting constraints.",
                       feature_id=feature.id, constraints=[tags.get(int(tag), str(tag)) for tag in diagnosis.conflicting], status=str(status))
    solved = []
    for entity in feature.options["entities"]:
        identifier, kind = entity["id"], entity["type"]
        result = {**entity}
        if kind == "point":
            result["point"] = list(solver.get_point(entities[identifier]))
        elif kind == "line":
            line = solver.get_line(entities[identifier])
            result.update(start=list(line.p1), end=list(line.p2))
        elif kind == "circle":
            circle = solver.get_circle(entities[identifier])
            result.update(center=list(circle.center), radius=circle.radius)
        else:
            arc = solver.get_arc(entities[identifier])
            result.update(center=list(arc.center), radius=arc.radius, start_angle=arc.start_angle, end_angle=arc.end_angle)
        solved.append(result)
    return {"solver": "PlaneGCS 0.9.6", "degrees_of_freedom": diagnosis.dof, "fully_defined": diagnosis.dof == 0,
            "redundant": [tags.get(int(tag), str(tag)) for tag in diagnosis.redundant], "entities": solved,
            "constraints": feature.options["constraints"], "plane": feature.options.get("plane", "XY")}

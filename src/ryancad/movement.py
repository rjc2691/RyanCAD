"""One-shot, exact component movement in occurrence and parent frames.

Picked points are local-coordinate snapshots, not assembly mates. The command
and audit trail retain the picked occurrence and coordinates; subsequent edits
do not silently create an alignment constraint.
"""
import numpy as np

from .errors import CadError
from .parameters import evaluate, dependencies
from .placements import flatten_instances, local_matrix, bake_rotation


def move_component(document, actor, args):
    from .commands import parameter, require

    instance = require(document.instances, args.get("id"), "instance")
    if document.structure_version and document.components[instance.definition].structure_role == "group":
        raise CadError("group_organization", "Part Groups organize membership. Move the part placements inside the group instead.")
    method = args.get("method", "axes")
    if method not in {"axes", "reference", "rotate", "point", "direction", "projected"}:
        raise CadError("invalid_move", "Choose axes, reference, or rotate movement.")
    bake_rotation(document, actor, instance)
    before = evaluate(document)
    rows = {o["id"]: o for o in flatten_instances(document, before)}
    occurrence = require(rows, args.get("occurrence", instance.id), "occurrence")
    if occurrence["source_id"] != instance.id or occurrence["suppressed"]:
        raise CadError("invalid_move", "Choose an unsuppressed occurrence of the component being moved.")
    # Includes the selected pattern member's frame. A circular member's parent
    # direction differs from its source's, even within the same assembly.
    world = np.array(occurrence["matrix"], dtype=float)
    parent = world @ np.linalg.inv(local_matrix(instance, before))
    inputs = args.get("values", {})
    if not isinstance(inputs, dict) or type(args.get("reverse", False)) is not bool:
        raise CadError("invalid_move", "Movement values must be a field map; reverse must be true or false.")
    params = {}
    requested_method = method
    exact_distance = "distance" in inputs and inputs["distance"] not in (None, "")
    if method == "reference":
        if args.get("target"):
            method = "projected" if args.get("direction") else "point"
        elif args.get("direction") and exact_distance:
            method = "direction"
        else:
            raise CadError("incomplete_move", "Pick a target point, or select a direction and enter an exact distance.")

    def scalar(key, kind="length"):
        identifier = parameter(document, actor, instance.parent,
                               f"{instance.name} move · {key}", inputs.get(key, 0), kind, "Movement")
        value = evaluate(document)[identifier]
        if abs(value) < 1e-12 and identifier not in before and not dependencies(document.parameters[identifier].expression):
            del document.parameters[identifier]
        else:
            params[key] = identifier
        return value

    def vector(value):
        try:
            if not isinstance(value, list) or len(value) != 3 or any(type(x) not in (int, float) for x in value):
                raise ValueError()
            result = np.array(value, dtype=float)
            if not np.all(np.isfinite(result)) or np.max(np.abs(result)) > 1e9:
                raise ValueError()
            return result
        except (TypeError, ValueError):
            raise CadError("invalid_move_reference", "Use three finite coordinates in canonical millimetres.") from None

    def point(key, active=False):
        ref = args.get(key) or ({"occurrence": occurrence["id"], "point": [0, 0, 0]} if active and requested_method == "reference" else {})
        if not isinstance(ref, dict):
            raise CadError("invalid_move_reference", "A point reference needs an occurrence and local coordinates.")
        if ref=={"world":"origin"}:return np.zeros(3)
        row = require(rows, ref.get("occurrence"), "reference occurrence")
        if row["suppressed"] or (active and row["id"] != occurrence["id"] and not row["id"].startswith(occurrence["id"]+'/')):
            raise CadError("invalid_move_reference", "The movement origin must be on the active occurrence.")
        return (np.array(row["matrix"]) @ np.r_[vector(ref.get("point")), 1])[:3]

    direction = None
    origin = world[:3, 3].copy()
    target = None
    if method in {"direction", "projected", "rotate"}:
        ref = args.get("direction") or {}
        if not isinstance(ref, dict):
            raise CadError("invalid_move_reference", "A direction reference needs an occurrence, start and end.")
        if "axis" in ref:
            if ref["axis"] not in ("X", "Y", "Z") or set(ref) != {"axis"}:
                raise CadError("invalid_move_direction", "Use {axis: X}, {axis: Y}, or {axis: Z} for a global axis.")
            axis_start = np.zeros(3)
            axis_end = np.eye(3)["XYZ".index(ref["axis"])]
        else:
            row = require(rows, ref.get("occurrence"), "direction occurrence")
            if row["suppressed"]:
                raise CadError("invalid_move_reference", "Choose an unsuppressed direction reference.")
            axis_start = (np.array(row["matrix"]) @ np.r_[vector(ref.get("start")), 1])[:3]
            axis_end = (np.array(row["matrix"]) @ np.r_[vector(ref.get("end")), 1])[:3]
        direction = axis_end - axis_start
        norm = np.linalg.norm(direction)
        if norm < 1e-9:
            raise CadError("invalid_move_direction", "Choose a straight edge with nonzero length.")
        direction /= norm
        if args.get("reverse", False):
            direction *= -1

    if method == "rotate":
        angle = scalar("angle", "angle")
        # A fixed parent-frame axis and a live angle parameter avoid unstable
        # Euler conversion at 90 degrees and keep future angle edits exact.
        parent_inverse = np.linalg.inv(parent)
        pivot = (parent_inverse @ np.r_[axis_start, 1])[:3]
        local_axis = parent_inverse[:3, :3] @ direction
        for prefix, vector_value, kind in (("rotation_origin", pivot, "length"), ("rotation_axis", local_axis, "ratio")):
            for key, value in zip("xyz", vector_value):
                field = f"{prefix}_{key}"
                instance.placement[field] = parameter(document, actor, instance.parent, f"{instance.name} · {field}", float(value), kind, "Rotation frame")
        instance.placement["rotation_angle"] = params.get("angle") or parameter(document, actor, instance.parent, f"{instance.name} rotation angle", angle, "angle", "Movement")
        candidate = parent @ local_matrix(instance, evaluate(document))
        end = candidate[:3, 3]
        return {"movement": {"method":"rotate", "origin":origin.tolist(), "destination":end.tolist(), "direction":direction.tolist(),
                             "directionStart":axis_start.tolist(), "directionEnd":axis_end.tolist(), "rotation_angle":angle,
                             "displacement":(end-origin).tolist(), "remaining_gap":0.}}, [instance.id], f"Rotate Component · {instance.name}"

    if method == "axes":
        delta = np.array([scalar(k) for k in ("x", "y", "z")])
        rotation = [scalar(k, "angle") for k in ("rx", "ry", "rz")]
        displacement = parent[:3, :3] @ delta
    else:
        rotation = [0., 0., 0.]
        if method == "direction":
            if args.get("origin"):
                origin = point("origin", True)
            displacement = direction * scalar("distance")
        else:
            origin, target = point("origin", True), point("target")
            displacement = target - origin
            if method == "projected":
                displacement = direction * np.dot(displacement, direction)
            if requested_method == "reference" and exact_distance:
                if direction is None:
                    norm = np.linalg.norm(displacement)
                    if norm < 1e-9:
                        raise CadError("invalid_move_direction", "Coincident points do not define a travel direction. Pick an edge or a different target.")
                    direction = displacement / norm
                    if args.get("reverse", False): direction *= -1
                displacement = direction * scalar("distance")
                method = "direction"
        delta = np.linalg.solve(parent[:3, :3], displacement)

    # Keep input distances reusable while avoiding cycles through old placement
    # parameters. Each move starts from a numeric placement snapshot. Parameters
    # shared with other instances are never overwritten as a side effect.
    for i, key in enumerate(("x", "y", "z", "rx", "ry", "rz")):
        start = before.get(instance.placement.get(key), 0.)
        amount = delta[i] if i < 3 else rotation[i - 3]
        dependent = method == "axes" and key in params
        if method == "direction" and i < 3:
            unit_delta = np.linalg.solve(parent[:3, :3], direction)[i]
            dependent = "distance" in params and abs(unit_delta) > 1e-12
        if abs(amount) < 1e-12 and not dependent:
            continue
        expression = f"{start + amount:.17g}"
        if method == "axes":
            unit = "mm" if i < 3 else "deg"
            expression = f"{start:.17g} {unit} + {params[key]}"
        elif method == "direction" and i < 3:
            unit_delta = np.linalg.solve(parent[:3, :3], direction)[i]
            expression = f"{start:.17g} mm + {unit_delta:.17g} * {params['distance']}"
        instance.placement[key] = parameter(document, actor, instance.parent,
                                            f"{instance.name} · {key.upper()}", expression,
                                            "length" if i < 3 else "angle", "Placement")
    end = origin + displacement
    return {"movement": {"method": method, "origin": origin.tolist(),
                         "destination": end.tolist(), "target": target.tolist() if target is not None else None,
                         "direction": direction.tolist() if direction is not None else None,
                         "delta_parent": delta.tolist(), "displacement": displacement.tolist(),
                         "remaining_gap": float(np.linalg.norm(target - end)) if target is not None else 0.}}, [instance.id], f"Move Component · {instance.name} · {method}"

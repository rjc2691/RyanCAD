"""Shared occurrence frames for geometry, API clients and exports."""
import math
import numpy as np
from .errors import CadError

def local_matrix(instance, values):
    q = {field: values[value] for field, value in instance.placement.items()}
    rx, ry, rz = [math.radians(q.get(key, 0)) for key in ("rx", "ry", "rz")]
    a, b, c = math.cos(rx), math.cos(ry), math.cos(rz)
    d, e, f = math.sin(rx), math.sin(ry), math.sin(rz)
    x = np.array([[1, 0, 0], [0, a, -d], [0, d, a]])
    y = np.array([[b, 0, e], [0, 1, 0], [-e, 0, b]])
    z = np.array([[c, -f, 0], [f, c, 0], [0, 0, 1]])
    matrix = np.eye(4)
    matrix[:3, :3] = x @ y @ z
    matrix[:3, 3] = [q.get(key, 0) for key in ("x", "y", "z")]
    if "rotation_angle" in q:
        axis = np.array([q.get(f"rotation_axis_{k}", 0) for k in "xyz"])
        if np.linalg.norm(axis) < 1e-9:
            raise CadError("invalid_rotation_axis", "The rotation axis must have a nonzero direction.")
        axis /= np.linalg.norm(axis)
        pivot = np.array([q.get(f"rotation_origin_{k}", 0) for k in "xyz"])
        angle = math.radians(q["rotation_angle"])
        cross = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
        rotation = np.eye(3) * math.cos(angle) + (1-math.cos(angle)) * np.outer(axis, axis) + math.sin(angle) * cross
        delta = np.eye(4)
        delta[:3, :3] = rotation
        delta[:3, 3] = pivot - rotation @ pivot
        matrix = delta @ matrix
    return matrix


def matrix_pose(matrix):
    """Canonical Rx·Ry·Rz coordinates, including the ±90° gimbal case."""
    sy = max(-1., min(1., float(matrix[0, 2])))
    ry = math.asin(sy)
    if abs(math.cos(ry)) > 1e-8:
        rx = math.atan2(-matrix[1, 2], matrix[2, 2])
        rz = math.atan2(-matrix[0, 1], matrix[0, 0])
    else:
        rx, rz = math.atan2(matrix[2, 1], matrix[1, 1]), 0.
    return dict(zip(("x", "y", "z", "rx", "ry", "rz"),
                    [*map(float, matrix[:3, 3]), *map(math.degrees, (rx, ry, rz))]))


def bake_rotation(document, actor, instance):
    """The next placement edit snapshots an earlier axis rotation without a jump."""
    if "rotation_angle" not in instance.placement:
        return
    from .commands import parameter
    from .parameters import evaluate
    pose = matrix_pose(local_matrix(instance, evaluate(document)))
    instance.placement = {key: parameter(document, actor, instance.parent, f"{instance.name} · {key.upper()}", value,
                                        "angle" if key.startswith("r") else "length", "Placement")
                          for key, value in pose.items()}


def flatten_instances(document, values):
    rows = []

    def walk(parent, matrix, path, stack, visible=True, suppressed=False):
        if parent in stack:
            raise CadError("ownership_cycle", "Assembly placement creates an ownership cycle.", cycle=stack + [parent])
        for instance in document.instances.values():
            if instance.parent != parent:
                continue
            if instance.definition not in document.components:
                raise CadError("missing_component", "An instance refers to a missing component.", instance=instance.id)
            definition = document.components[instance.definition]
            count = int(values[instance.pattern["count"]]) if instance.pattern_mode else 1
            if count > 200 or len(rows) + count > 5000:
                raise CadError("pattern_limit", "Use at most 200 copies per component pattern and 5,000 assembly occurrences.")
            for index in range(count):
                if index in instance.omitted_indices:
                    continue
                placement = matrix @ pattern_delta(instance, values, index) @ local_matrix(instance, values)
                member_id = instance.id if index == 0 else f"{instance.id}~{index}"
                occurrence_id = f"{path}/{member_id}" if path else member_id
                record = {**instance.model_dump(), "source_id": instance.id, "id": occurrence_id, "matrix": placement.tolist(),
                          "pattern_index": index, "visible": visible and instance.visible, "suppressed": suppressed or instance.suppressed, "kind": definition.kind, "purpose": definition.purpose, "color": definition.color}
                rows.append(record)
                if definition.kind == "assembly":
                    walk(definition.id, placement, occurrence_id, stack + [parent], record["visible"], record["suppressed"])
    walk("root", np.eye(4), "", [])
    return rows


def pattern_delta(instance, values, index):
    delta = np.eye(4)
    if not instance.pattern_mode or index == 0:
        return delta
    axis = "XYZ".index(instance.pattern_axis)
    if instance.pattern_mode == "linear":
        delta[axis, 3] = values[instance.pattern["spacing"]] * index
    else:
        angle = math.radians(values[instance.pattern["angle"]] * index)
        a, b = (axis + 1) % 3, (axis + 2) % 3
        delta[a, a] = delta[b, b] = math.cos(angle)
        delta[a, b], delta[b, a] = -math.sin(angle), math.sin(angle)
    return delta



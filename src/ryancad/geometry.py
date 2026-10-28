"""Native geometry evaluator. Imported and executed only in a supervised worker."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct
import time

import numpy as np

from .errors import CadError
from .model import Document
from .parameters import evaluate as evaluate_parameters


def vector(value):
    return [float(value.X), float(value.Y), float(value.Z)]


def bounds(shape):
    box = shape.bounding_box()
    low, high = vector(box.min), vector(box.max)
    return {"min": low, "max": high, "size": [b - a for a, b in zip(low, high)]}


def intersection(first, second):
    """Normalize build123d intersection collections into a native shape."""
    from build123d import Compound
    pieces = first.intersect(second)
    if not pieces:
        return Compound([])
    return pieces[0] if len(pieces) == 1 else Compound(pieces)


def primitive_plane(name="XY", z=0):
    from build123d import Plane
    if name not in {"XY", "XZ", "YZ"}:
        raise CadError("invalid_plane", "Choose XY, XZ or YZ.")
    if name == "XZ":
        return Plane(origin=(0, z, 0), x_dir=(1, 0, 0), z_dir=(0, -1, 0))
    if name == "YZ":
        return Plane(origin=(z, 0, 0), x_dir=(0, 1, 0), z_dir=(1, 0, 0))
    return Plane(origin=(0, 0, z))


def edge_selector(shape, selector):
    from build123d import GeomType
    group = selector.get("group", "vertical")
    edges, box = list(shape.edges()), shape.bounding_box()
    tolerance = max(1e-6, max(vector(box.size)) * 1e-7)
    if group == "all":
        selected = edges
    elif group in {"top", "bottom"}:
        z = box.max.Z if group == "top" else box.min.Z
        selected = [e for e in edges if abs(e.bounding_box().min.Z - z) < tolerance and abs(e.bounding_box().max.Z - z) < tolerance]
    elif group in {"vertical", "x", "y"}:
        axis = {"vertical": 2, "x": 0, "y": 1}[group]
        selected = []
        for edge in edges:
            if edge.geom_type != GeomType.LINE:
                continue
            direction = vector(edge.tangent_at(0.5))
            if abs(direction[axis]) > 1 - 1e-6:
                selected.append(edge)
    elif group == "semantic":
        signature = selector.get("signature")
        selected = [e for e in edges if semantic_edge(e, box) == signature]
        if len(selected) != 1:
            raise CadError("ambiguous_reference" if selected else "missing_reference", "The selected edge no longer has a unique semantic match. Repair this feature's edge selection.", signature=signature, matches=len(selected))
    else:
        raise CadError("invalid_selection", "Choose vertical, top, bottom, all, x, y or an explicit semantic edge.")
    if not selected:
        raise CadError("missing_reference", "No edges match this feature's selection. Repair the selection or restore its supporting geometry.", selector=selector)
    if selector.get("expected_count") is not None and len(selected) != selector["expected_count"]:
        raise CadError("ambiguous_reference", "The number of selected edges changed. Confirm a new selection before applying this feature.", expected=selector["expected_count"], actual=len(selected))
    return selected


def semantic_edge(edge, box):
    from build123d import GeomType
    center = edge.center()
    extents = vector(box.size)
    center_normalized = [(value - low) / size if size > 1e-9 else 0
                         for value, low, size in zip(vector(center), vector(box.min), extents)]
    side = ["min" if abs(v) < 1e-5 else "max" if abs(v - 1) < 1e-5 else f"at{v:.6f}" for v in center_normalized]
    if edge.geom_type == GeomType.LINE:
        tangent = vector(edge.tangent_at(.5))
        axis = max(range(3), key=lambda i: abs(tangent[i]))
        if abs(tangent[axis]) > .999999:
            side[axis] = "axis"
    return edge.geom_type.name + ":" + ":".join(side)


def face_outlines(face):
    """Derived native planar loops for viewport tools; holes retain separate loops."""
    from build123d import GeomType
    loops=[]
    for wire in face.wires():
        points=[]
        for edge in wire.order_edges():
            count=1 if edge.geom_type==GeomType.LINE else max(12,min(96,int(edge.length/1.5)))
            samples=[vector(edge.position_at(i/count)) for i in range(count+1)]
            points.extend(samples if not points else samples[1:])
        if points:loops.append(points)
    return loops


def mesh_data(shape, tolerance=.08):
    """Per-face vertex ranges retain semantic picking and sharp normal boundaries."""
    from build123d import GeomType
    from .operations import face_signatures
    positions, indices, faces, edge_points = [], [], [], []
    bb = shape.bounding_box()
    for face, face_signature in zip(shape.faces(), face_signatures(shape)):
        vertices, triangles = face.tessellate(tolerance, .15)
        offset, start = len(positions), len(indices)
        positions.extend(vector(v) for v in vertices)
        indices.extend([tuple(offset + int(i) for i in triangle) for triangle in triangles])
        center = vector(face.center())
        try:
            normal = vector(face.normal_at())
        except Exception:
            normal = [0., 0., 0.]
        faces.append({"id": f"face_{len(faces)}", "name": f"Face {len(faces)+1}", "triangle_start": start, "triangle_count": len(triangles),
                      "area": float(face.area), "center": center, "normal": normal, "type": face.geom_type.name,
                      "bounds": bounds(face), "signature": face_signature, "edge_signatures":[semantic_edge(edge,bb) for edge in face.edges()],
                      **({"outlines":face_outlines(face)} if face.geom_type.name=="PLANE" else {})})
    edge_info = []
    for edge in shape.edges():
        count = 1 if edge.geom_type == GeomType.LINE else max(12, min(96, int(edge.length / 1.5)))
        segment_start = len(edge_points) // 2
        samples = [vector(edge.position_at(i / count)) for i in range(count + 1)]
        for a, b in zip(samples, samples[1:]):
            edge_points.extend([a, b])
        edge_info.append({"id":f"edge_{len(edge_info)}","name":f"Edge {len(edge_info)+1}","signature": semantic_edge(edge, bb), "type": edge.geom_type.name,
                          "length": float(edge.length), "center": vector(edge.center()), "start": samples[0], "end": samples[-1], "midpoint": vector(edge.position_at(.5)), "tangent": vector(edge.tangent_at(0)), "end_tangent": vector(edge.tangent_at(1)), "samples": samples, "segment_start": segment_start, "segment_count": count})
    pos = np.asarray(positions, dtype="<f4").reshape(-1, 3)
    ind = np.asarray(indices, dtype="<u4").reshape(-1, 3)
    lines = np.asarray(edge_points, dtype="<f4").reshape(-1, 3)
    header = struct.pack("<4sIIII", b"RCAD", 1, len(pos), len(ind) * 3, len(lines))
    return {"buffer": header + pos.tobytes() + ind.tobytes() + lines.tobytes(),
            "faces": faces, "edges": edge_info, "triangles": len(ind), "vertices": len(pos), "points": [vector(v) for v in shape.vertices()]}


class Evaluator:
    def solve_sketch_preview(self, payload, feature_id):
        """Solve only the requested sketch; do not build or modify downstream solids."""
        from .sketches import solve_sketch
        document = Document.model_validate(payload)
        feature = document.features.get(feature_id)
        if not feature or feature.type != "sketch":
            raise CadError("invalid_selection", "Choose a sketch to preview.")
        values = evaluate_parameters(document)
        return {"sketch": solve_sketch(feature, values), "parameter_values": values}

    def __init__(self):
        # Importing the native kernel here keeps server and persistence startup independent.
        import build123d
        self.shape_cache = {}
        self.mesh_cache = {}
        self.shapes = {}
        self.timings = {}
        self.operation_decisions = {}
        self.operation_displays = {}
        self.profile_display_cache = {}
        self.maximum_cache = 300

    def evaluate(self, payload, rollback=None, tessellation=.08):
        from build123d import Align, Axis, Box, Cylinder, Edge, Face, Location, Plane, Solid, Wire
        from .sketches import solve_sketch
        document = Document.model_validate(payload)
        values = evaluate_parameters(document)
        output, evaluating, completed, profiles, profile_keys, bindings, sketches = {}, set(), {}, {}, {}, {}, {}
        timings = {}
        operation_decisions = {}
        operation_displays = {}
        cutoff = set() if rollback=="origin" else set(document.feature_order[:document.feature_order.index(rollback) + 1]) if rollback else None

        def resolve_component(identifier):
            if identifier in completed:
                return completed[identifier]
            if identifier in evaluating:
                raise CadError("dependency_cycle", "Component geometry references form a cycle.", component=identifier)
            if identifier not in document.components:
                raise CadError("missing_reference", "A referenced component no longer exists.", component=identifier)
            evaluating.add(identifier)
            component, shape, body_key = document.components[identifier], None, "empty"
            if component.kind == "assembly" and identifier != "root":
                evaluating.remove(identifier)
                completed[identifier] = (None, "assembly")
                return None, "assembly"
            for feature_id in component.feature_ids:
                feature = document.features[feature_id]
                if feature.suppressed or (cutoff is not None and feature_id not in cutoff):
                    continue
                if component.kind == "assembly":
                    if feature.type != "sketch":
                        raise CadError("invalid_owner", "Only design sketches may belong to the root assembly.")
                    # Root sketches are independent construction objects, never an
                    # accumulating physical body or an implicit planar component.
                    shape, body_key = None, "empty"
                q = {key: values[value] for key, value in feature.parameters.items()}
                extras = {}
                operation_context = None
                if feature.type == "operation":
                    from .operations import prepare
                    operation_context, extras = prepare(feature, document, values, shape, body_key, resolve_component, profiles, profile_keys)
                if feature.type in {"boolean", "mirror"}:
                    source = feature.references.get("component")
                    source_shape, source_key = resolve_component(source)
                    if source_shape is None:
                        raise CadError("missing_reference", "The referenced component has no evaluated solid.", feature_id=feature.id)
                    extras["component"] = source_key
                if feature.type in {"extrude", "revolve"}:
                    profile_id = feature.references.get("profile")
                    if profile_id not in profiles:
                        raise CadError("missing_reference", "The feature's sketch/profile is missing, suppressed, or later in history.", feature_id=feature.id, reference=profile_id)
                    extras["profile"] = profile_keys[profile_id]
                key = hashlib.sha256(json.dumps({"type": feature.type, "q": q, "options": feature.options, "references": feature.references,
                                                 "body": body_key, "extras": extras}, sort_keys=True).encode()).hexdigest()
                started = time.perf_counter()
                cached = key in self.shape_cache
                try:
                    if cached:
                        result, sketch_info, binding = self.shape_cache[key]
                    else:
                        result, sketch_info, binding = None, None, None
                        operation = feature.options.get("operation", "new" if shape is None else "add")
                        tool = None
                        if feature.type == "operation":
                            from .operations import execute
                            result = execute(feature, q, shape, operation_context)
                        elif feature.type in {"box", "rectangle"}:
                            if min(q["length"], q["width"]) <= 1e-5:
                                raise CadError("invalid_dimension", "Length and width must be positive.")
                            if feature.type == "box":
                                if q["height"] <= 1e-5:
                                    raise CadError("invalid_dimension", "Height must be positive.")
                                tool = Box(q["length"], q["width"], q["height"], align=(Align.CENTER, Align.CENTER, Align.MIN)).translate((q["x"], q["y"], q["z"]))
                            else:
                                tool = Face.make_rect(q["length"], q["width"], primitive_plane(feature.options.get("plane", "XY"), q["z"]))
                        elif feature.type in {"cylinder", "circle"}:
                            if q["diameter"] <= 1e-5:
                                raise CadError("invalid_dimension", "Diameter must be positive.")
                            if feature.type == "cylinder":
                                if q["height"] <= 1e-5:
                                    raise CadError("invalid_dimension", "Height must be positive.")
                                tool = Cylinder(q["diameter"] / 2, q["height"], align=(Align.CENTER, Align.CENTER, Align.MIN)).translate((q["x"], q["y"], q["z"]))
                            else:
                                tool = primitive_plane(feature.options.get("plane", "XY"), q["z"]).location * Face(Wire.make_circle(q["diameter"] / 2)).translate((q["x"], q["y"], 0))
                        elif feature.type == "sketch":
                            sketch_info = solve_sketch(feature, values)
                            edges = []
                            for entity in sketch_info["entities"]:
                                if entity.get("construction") or entity["type"] == "point":
                                    continue
                                if entity["type"] == "line":
                                    edges.append(Edge.make_line((*entity["start"], 0), (*entity["end"], 0)))
                                elif entity["type"] == "circle":
                                    edges.append(Edge.make_circle(entity["radius"], Plane(origin=(*entity["center"], 0))))
                                else:
                                    c, r, a, b = entity["center"], entity["radius"], entity["start_angle"], entity["end_angle"]
                                    point = lambda t: (c[0] + r * math.cos(t), c[1] + r * math.sin(t), 0)
                                    edges.append(Edge.make_three_point_arc(point(a), point((a + b) / 2), point(b)))
                            if edges:
                                wires = Wire.combine(edges, tol=1e-5)
                                closed = [w for w in wires if w.is_closed]
                                if len(closed) == len(wires):
                                    ordered = sorted(closed, key=lambda w: Face(w).area, reverse=True)
                                    faces = [Face(w) for w in ordered]
                                    parents = []
                                    for i,w in enumerate(ordered):
                                        enclosing=[j for j in range(i) if faces[j].is_inside(w.vertices()[0].center())]
                                        parents.append(enclosing[-1] if enclosing else None)
                                    def depth(i):
                                        return 0 if parents[i] is None else 1+depth(parents[i])
                                    regions=[Face(w,[ordered[j] for j in range(len(ordered)) if parents[j]==i and depth(j)%2==1]) for i,w in enumerate(ordered) if depth(i)%2==0]
                                    from build123d import Compound
                                    tool = regions[0] if len(regions)==1 else Compound(regions)
                                else:
                                    from build123d import Compound
                                    tool = Compound(edges)
                                from .sketches import sketch_plane
                                plane = sketch_plane(feature.options)
                                tool = plane.location * tool
                        elif feature.type == "extrude":
                            profile = profiles[feature.references["profile"]]
                            if len(profile.faces()) != 1:
                                raise CadError("open_profile", "Extrusion needs one closed region. Close the sketch or separate disconnected pieces into components.")
                            face = profile.faces()[0]
                            normal = face.normal_at()
                            tool = Solid.extrude(face, normal * q["distance"])
                            if abs(q["distance"]) <= 1e-5:
                                raise CadError("invalid_dimension", "Extrusion distance must be nonzero.")
                        elif feature.type == "revolve":
                            profile = profiles[feature.references["profile"]]
                            if len(profile.faces()) != 1 or not 0 < abs(q["angle"]) <= 360:
                                raise CadError("invalid_revolve", "Choose a closed profile and an angle up to 360 degrees.")
                            axis = {"X": Axis.X, "Y": Axis.Y, "Z": Axis.Z}.get(feature.options.get("axis", "Y"))
                            if axis is None:
                                raise CadError("invalid_axis", "Revolve axis must be X, Y or Z.")
                            tool = Solid.revolve(profile.faces()[0], q["angle"], axis)
                        elif feature.type == "holes":
                            if shape is None or not shape.solids():
                                raise CadError("missing_solid", "Add a solid before drilling holes.")
                            if q["diameter"] <= 0 or q["count_x"] * q["count_y"] > 400:
                                raise CadError("pattern_limit", "Use a positive hole diameter and at most 400 holes.")
                            box = shape.bounding_box()
                            depth = box.max.Z - box.min.Z + 2 if feature.options.get("through", True) else q["depth"]
                            z = box.min.Z - 1 if feature.options.get("through", True) else q["z"]
                            if depth <= 0:
                                raise CadError("invalid_dimension", "Hole depth must be positive.")
                            tools = []
                            centers = []
                            for i in range(int(q["count_x"])):
                                for j in range(int(q["count_y"])):
                                    x, y = q["x"] + i * q["spacing_x"], q["y"] + j * q["spacing_y"]
                                    mid_z = (box.min.Z + box.max.Z) / 2 if feature.options.get("through", True) else z + depth / 2
                                    for angle in range(0, 360, 30):
                                        sample = (x + q["diameter"] / 2 * math.cos(math.radians(angle)), y + q["diameter"] / 2 * math.sin(math.radians(angle)), mid_z)
                                        if not shape.solids()[0].is_inside(sample, 1e-6):
                                            raise CadError("hole_outside_material", "A requested hole is outside the part or crosses an existing boundary at its mid-depth. Revise its location/diameter, or use an explicit cut for an open notch.", feature_id=feature.id, center=[x, y], index=[i, j])
                                    if any(math.dist((x, y), center) < q["diameter"] - 1e-6 for center in centers):
                                        raise CadError("overlapping_holes", "Patterned holes overlap or repeat the same position. Use an explicit slot/cut for merged openings.", feature_id=feature.id)
                                    centers.append((x, y))
                                    tools.append(Cylinder(q["diameter"] / 2, depth, align=(Align.CENTER, Align.CENTER, Align.MIN)).translate((x, y, z)))
                            result = shape.cut(*tools)
                            if abs(result.volume - shape.volume) < 1e-7:
                                raise CadError("no_effect", "The holes do not intersect this part. Check their centers and depth.")
                        elif feature.type in {"fillet", "chamfer"}:
                            if shape is None or not shape.solids():
                                raise CadError("missing_solid", "Add a solid before finishing edges.")
                            selector = feature.options.get("selector", {"group": "vertical"})
                            selected = edge_selector(shape, selector)
                            binding = {**selector, "expected_count": len(selected)}
                            amount = q["radius" if feature.type == "fillet" else "distance"]
                            if amount <= 1e-5:
                                raise CadError("invalid_dimension", "The edge finish must be positive.")
                            result = shape.fillet(amount, selected) if feature.type == "fillet" else shape.chamfer(amount, None, selected)
                        elif feature.type == "boolean":
                            mode = feature.options.get("operation", "cut")
                            if shape is None:
                                raise CadError("missing_solid", "Boolean operations need an existing target solid.")
                            offset = feature.options.get("offset", [0, 0, 0])
                            tool = source_shape.translate(tuple(float(v) for v in offset))
                            result = shape.cut(tool) if mode == "cut" else intersection(shape, tool) if mode == "intersect" else shape.fuse(tool)
                            tool = None
                        elif feature.type == "mirror":
                            plane = {"XY": Plane.XY, "YZ": Plane.YZ, "XZ": Plane.XZ}.get(feature.options.get("plane", "YZ"))
                            if plane is None:
                                raise CadError("invalid_plane", "Choose XY, YZ or XZ.")
                            result = source_shape.mirror(plane)
                        elif feature.type == "pattern":
                            if shape is None:
                                raise CadError("missing_solid", "Pattern a solid feature after creating geometry.")
                            axis = feature.options.get("axis", "X")
                            if axis not in {"X", "Y", "Z"}:
                                raise CadError("invalid_axis", "Pattern axis must be X, Y or Z.")
                            tools = []
                            for index in range(1, int(q["count"])):
                                delta = [0, 0, 0]
                                delta["XYZ".index(axis)] = q["spacing"] * index
                                tools.append(shape.translate(tuple(delta)))
                            result = shape.fuse(*tools) if tools else shape
                        if tool is not None:
                            if feature.type in {"rectangle", "circle", "sketch"}:
                                if shape is not None and not shape.solids() and shape.faces() and tool.faces() and operation in {"add", "cut", "intersect"}:
                                    result = shape.cut(tool) if operation == "cut" else intersection(shape, tool) if operation == "intersect" else shape.fuse(tool)
                                    if len(result.faces()) != 1 or not result.is_valid:
                                        raise CadError("planar_region", "A planar physical part needs one connected valid region. Create separate components for disconnected cut pieces.", feature_id=feature.id)
                                else:
                                    result = tool
                            elif operation == "new" or shape is None or not shape.solids():
                                result = tool
                            elif operation == "cut":
                                result = shape.cut(tool)
                            elif operation == "intersect":
                                result = intersection(shape, tool)
                            else:
                                result = shape.fuse(tool)
                        if result is None and feature.type != "sketch":
                            raise CadError("unsupported_feature", f"Feature '{feature.type}' did not produce geometry.")
                        if result is not None:
                            solids = result.solids()
                            if len(solids) > 1:
                                raise CadError("separate_components_required", "This operation would create disconnected bodies. Create separate components or use a component pattern instead.", feature_id=feature.id, solid_count=len(solids), auto_decision=operation_context.get("decision") if operation_context else None)
                            planar_operation = feature.type == "operation" and feature.options.get("motion") in {"none","mirror","pattern"} and feature.options.get("profile") != "body"
                            if planar_operation and len(result.faces())!=1:
                                raise CadError("planar_region","A planar component must remain one connected region. Use a new component for a separate profile.",feature_id=feature.id)
                            if feature.type not in {"rectangle", "circle", "sketch"} and not planar_operation and len(solids) == 0:
                                raise CadError("empty_solid", "This operation leaves no solid material. Change its extent or operation.", feature_id=feature.id)
                            if not result.is_valid:
                                raise CadError("invalid_solid", "The operation creates invalid geometry. Reduce the dimension or revise its supporting features.", feature_id=feature.id)
                            if solids and result.volume <= 1e-7:
                                raise CadError("empty_solid", "The operation removes the entire part.", feature_id=feature.id)
                        self.shape_cache[key] = (result, sketch_info, binding)
                        if operation_context and operation_context.get("decision"): self.operation_decisions[key]=operation_context["decision"]
                        if operation_context and operation_context.get("display"): self.operation_displays[key]=operation_context["display"]
                    if feature.type in {"rectangle", "circle", "sketch"} or (feature.type == "operation" and feature.options.get("motion") in {"none","mirror","pattern"} and feature.options.get("profile") != "body"):
                        profiles[feature.id], profile_keys[feature.id] = result, key
                    if sketch_info:
                        sketches[feature.id] = sketch_info
                    if binding:
                        bindings[feature.id] = binding
                    if feature.type=="operation" and key in self.operation_decisions:
                        operation_decisions[feature.id]=self.operation_decisions[key]
                    if feature.type=="operation" and key in self.operation_displays:operation_displays[feature.id]=self.operation_displays[key]
                    # A construction sketch must not replace an already-built physical body.
                    if feature.type not in {"rectangle", "circle", "sketch"} or shape is None or not shape.solids():
                        shape, body_key = result, key
                except CadError:
                    raise
                except Exception as exc:
                    raise CadError("geometry_failed", f"'{feature.name}' could not be built. Check dimensions, references, and the selected edges.",
                                   feature_id=feature.id, component=identifier, reason=str(exc)[:800]) from exc
                elapsed = (time.perf_counter() - started) * 1000
                if not cached:
                    self.timings[key] = elapsed
                timings[feature.id] = {"elapsed_ms": elapsed, "last_compute_ms": self.timings.get(key, elapsed), "cached": cached,
                                       "expensive": self.timings.get(key, elapsed) >= 500}
            evaluating.remove(identifier)
            if component.kind == "assembly":
                shape, body_key = None, "assembly"
            completed[identifier] = (shape, body_key)
            return shape, body_key

        self.shapes = {}
        resolve_component("root")
        for identifier, component in document.components.items():
            if component.kind == "assembly":
                continue
            shape, key = resolve_component(identifier)
            if shape is None:
                output[identifier] = {"status": "draft", "volume": None, "area": None, "mesh": None}
                continue
            self.shapes[identifier] = shape
            envelope = bounds(shape)
            if max(envelope["size"]) > 10_000 or max(abs(v) for v in envelope["min"] + envelope["max"]) > 10_000:
                raise CadError("supported_envelope", "Parts must fit within a 10,000 mm span and local coordinates ±10,000 mm in this release.", component=identifier)
            thickness = values[component.stock_thickness] if component.stock_thickness else None
            preview = component.kind == "planar" and component.stock_preview and thickness and len(shape.faces()) == 1
            display_shape = Solid.extrude(shape.faces()[0], shape.faces()[0].normal_at() * thickness) if preview else shape
            mesh_key = f"{key}:{tessellation}:{thickness if preview else 'nominal'}"
            if mesh_key not in self.mesh_cache:
                self.mesh_cache[mesh_key] = mesh_data(display_shape, tessellation)
            mesh = self.mesh_cache[mesh_key]
            solids = shape.solids()
            output[identifier] = {"status": "valid" if solids else "planar" if shape.faces() else "open_profile", "bounds": envelope, "center":vector(shape.center()),
                "stock_thickness_mm": thickness, "thickness_preview": bool(preview),
                "volume": float(shape.volume) if solids else None, "area": float(shape.area), "solid_count": len(solids),
                "face_count": len(shape.faces()), "edge_count": len(shape.edges()), "faces": [dict(face) for face in mesh["faces"]], "edges": mesh["edges"], "vertices": mesh["points"], "vertex_info":[{"id":f"vertex_{i}","name":f"Vertex {i+1}","point":point} for i,point in enumerate(mesh["points"])],
                "triangles": mesh["triangles"], "mesh": mesh["buffer"], "geometry_key": mesh_key}
            # A generating dimension is only offered for a unique planar top face.
            top = [f for f in output[identifier]["faces"] if f["type"] == "PLANE" and f["normal"][2] > .999 and abs(f["center"][2] - output[identifier]["bounds"]["max"][2]) < 1e-5]
            generators = []
            for identifier_feature in component.feature_ids:
                generator = document.features[identifier_feature]
                if generator.suppressed or generator.options.get("operation") == "cut":
                    continue
                q = {field: values[p] for field, p in generator.parameters.items()}
                expected_top = None
                if generator.type in {"box", "cylinder"}:
                    expected_top = q["z"] + q["height"]
                elif generator.type == "extrude" and q["distance"] > 0:
                    profile = profiles.get(generator.references.get("profile"))
                    if profile is not None and profile.faces() and profile.faces()[0].normal_at().Z > .999:
                        expected_top = profile.bounding_box().max.Z + q["distance"]
                if expected_top is not None and abs(expected_top - output[identifier]["bounds"]["max"][2]) < 1e-5:
                    generators.append(generator)
            if len(top) == 1 and len(generators) == 1:
                generator = generators[0]
                top[0]["controlling_parameter"] = generator.parameters.get("distance", generator.parameters.get("height"))
        if len(self.shape_cache) > self.maximum_cache:
            keep = list(self.shape_cache)[-self.maximum_cache:]
            self.shape_cache = {k: self.shape_cache[k] for k in keep}
            self.operation_decisions = {k:v for k,v in self.operation_decisions.items() if k in self.shape_cache}
            self.operation_displays = {k:v for k,v in self.operation_displays.items() if k in self.shape_cache}
        if len(self.mesh_cache) > 100:
            self.mesh_cache = {k: self.mesh_cache[k] for k in list(self.mesh_cache)[-100:]}
        profile_info={}
        for identifier,profile in profiles.items():
            faces=profile.faces() if profile is not None else []
            if faces:
                key=profile_keys[identifier]
                if key not in self.profile_display_cache:
                    self.profile_display_cache[key]={"status":"closed","region_count":len(faces),"center":vector(faces[0].center()),"normal":vector(faces[0].normal_at()),"outlines":[loop for face in faces for loop in face_outlines(face)]}
                profile_info[identifier]=self.profile_display_cache[key]
            else: profile_info[identifier]={"status":"open"}
        if len(self.profile_display_cache)>self.maximum_cache:
            self.profile_display_cache={k:self.profile_display_cache[k] for k in list(self.profile_display_cache)[-self.maximum_cache:]}
        return {"components": output, "timings": timings, "bindings": bindings, "sketches": sketches, "profiles":profile_info, "values": values,"operation_decisions":operation_decisions,"operation_displays":operation_displays}

    def measure(self, payload, first, second, matrices):
        self.evaluate(payload)
        from OCP.gp import gp_Trsf
        from build123d import Location
        shapes = []
        for identifier, matrix in zip((first, second), matrices):
            if identifier not in self.shapes:
                raise CadError("missing_solid", "Both selections must have evaluated solids.")
            transform = gp_Trsf()
            transform.SetValues(*[float(value) for row in np.asarray(matrix).reshape(4, 4)[:3] for value in row])
            shapes.append(self.shapes[identifier].moved(Location(transform)))
        overlap = intersection(shapes[0], shapes[1])
        return {"distance": float(shapes[0].distance_to(shapes[1])), "intersection_volume": float(overlap.volume) if overlap else 0.,
                "units": "mm", "method": "OCCT minimum distance and solid intersection; static placement only"}

    def export(self, payload, selections, destination, tolerance=.03, angular=.1):
        self.evaluate(payload)
        if not 0.001 <= tolerance <= 1 or not .01 <= angular <= .5:
            raise CadError("invalid_tessellation", "Use linear deflection 0.001–1 mm and angular deflection 0.01–0.5 radians.")
        from build123d import Location
        from OCP.gp import gp_Trsf
        destination = Path(destination)
        destination.mkdir(parents=True, exist_ok=False)
        receipts = []
        try:
            for index, selection in enumerate(selections):
                identifier = selection["definition"]
                if identifier not in self.shapes or len(self.shapes[identifier].solids()) != 1:
                    raise CadError("not_exportable", "Every selected output must be one valid solid. Extrude planar parts before STL export.", component=identifier)
                shape = self.shapes[identifier]
                if selection.get("matrix"):
                    transform = gp_Trsf()
                    transform.SetValues(*[float(v) for row in np.asarray(selection["matrix"]).reshape(4, 4)[:3] for v in row])
                    shape = shape.moved(Location(transform))
                vertices, triangles = shape.tessellate(tolerance, angular)
                # Validate the coordinates actually written by binary STL's float32 format.
                positions = np.asarray([vector(v) for v in vertices], dtype=np.float32).astype(np.float64)
                faces = np.asarray(triangles, dtype=np.int64)
                report = validate_mesh(positions, faces)
                if not report["valid"]:
                    raise CadError("invalid_export_mesh", "The tessellated mesh failed export validation.", component=identifier, validation=report)
                filename = selection["filename"]
                path = destination / filename
                with path.open("wb") as file:
                    file.write(b"RyanCAD | millimeter coordinates".ljust(80, b" "))
                    file.write(struct.pack("<I", len(faces)))
                    for face in faces:
                        a, b, c = positions[face]
                        normal = np.cross(b - a, c - a)
                        normal /= np.linalg.norm(normal)
                        file.write(struct.pack("<12fH", *normal, *a, *b, *c, 0))
                    file.flush()
                    import os
                    os.fsync(file.fileno())
                receipts.append({**selection, "triangles": len(faces), "bounds": bounds(shape), "volume_mm3": float(shape.volume), "validation": report})
            receipt = {"revision": payload["revision"], "document_id": payload["id"], "units": "mm", "linear_deflection_mm": tolerance,
                       "angular_deflection_rad": angular, "files": receipts, "complete": True}
            (destination / "receipt.json").write_text(json.dumps(receipt, indent=2), "utf-8")
            return receipt
        except Exception:
            # A failed batch never receives a completion receipt; caller removes only its own staging directory.
            raise


def validate_mesh(vertices, faces):
    """Check welded edge incidence/winding, degeneracy and signed material volume."""
    from collections import Counter
    edges = Counter()
    winding = Counter()
    points, point_ids = {}, []
    for point in vertices:
        key = tuple(round(float(value), 6) for value in point)
        point_ids.append(points.setdefault(key, len(points)))
    degenerate = 0
    signed_volume = 0.
    for indices in faces:
        a, b, c = vertices[indices]
        if np.linalg.norm(np.cross(b - a, c - a)) < 1e-10:
            degenerate += 1
        signed_volume += float(np.dot(a, np.cross(b, c))) / 6
        triangle = [point_ids[int(i)] for i in indices]
        for first, second in zip(triangle, triangle[1:] + triangle[:1]):
            key = (min(first, second), max(first, second))
            edges[key] += 1
            winding[key] += 1 if first < second else -1
    boundary = sum(count == 1 for count in edges.values())
    nonmanifold = sum(count > 2 for count in edges.values())
    inconsistent = sum(value != 0 for value in winding.values())
    from .meshcheck import intersecting_triangles
    intersections = intersecting_triangles(vertices, faces, np.asarray(point_ids)[faces]) if not degenerate else {"intersections": 0, "skipped": "degenerate geometry"}
    return {"valid": bool(len(faces) and not (boundary or nonmanifold or inconsistent or degenerate or intersections["intersections"]) and signed_volume > 1e-9),
            "boundary_edges": boundary, "nonmanifold_edges": nonmanifold, "inconsistent_edges": inconsistent,
            "degenerate_triangles": degenerate, "signed_volume_mm3": signed_volume,
            "self_intersection": intersections,
            "coverage": "OCCT B-rep validity, float32 STL mesh topology/orientation, BVH/SAT nonadjacent triangle intersections. Welded vertex-adjacent triangle pairs excluded; numerical tolerance 1e-7 mm, not an exact-arithmetic proof.",
            "weld_rounding_mm": 0.000001}

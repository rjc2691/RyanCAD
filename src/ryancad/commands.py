"""Pure document edits. All clients use this same validated command vocabulary."""
from __future__ import annotations

import copy
import re
from typing import Any

from .errors import CadError
from .model import Actor, Component, Document, Feature, Instance, Parameter, Tolerance, uid
from .parameters import bind_expression, evaluate

PALETTE = ["#689ac5", "#70a997", "#c18e70", "#9c8fbe", "#c5aa68", "#b77d8e", "#acbcc9", "#657487"]


def references_component(value, component):
    if isinstance(value, dict):
        return value.get("component") == component or any(references_component(v, component) for v in value.values())
    if isinstance(value, list):
        return any(references_component(v, component) for v in value)
    return False

FEATURE_FIELDS = {
    "mesh": {},
    "sphere": {"diameter": ("length", 20), "x": ("length", 0), "y": ("length", 0), "z": ("length", 0)},
    "box": {"length": ("length", 40), "width": ("length", 30), "height": ("length", 10),
            "x": ("length", 0), "y": ("length", 0), "z": ("length", 0)},
    "cylinder": {"diameter": ("length", 10), "height": ("length", 20),
                 "x": ("length", 0), "y": ("length", 0), "z": ("length", 0)},
    "rectangle": {"length": ("length", 60), "width": ("length", 40), "z": ("length", 0)},
    "circle": {"diameter": ("length", 20), "x": ("length", 0), "y": ("length", 0), "z": ("length", 0)},
    "extrude": {"distance": ("length", 6)},
    "revolve": {"angle": ("angle", 360)},
    "holes": {"diameter": ("length", 5), "depth": ("length", 10), "x": ("length", 0), "y": ("length", 0),
              "z": ("length", 0), "count_x": ("count", 1), "count_y": ("count", 1),
              "spacing_x": ("length", 20), "spacing_y": ("length", 20)},
    "fillet": {"radius": ("length", 2)},
    "chamfer": {"distance": ("length", 1)},
    "mirror": {},
    "boolean": {},
    "pattern": {"count": ("count", 2), "spacing": ("length", 10)},
}


def require(mapping, identifier, label="entity"):
    if identifier not in mapping:
        raise CadError("missing_entity", f"The {label} '{identifier}' does not exist.", id=identifier)
    return mapping[identifier]


def parameter(document: Document, actor: Actor, owner: str, name: str, value: Any, kind="length", category="Dimensions", named=False) -> str:
    if isinstance(value, str) and not named:
        label = value.strip().removeprefix("[").removesuffix("]")
        matches = [p for p in document.parameters.values() if p.named and (p.name.casefold() == label.casefold() or p.id == label)]
        if len(matches) == 1:
            value = {"parameter": matches[0].id}
    if isinstance(value, dict):
        if set(value) != {"parameter"}:
            raise CadError("invalid_parameter_reference", "Reuse a parameter with {'parameter': '<id>'}.")
        existing = require(document.parameters, value["parameter"], "parameter")
        if existing.named is False:
            raise CadError("named_parameter_required", "Create a named parameter to reuse a value; ordinary dimensions belong to their operation.")
        if existing.kind != kind:
            raise CadError("unit_mismatch", f"'{existing.name}' is {existing.kind}; this field needs {kind}.")
        return existing.id
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        raise CadError("invalid_value", "Enter a number with units, an expression, or a parameter reference.")
    identifier = uid("p")
    siblings = {p.name for p in document.parameters.values() if p.owner == owner}
    label, number = name, 2
    while label in siblings:
        label, number = f"{name} {number}", number + 1
    document.parameters[identifier] = Parameter(id=identifier, name=label[:120], named=named, owner=owner, kind=kind,
        expression=bind_expression(value, document, owner), category=category, created_by=actor.id, modified_by=actor.id)
    return identifier


def create_instance(document, actor, definition, name=None, parent="root", placement=None):
    require(document.components, definition, "component")
    container = require(document.components, parent, "assembly")
    if container.kind != "assembly":
        raise CadError("invalid_owner", "Instances must belong to an assembly.")
    instance = Instance(id=uid("inst"), name=name or document.components[definition].name,
                        definition=definition, parent=parent, created_by=actor.id)
    for field, value in (placement or {}).items():
        if field not in {"x", "y", "z", "rx", "ry", "rz"}:
            raise CadError("invalid_transform", f"Unsupported placement field {field}.")
        instance.placement[field] = parameter(document, actor, parent, f"{instance.name} · {field.upper()}", value,
            "angle" if field.startswith("r") else "length", "Placement")
    document.instances[instance.id] = instance
    return instance


def create_component(document, actor, name, kind="solid", parent="root", color=None, placement=None):
    if kind not in {"solid", "planar", "assembly"}:
        raise CadError("invalid_kind", "A component is solid, planar, or an assembly.")
    if len(document.components) >= 250:
        raise CadError("document_limit", "This release supports at most 250 component definitions.")
    base=str(name).strip()[:110] or "Part"
    label=base;index=2;names={c.name.strip().casefold() for c in document.components.values() if c.id!='root'}
    while not document.structure_version and label.casefold() in names:label=f"{base} {index}";index+=1
    component = Component(id=uid("part" if kind != "assembly" else "asm"), name=label, kind=kind,
        color=color or PALETTE[(len(document.components) - 1) % len(PALETTE)], created_by=actor.id, modified_by=actor.id)
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", component.color):
        raise CadError("invalid_color", "Use a six-digit hexadecimal color.")
    document.components[component.id] = component
    instance = create_instance(document, actor, component.id, parent=parent, placement=placement)
    return component, instance


def create_feature(document, actor, owner, feature_type, values=None, options=None, references=None, name=None):
    component = require(document.components, owner, "component")
    if component.kind == "assembly":
        raise CadError("invalid_owner", "Create a physical part before adding modeling features.")
    if feature_type not in FEATURE_FIELDS:
        raise CadError("unsupported_feature", f"Feature type '{feature_type}' is not supported.")
    options = options or {}
    if options.get("operation", "add") not in {"new", "add", "cut", "intersect"}:
        raise CadError("invalid_operation", "Choose new, add, cut or intersect.")
    if "plane" in options and options["plane"] not in {"XY", "XZ", "YZ"}:
        raise CadError("invalid_plane", "Choose XY, XZ or YZ.")
    if feature_type == "boolean" and options.get("offset"):
        raise CadError("unsupported_transform", "Boolean source definitions use explicit local coordinates. Place source geometry with parameterized features instead of an untracked offset.")
    if len(document.features) >= 2000:
        raise CadError("document_limit", "This release supports at most 2,000 modeling features.")
    feature = Feature(id=uid("ft"), owner=owner, type=feature_type, name=name or feature_type.title(),
                      options=copy.deepcopy(options or {}), references=copy.deepcopy(references or {}),
                      created_by=actor.id, modified_by=actor.id)
    values = values or {}
    unknown = set(values) - set(FEATURE_FIELDS[feature_type])
    if unknown:
        raise CadError("unknown_field", f"Unsupported {feature_type} inputs: {', '.join(sorted(unknown))}.")
    for field, (kind, default) in FEATURE_FIELDS[feature_type].items():
        feature.parameters[field] = parameter(document, actor, owner, f"{feature.name} · {field.replace('_', ' ')}",
                                              values.get(field, default), kind, feature_type.title())
    document.features[feature.id] = feature
    component.feature_ids.append(feature.id)
    component.modified_by = actor.id
    document.feature_order.append(feature.id)
    return feature


def reduce(document: Document, actor: Actor, name: str, args: dict) -> tuple[dict, list[str], str]:
    """Mutate an isolated candidate; evaluator/persistence decide whether it can commit."""
    from .project_structure import STRUCTURE_COMMANDS, structure_command
    if name in STRUCTURE_COMMANDS:
        return structure_command(document, actor, name, args)
    if document.structure_version:
        owner = args.get("target") if name == "operation.create" else args.get("owner") if name == "feature.create" else None
        if name == "feature.update":
            edited = document.features.get(args.get("id"))
            owner = edited.owner if edited else None
        if owner and ("__" in owner or document.components.get(owner) and document.components[owner].read_only):
            raise CadError("read_only_part", "Edit the base part to change a variation. Imported bodies are read-only.")
    if name == "operation.create":
        if document.structure_version:
            from .project_structure import resolve_operation_occurrences
            args = resolve_operation_occurrences(document, args)
        from .operations import create_operation
        return create_operation(document, actor, args)
    if name == "feature.update":
        from .feature_edits import update_feature
        return update_feature(document, actor, args)
    if name == "document.rename":
        document.name = str(args.get("name", "Untitled design"))[:180]
        return {}, [], f"Rename design to {document.name}"
    if name == "document.describe":
        description = args.get("description", "")
        if not isinstance(description, str) or len(description) > 4000:
            raise CadError("invalid_description", "Design descriptions must be text containing at most 4000 characters.")
        document.notes = description.strip()
        return {}, [], "Update design description"
    if name == "document.units":
        if args.get("units") not in {"mm", "in"}:
            raise CadError("unsupported_unit", "Display units are mm or in.")
        document.display_units = args["units"]
        return {}, [], f"Display dimensions in {args['units']}"
    if name.startswith("group."):
        from .groups import group_command
        return group_command(document,actor,name,args)
    if name == "component.create":
        component, instance = create_component(document, actor, args.get("name", "Part"), args.get("kind", "solid"),
            args.get("parent", "root"), args.get("color"), args.get("placement"))
        return {"component_id": component.id, "instance_id": instance.id}, [component.id, instance.id], f"Create {component.name}"
    if name == "toolbody.create":
        label=str(args.get("name") or "Tool body").strip() or "Tool body"
        base=label;index=2
        while any(c.name==label for c in document.components.values()):label=f"{base} {index}";index+=1
        component,instance=create_component(document,actor,label,"solid")
        component.purpose="tool"
        return {"component_id":component.id,"instance_id":instance.id,"occurrence_id":instance.id},[component.id,instance.id],f"Create tool body · {label}"
    if name == "document.normalize_names":
        seen=set();changed=[]
        for c in document.components.values():
            if c.id=='root':continue
            base=c.name.strip()[:110] or 'Component';label=base;index=2
            while label.casefold() in seen:label=f'{base} {index}';index+=1
            seen.add(label.casefold())
            if label!=c.name:c.name=label;c.modified_by=actor.id;changed.append(c.id)
        return {'renamed':len(changed)},changed,'Make component names unique'
    if name == "component.rename":
        component = require(document.components, args["id"], "component")
        label=str(args["name"]).strip()[:120]
        if not label:raise CadError("invalid_name","Give the component a name.")
        if (not document.structure_version or component.structure_role in {"part", "layout"}) and label!=component.name and any(c.id not in {component.id,'root'} and (not document.structure_version or c.structure_role==component.structure_role) and c.name.strip().casefold()==label.casefold() for c in document.components.values()):
            raise CadError("duplicate_name","That component name is already in use. Choose a unique name.")
        component.name = label
        component.modified_by = actor.id
        if "color" in args:
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", args["color"]):
                raise CadError("invalid_color", "Use a six-digit hexadecimal color.")
            component.color = args["color"]
        return {}, [component.id], f"Update {component.name}"
    if name == "component.stock":
        component = require(document.components, args["id"], "component")
        if component.kind != "planar":
            raise CadError("invalid_kind", "Stock thickness describes a planar manufactured part. Extrusion explicitly converts it into a solid.")
        value = args.get("value", 3)
        if component.stock_thickness and not isinstance(value, dict):
            p = document.parameters[component.stock_thickness]
            p.expression, p.modified_by = bind_expression(value, document, component.id), actor.id
        else:
            component.stock_thickness = parameter(document, actor, component.id, "Stock thickness", value, category="Sheet stock")
        component.stock_preview = bool(args.get("preview", True))
        component.modified_by = actor.id
        return {"parameter_id": component.stock_thickness}, [component.id, component.stock_thickness], f"Set stock thickness · {component.name}"
    if name == "component.delete":
        from .parameters import dependencies
        component = require(document.components, args["id"], "component")
        if component.id == "root":
            raise CadError("invalid_selection", "The root assembly cannot be deleted.")
        if any(i.parent == component.id for i in document.instances.values()):
            raise CadError("component_not_empty", "Move this assembly's child instances before deleting it.")
        local_parameters = {p.id for p in document.parameters.values() if p.owner == component.id}
        users = [f.id for f in document.features.values() if f.owner != component.id and
                 (references_component(f.references, component.id) or f.references.get("profile") in component.feature_ids or any(p in local_parameters for p in f.parameters.values()))]
        users += [p.id for p in document.parameters.values() if p.owner != component.id and dependencies(p.expression) & local_parameters]
        users += [i.id for i in document.instances.values() if any(p in local_parameters for p in i.placement.values())]
        if users:
            raise CadError("component_in_use", "Other design entities depend on this component. Suppress its instances or repair those dependencies first.", consumers=users)
        for identifier in component.feature_ids:
            document.features.pop(identifier)
        document.feature_order = [f for f in document.feature_order if f not in component.feature_ids]
        document.parameters = {p: value for p, value in document.parameters.items() if p not in local_parameters}
        document.instances = {i: value for i, value in document.instances.items() if value.definition != component.id}
        document.fits = {i: value for i, value in document.fits.items() if value.pin_parameter not in local_parameters and value.socket_parameter not in local_parameters}
        document.components.pop(component.id)
        return {}, [component.id], f"Delete component · {component.name}"
    if name == "component.duplicate":
        definition = require(document.components, args["id"], "component")
        if definition.kind == "assembly":
            raise CadError("unsupported_operation", "Assembly duplication is not available yet; repeat its part instances.")
        instance = create_instance(document, actor, definition.id, args.get("name"), args.get("parent", "root"), args.get("placement", {"x": 30}))
        return {"instance_id": instance.id}, [instance.id], f"Repeat {definition.name} as linked instance"
    if name == "component.independent":
        instance = require(document.instances, args["instance_id"], "instance")
        if instance.pattern_mode:
            import math
            from .service import local_matrix, pattern_delta
            values = evaluate(document)
            index = int(args.get("pattern_index", 0))
            if not 0 <= index < int(values[instance.pattern["count"]]) or index in instance.omitted_indices:
                raise CadError("missing_instance", "This pattern member does not exist.")
            matrix = pattern_delta(instance, values, index) @ local_matrix(instance, values)
            ry = math.asin(max(-1, min(1, float(matrix[0, 2]))))
            rx = math.atan2(-float(matrix[1, 2]), float(matrix[2, 2]))
            rz = math.atan2(-float(matrix[0, 1]), float(matrix[0, 0]))
            placement = dict(zip(("x", "y", "z"), [float(v) for v in matrix[:3, 3]]))
            placement.update(rx=math.degrees(rx), ry=math.degrees(ry), rz=math.degrees(rz))
            instance.omitted_indices.append(index)
            instance = create_instance(document, actor, instance.definition, instance.name + " independent", instance.parent, placement)
        original = require(document.components, instance.definition, "component")
        if original.kind == "assembly":
            raise CadError("unsupported_operation", "Make individual physical parts independent.")
        duplicate = original.model_copy(deep=True)
        duplicate.id, duplicate.name = uid("part"), args.get("name", original.name + " independent")
        base=duplicate.name.strip()[:110] or 'Component';label=base;index=2
        names={c.name.strip().casefold() for c in document.components.values() if c.id!='root'}
        while label.casefold() in names:label=f'{base} {index}';index+=1
        duplicate.name=label

        duplicate.source_definition = original.id
        duplicate.created_by = duplicate.modified_by = actor.id
        mapping = {}
        for p in list(document.parameters.values()):
            if p.owner == original.id:
                cloned = p.model_copy(deep=True)
                cloned.id, cloned.owner = uid("p"), duplicate.id
                cloned.created_by = cloned.modified_by = actor.id
                mapping[p.id] = cloned.id
                document.parameters[cloned.id] = cloned
        for identifier in mapping.values():
            for old, new in mapping.items():
                document.parameters[identifier].expression = document.parameters[identifier].expression.replace(old, new)
        feature_map = {identifier: uid("ft") for identifier in original.feature_ids}
        for identifier in original.feature_ids:
            cloned = document.features[identifier].model_copy(deep=True)
            cloned.id, cloned.owner = feature_map[identifier], duplicate.id
            cloned.parameters = {key: mapping.get(value, value) for key, value in cloned.parameters.items()}
            cloned.references = {key: feature_map.get(value, value) if isinstance(value, str) else value for key, value in cloned.references.items()}
            cloned.created_by = cloned.modified_by = actor.id
            document.features[cloned.id] = cloned
            document.feature_order.append(cloned.id)
        duplicate.feature_ids = [feature_map[f] for f in original.feature_ids]
        duplicate.stock_thickness = mapping.get(original.stock_thickness, original.stock_thickness)
        document.components[duplicate.id] = duplicate
        instance.definition = duplicate.id
        return {"component_id": duplicate.id}, [instance.id, duplicate.id], f"Make {instance.name} independent"
    if name == "component.pattern":
        instance = require(document.instances, args["instance_id"], "instance")
        if document.components[instance.definition].kind == "assembly":
            raise CadError("unsupported_operation", "Pattern physical part instances in this release.")
        mode, axis = args.get("mode", "linear"), args.get("axis", "X")
        if mode not in {"linear", "circular"} or axis not in {"X", "Y", "Z"}:
            raise CadError("invalid_pattern", "Choose a linear/circular pattern and X/Y/Z axis.")
        instance.pattern_mode, instance.pattern_axis = mode, axis
        for field, value, kind in [("count", args.get("count", 3), "count"), ("spacing", args.get("spacing", 20), "length"), ("angle", args.get("angle", 45), "angle")]:
            if field in instance.pattern and not isinstance(value, dict):
                p = document.parameters[instance.pattern[field]]
                p.expression, p.modified_by = bind_expression(value, document, p.owner), actor.id
            else:
                instance.pattern[field] = parameter(document, actor, instance.parent, f"{instance.name} pattern · {field}", value, kind, "Component patterns")
        return {"instance_id": instance.id}, [instance.id], f"{mode.title()} component pattern · {instance.name}"
    if name == "instance.move":
        from .movement import move_component
        return move_component(document, actor, args)
    if name == "instance.transform":
        instance = require(document.instances, args["id"], "instance")
        from .placements import bake_rotation
        bake_rotation(document, actor, instance)
        for field in ("x", "y", "z", "rx", "ry", "rz"):
            if field not in args:
                continue
            value = args[field]
            if field in instance.placement and not isinstance(value, dict):
                p = document.parameters[instance.placement[field]]
                p.expression, p.modified_by = bind_expression(value, document, p.owner), actor.id
            else:
                instance.placement[field] = parameter(document, actor, instance.parent, f"{instance.name} · {field.upper()}", value,
                    "angle" if field.startswith("r") else "length", "Placement")
        return {}, [instance.id], f"Move Component · {instance.name}"
    if name == "instance.reparent":
        instance = require(document.instances, args["id"], "instance")
        parent = require(document.components, args["parent"], "assembly")
        if parent.kind != "assembly":
            raise CadError("invalid_owner", "Choose an assembly container.")
        instance.parent = parent.id
        return {"instance_id": instance.id}, [instance.id], f"Move {instance.name} into {parent.name} · local placement preserved"
    if name == "instance.visibility":
        instance = require(document.instances, args["id"], "instance")
        instance.visible = bool(args["visible"])
        return {}, [instance.id], f"{'Show' if instance.visible else 'Hide'} {instance.name}"
    if name == "instance.suppress":
        instance = require(document.instances, args["id"], "instance")
        instance.suppressed = bool(args["suppressed"])
        return {}, [instance.id], f"{'Suppress' if instance.suppressed else 'Restore'} {instance.name}"
    if name == "parameter.create":
        owner = "root"
        label = str(args.get("name", "Parameter")).strip()
        if not label or len(label) > 120 or any(p.named and p.name.casefold() == label.casefold() for p in document.parameters.values()):
            raise CadError("invalid_name", "Use a unique parameter name with 1–120 characters.")
        require(document.components, owner, "component")
        value = args.get("value", 1)
        if isinstance(value, dict):
            source = require(document.parameters, value.get("parameter"), "parameter")
            if not source.named:
                raise CadError("named_parameter_required", "Only deliberately named values can be reused.")
            value = source.id
        identifier = parameter(document, actor, owner, label, value, args.get("kind", "length"), args.get("category", "Shared"), named=True)
        document.parameters[identifier].name = label
        return {"parameter_id": identifier}, [identifier], f"Create parameter {document.parameters[identifier].name}"
    if name in {"parameter.set", "parameter.rename", "parameter.promote"}:
        p = require(document.parameters, args["id"], "parameter")
        if p.named and "name" in args and not 1 <= len(str(args["name"]).strip()) <= 120:
            raise CadError("invalid_name", "Use a parameter name with 1–120 characters.")
        if "value" in args:
            p.expression = bind_expression(args["value"], document, p.owner)
        if "name" in args and p.named and any(other.id != p.id and other.named and other.name.casefold() == str(args["name"]).strip().casefold() for other in document.parameters.values()):
            raise CadError("invalid_name", "Parameter names must be unique.")
        for field in ("name", "category", "description", "favorite"):
            if field in args:
                setattr(p, field, args[field])
        if "tolerance" in args:
            p.tolerance = Tolerance.model_validate(args["tolerance"]) if args["tolerance"] is not None else None
        if name == "parameter.promote":
            p.owner = "root"
            p.named = True
            p.category = args.get("category", "Shared standards")
        p.modified_by = actor.id
        return {"parameter_id": p.id}, [p.id], f"Update {p.name}"
    if name == "parameter.link":
        feature = require(document.features, args["feature_id"], "feature")
        target = require(document.parameters, args["parameter_id"], "parameter")
        if not target.named:
            raise CadError("named_parameter_required", "Create a named parameter to reuse a value.")
        current = require(document.parameters, feature.parameters.get(args["field"]), "parameter")
        if current.kind != target.kind:
            raise CadError("unit_mismatch", "The linked parameter must have the same dimensional type.")
        feature.parameters[args["field"]] = target.id
        feature.modified_by = actor.id
        return {}, [feature.id, target.id], f"Reuse {target.name} in {feature.name}"
    if name == "parameter.offset":
        from .parameters import dependencies
        p = require(document.parameters, args["id"], "parameter")
        current = evaluate(document)[p.id]
        temporary = parameter(document, actor, p.owner, "Offset preview", args["delta"], p.kind)
        delta = evaluate(document)[temporary]
        target = current + delta
        unit = "mm" if p.kind == "length" else "deg" if p.kind == "angle" else ""
        if dependencies(p.expression):
            offset = document.parameters[temporary]
            offset.name, offset.category = p.name + " offset", "Direct edits"
            p.expression = f"({p.expression}) + {temporary}"
        else:
            document.parameters.pop(temporary)
            p.expression = bind_expression(f"{target} {unit}", document, p.owner)
        p.modified_by = actor.id
        return {"parameter_id": p.id, "before": current, "after": target}, [p.id], f"Offset {p.name} by {delta:g} {unit}"
    if name == "parameter.delete":
        from .parameters import graph
        p = require(document.parameters, args["id"], "parameter")
        info = graph(document, evaluate(document))["parameters"][p.id]
        if info["use_count"] or any(p.id in {f.pin_parameter, f.socket_parameter} for f in document.fits.values()):
            raise CadError("parameter_in_use", "This dimension still has consumers. Unlink them before deleting it.", consumers=info["consumers"], downstream=info["downstream"])
        document.parameters.pop(p.id)
        return {}, [p.id], f"Delete unused parameter · {p.name}"
    if name == "parameter.independent":
        feature = require(document.features, args["feature_id"], "feature")
        p = require(document.parameters, feature.parameters.get(args["field"]), "parameter")
        value = evaluate(document)[p.id]
        identifier = parameter(document, actor, feature.owner, args.get("name", p.name + " independent"), value, p.kind, p.category)
        feature.parameters[args["field"]] = identifier
        feature.modified_by = actor.id
        return {"parameter_id": identifier}, [feature.id, identifier], f"Make {feature.name} dimension independent"
    if name == "feature.create":
        kind = args["type"]
        owner = args.get("owner")
        if owner and kind in {"box", "cylinder", "extrude", "revolve"} and args.get("options", {}).get("operation") == "new":
            raise CadError("invalid_intent", "A new physical part requires its own component. Omit owner to create one, or use add/cut in the selected part.")
        if not owner and args.get("options", {}).get("operation") in {"cut", "intersect"}:
            raise CadError("missing_target", "Choose an existing part for a subtractive or intersecting operation.")
        created = {}
        if not owner:
            component, instance = create_component(document, actor, args.get("component_name", args.get("name", kind.title())),
                                                   "planar" if kind in {"rectangle", "circle"} else "solid", placement=args.get("placement"))
            owner = component.id
            created = {"component_id": owner, "instance_id": instance.id}
        feature = create_feature(document, actor, owner, kind, args.get("values"), args.get("options"), args.get("references"), args.get("name"))
        if kind in {"extrude", "revolve"}:
            document.components[owner].kind = "solid"
        return {**created, "feature_id": feature.id}, [owner, feature.id], f"{feature.name} · {document.components[owner].name}"
    if name == "feature.suppress":
        feature = require(document.features, args["id"], "feature")
        feature.suppressed = bool(args["suppressed"])
        feature.modified_by = actor.id
        return {}, [feature.id], f"{'Suppress' if feature.suppressed else 'Restore'} {feature.name}"
    if name == "feature.rename":
        feature = require(document.features, args["id"], "feature")
        feature.name, feature.modified_by = str(args["name"])[:120], actor.id
        return {}, [feature.id], f"Rename feature to {feature.name}"
    if name == "feature.repair":
        feature = require(document.features, args["id"], "feature")
        if "selector" not in args:
            raise CadError("invalid_selection", "Specify an explicit replacement selector.")
        feature.options["selector"] = args["selector"]
        feature.modified_by = actor.id
        return {}, [feature.id], f"Repair selection for {feature.name}"
    if name == "fit.create":
        raise CadError("unsupported_feature", "Cross-component fit constraints are disabled. Use independent dimensions or explicitly named values.")
    if name == "sketch.delete":
        feature = require(document.features, args.get("id"), "sketch")
        if feature.type != "sketch":
            raise CadError("invalid_selection", "Choose a sketch.")
        if any(f.id != feature.id and feature.id in str(f.references) for f in document.features.values()):
            raise CadError("sketch_in_use", "Other features still reference this sketch.")
        document.components[feature.owner].feature_ids.remove(feature.id)
        document.feature_order.remove(feature.id)
        del document.features[feature.id]
        return {}, [feature.id], f"Delete sketch · {feature.name}"
    if name.startswith("sketch."):
        from .sketches import edit_sketch
        return edit_sketch(document, actor, name, args)
    if name == "batch":
        commands = args.get("commands", [])
        if not isinstance(commands, list) or not 1 <= len(commands) <= 100:
            raise CadError("batch_limit", "An atomic batch contains 1–100 commands.")
        results, affected, descriptions = [], [], []
        for entry in commands:
            if entry.get("name") == "batch":
                raise CadError("batch_limit", "Nested batches are not supported.")
            result, changed, description = reduce(document, actor, entry["name"], entry.get("args", {}))
            results.append(result)
            affected += changed
            descriptions.append(description)
        return {"steps": results, "descriptions": descriptions}, list(dict.fromkeys(affected)), args.get("description", f"Atomic batch · {len(commands)} steps")
    if name == "recipe.load":
        from .recipes import build_recipe
        if len(document.features) and not args.get("replace", False):
            raise CadError("replace_required", "Loading a reference design replaces the current design. Set replace=true; undo remains available.")
        return build_recipe(document, actor, args.get("recipe", "mold"))
    raise CadError("unknown_command", f"Command '{name}' is not supported.")


COMMANDS = {
    "document.normalize_names": "Make legacy duplicate component names unique in one undoable action.",
    "toolbody.create": "Create an empty reusable solid tool body in its own local workbench, excluded from assembly counts and exports.",
    "group.reparent": "Move an occurrence to a parent group occurrence (empty parent means design root), preserving world placement and remapping references. Rejects cycles and shared/pattern structure edits.",
    "group.insert": "Create an empty solid component or assembly under a parent occurrence (empty parent means design root).",
    "operation.create": "Create a unified origin/profile/motion/result recipe with exact model/world-origin references, target-projected travel or full finite paths, parameter-backed inputs and native validation. Corner previews include actual perpendicular changed-material sections. Use previews before committing.",
    "component.stock": "Set parameter-backed planar stock thickness and optional display-only thickness preview; no extra physical part or authoritative solid.",
    "component.create": "Create a solid/planar part or assembly. Separate physical parts always get components.",
    "group.create": "Group 1–200 sibling occurrence IDs in an assembly without moving them. Name and occurrences are required inputs. Native occurrence references follow the new paths.",
    "group.add": "Add sibling occurrences to group=assembly occurrence ID, preserving their world placements; rotated/transformed groups rebase placement into new local parameters.",
    "group.copy": "Copy a group occurrence and its nested group structure. Physical part definitions stay linked; membership and placement are independently editable. offset defaults to [30,0,0] in parent coordinates.",
    "group.ungroup": "Dissolve one group occurrence while preserving child world placements and updating occurrence references. Undo restores the group; old unplaced definitions/parameters are retained for existing users.",
    "component.duplicate": "Create a linked instance using an exact placement; no body copies.",
    "component.pattern": "Create or edit a parameterized linear/circular linked-part pattern around the owning assembly origin.",
    "component.independent": "Make a selected part instance independent, retaining provenance.",
    "component.rename": "Rename a component or change its display color.",
    "component.delete": "Delete an unreferenced component and its owned features/parameters; undo remains available.",
    "instance.transform": "Set exact x/y/z and rx/ry/rz values or parameter references.",
    "instance.move": "Preview/commit component movement. id=source instance, occurrence=flattened occurrence ID. method=reference (infer point/direction/projected motion from optional origin, target, direction and values.distance), axes (parent-frame x/y/z distances and rx/ry/rz increments), or rotate (direction line and values.angle). Reference-local mm points={occurrence,point:[x,y,z]}; direction={occurrence,start:[x,y,z],end:[x,y,z]} or {axis:X|Y|Z} for an exact global axis. Origin defaults to component origin. An exact distance overrides target-based travel; clear distance to restore alignment. rotate uses the line's actual location and a live angle parameter. Optional reverse flips direction/axis. Legacy point/direction/projected methods remain accepted. Preview before commit.",
    "instance.visibility": "Change display visibility without changing manufactured quantities.",
    "instance.suppress": "Suppress or restore a manufactured instance explicitly.",
    "instance.reparent": "Move a placed instance into an assembly, preserving its explicit local transform.",
    "parameter.create": "Create a unique optional named design value. Ordinary numeric dimensions are private to their operation.",
    "parameter.set": "Change a value/expression, tolerance, category, description or favorite flag.",
    "parameter.rename": "Rename a parameter while preserving stable references.",
    "parameter.promote": "Promote a local input to a reusable shared standard.",
    "parameter.link": "Bind a feature field explicitly to a deliberately named design value.",
    "parameter.offset": "Apply an exact typed offset to an existing generating dimension; the resulting value remains parameter-backed.",
    "parameter.independent": "Detach one feature dimension into a new independent input.",
    "parameter.delete": "Delete an unused parameter; referenced dimensions are protected.",
    "feature.create": "Add a supported feature with private dimensions or explicit named parameter references.",
    "feature.update": "Edit a historical feature in place. id, optional name, values (existing dimension fields), options (operation: result/reverse/extent; legacy: operation), suppressed. Retains feature identity, order, original profile and frozen references; validates the entire downstream rebuild. Named values are reused or detached, never overwritten. Preview before commit.",
    "feature.suppress": "Suppress or restore a feature, validating dependent geometry.",
    "feature.rename": "Rename a construction feature.",
    "feature.repair": "Repair a failed topology selection with an explicit semantic selector.",
    "sketch.create": "Create a design-root construction sketch of points, lines, circles or circular arcs; optional world frame freezes a picked plane. Creates no physical part by default. Legacy physical ownership remains supported.",
    "sketch.constraint": "Add an explicit dimensional/geometric constraint through PlaneGCS.",
    "sketch.update": "Edit a sketch's geometry and constraints atomically, preserving surviving entity/parameter identities.",
    "sketch.remove_constraint": "Remove a sketch constraint by ID.",
    "batch": "Apply a bounded atomic command sequence; staged work commits together.",
    "document.describe": "Edit the design description, stored in native document notes.",
    "document.rename": "Rename the design.", "document.units": "Change display units without changing physical geometry.",
    "recipe.load": "Load a native reference design: mold, plate or blank; replace requires explicit intent.",
    "history.undo": "Undo the latest transaction, preserving the audit trail.",
    "history.redo": "Redo the latest undone transaction.",
    "checkpoint.create": "Create a named durable checkpoint.",
    "checkpoint.restore": "Restore a named checkpoint as a new audited revision.",
}

from .project_structure import STRUCTURE_COMMANDS
COMMANDS.update(STRUCTURE_COMMANDS)

COMMANDS["sketch.delete"] = "Delete an unreferenced sketch; undo remains available."

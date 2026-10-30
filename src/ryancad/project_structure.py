"""Parts are definitions; layouts contain placements. Variations never copy features.

Existing body and assembly IDs remain authoritative. The structure layer assigns
roles to assembly definitions rather than introducing a second placement engine.
"""
from __future__ import annotations

from .errors import CadError
from .model import Component, Instance, PartVariation, uid
from .parameters import bind_expression, dependencies, evaluate


def unique_name(document, name, role, excluding=None):
    label = str(name).strip()[:120]
    if not label:
        raise CadError("invalid_name", "Enter a name.")
    if any(c.id != excluding and c.structure_role == role and c.name.casefold() == label.casefold()
           for c in document.components.values()):
        raise CadError("duplicate_name", f"{role.title()} names must be unique in this design.")
    return label


def available_name(document, name, role):
    base = str(name).strip()[:110] or role.title()
    used = {c.name.casefold() for c in document.components.values() if c.structure_role == role}
    label, index = base, 2
    while label.casefold() in used:
        label, index = f"{base} {index}", index + 1
    return label


def container(document, actor, name, role):
    c = Component(id=uid(role), name=unique_name(document, name, role), kind="assembly",
                  structure_role=role, created_by=actor.id, modified_by=actor.id)
    document.components[c.id] = c
    i = Instance(id=uid("inst"), name=c.name, definition=c.id, created_by=actor.id)
    document.instances[i.id] = i
    return c, i


def descendants(document, part):
    found, pending = {part}, [part]
    while pending:
        parent = pending.pop()
        for instance in document.instances.values():
            if instance.parent == parent and instance.definition not in found:
                found.add(instance.definition)
                pending.append(instance.definition)
    return found


def part_parameters(document, part):
    members = descendants(document, part)
    used = {pid for f in document.features.values() if f.owner in members for pid in f.parameters.values()}
    used |= {pid for i in document.instances.values() if i.parent in members
             for pid in [*i.placement.values(), *i.pattern.values()]}
    pending = list(used)
    while pending:
        for pid in dependencies(document.parameters[pending.pop()].expression):
            if pid not in used:
                used.add(pid)
                pending.append(pid)
    return sorted(pid for pid in used if document.parameters[pid].named)


def variation_values(document, variation):
    candidate = document.model_copy(deep=True)
    candidate.variations = {}
    for pid, expression in variation.overrides.items():
        candidate.parameters[pid].expression = expression
    return candidate, evaluate(candidate)


def variation_definition(variation, component):
    return f"{variation}__{component}"


def public_document(document):
    """Virtual variant bodies are display identities, never saved feature copies."""
    result = document.model_dump(mode="json")
    for variation in document.variations.values():
        for identifier in descendants(document, variation.part):
            c = document.components[identifier]
            if c.kind == "assembly":
                continue
            virtual = c.model_dump(mode="json")
            virtual.update(id=variation_definition(variation.id, identifier), source_definition=identifier, read_only=True)
            result["components"][virtual["id"]] = virtual
    return result


def resolve_operation_occurrences(document, args):
    """Accept old root instance IDs after an undoable layout conversion.

    Stable source IDs remain valid for older clients; resolve only a unique
    matching body below that source placement, never an arbitrary library copy.
    """
    import copy
    from .placements import flatten_instances
    rows = flatten_instances(document, evaluate(document))
    args = copy.deepcopy(args)
    def resolve(value, component):
        if not value or any(o["id"] == value and o["definition"] == component for o in rows):
            return value
        roots = [o for o in rows if o["source_id"] == value or o["id"] == value]
        matches = [o for o in rows if o["definition"] == component and
                   any(o["id"] == root["id"] or o["id"].startswith(root["id"] + "/") for root in roots)]
        return matches[0]["id"] if len(matches) == 1 else value
    def visit(value):
        if isinstance(value, dict):
            if "occurrence" in value and "component" in value:
                value["occurrence"] = resolve(value["occurrence"], value["component"])
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(args)
    if args.get("target_occurrence"):
        args["target_occurrence"] = resolve(args["target_occurrence"], args.get("target"))
    return args


def normalize_structure(document, actor):
    """Wrap newly created legacy bodies without moving their physical geometry."""
    if not document.structure_version:
        return
    from .groups import remap_references
    if document.active_layout not in document.components:
        layout, _ = container(document, actor, available_name(document, "Layout 1", "layout"), "layout")
        document.active_layout = layout.id
    layout = document.active_layout
    layout_instance = next(i for i in document.instances.values() if i.definition == layout and i.parent == "root")
    mapping = {}
    for instance in list(document.instances.values()):
        if instance.parent != "root":
            continue
        definition = document.components[instance.definition]
        if definition.purpose == "tool" or definition.structure_role in {"part", "layout"}:
            continue
        old_id = instance.id
        if definition.kind != "assembly":
            part, library = container(document, actor, available_name(document, definition.name, "part"), "part")
            child = Instance(id=uid("inst"), name=definition.name, definition=definition.id, parent=part.id,
                             created_by=actor.id)
            document.instances[child.id] = child
            instance.definition = part.id
            instance.name = part.name
            mapping[old_id] = f"{layout_instance.id}/{old_id}/{child.id}"
        else:
            definition.name = available_name(document, definition.name, "part")
            definition.structure_role = "part"
            library = Instance(id=uid("inst"), name=definition.name, definition=definition.id, created_by=actor.id)
            document.instances[library.id] = library
            mapping[old_id] = f"{layout_instance.id}/{old_id}"
        instance.parent = layout
    remap_references(document, mapping)
    for c in document.components.values():
        if c.kind == "assembly" and c.id != "root" and c.structure_role == "component":
            c.name = available_name(document, c.name, "part")
            c.structure_role = "part"
        if any(document.features[f].type == "mesh" for f in c.feature_ids):
            c.read_only = True
    # Every reusable part has one authoring occurrence, independent of layouts.
    for c in list(document.components.values()):
        if c.structure_role == "part" and not any(i.parent == "root" and i.definition == c.id for i in document.instances.values()):
            i = Instance(id=uid("inst"), name=c.name, definition=c.id, created_by=actor.id)
            document.instances[i.id] = i


def validate_structure(document):
    if not document.structure_version:
        return
    if document.structure_version != 1:
        raise CadError("invalid_structure", "Unsupported project structure version.")
    active = document.components.get(document.active_layout)
    if not active or active.structure_role != "layout":
        raise CadError("missing_layout", "Choose a design layout.")
    for role in ("part", "layout"):
        names = [c.name.casefold() for c in document.components.values() if c.structure_role == role]
        if len(names) != len(set(names)):
            raise CadError("duplicate_name", f"{role.title()} names must be unique.")
    for i in document.instances.values():
        parent, child = document.components[i.parent], document.components.get(i.definition)
        if not child:
            continue  # ordinary document validation reports this
        if parent.structure_role == "layout" and child.structure_role not in {"part", "group"}:
            raise CadError("layout_membership", "Layouts contain parts and part groups, not individual components.")
        if parent.structure_role == "group" and child.structure_role != "part":
            raise CadError("group_membership", "A Part Group contains only parts.")
        if parent.structure_role == "part" and (child.structure_role == "layout" or child.purpose == "tool"):
            raise CadError("part_membership", "Parts contain components, parts and part groups. Tool bodies stay in the library.")
        if i.variation and (i.variation not in document.variations or document.variations[i.variation].part != i.definition):
            raise CadError("invalid_variation", "This variation does not belong to the selected part.")
    names = set()
    for v in document.variations.values():
        part = document.components.get(v.part)
        if not part or part.structure_role != "part":
            raise CadError("invalid_variation", "A variation needs an existing part.")
        if not v.overrides or not set(v.overrides) <= set(part_parameters(document, v.part)):
            raise CadError("invalid_variation", "Choose at least one named parameter used by this part. Private dimensions cannot define variations.")
        key = (v.part, v.name.casefold())
        if key in names:
            raise CadError("duplicate_name", "Variation names must be unique within a part.")
        names.add(key)
        variation_values(document, v)


def structure_command(document, actor, name, args):
    from .commands import create_component, create_instance, require
    if name == "structure.enable":
        if document.structure_version:
            return {}, [], "Parts and layouts already enabled"
        layout, instance = container(document, actor, args.get("name") or "Layout 1", "layout")
        document.active_layout = layout.id
        document.structure_version = 1
        normalize_structure(document, actor)
        return {"layout_id": layout.id}, [layout.id], "Organize design into linked parts and a layout"
    if not document.structure_version:
        raise CadError("structure_required", "Enable parts and layouts for this design first.")
    if name in {"part.create", "layout.create"}:
        role = name.split(".")[0]
        label = args.get("name") or available_name(document, role.title(), role)
        if not args.get("name"):
            number = 1
            names = {c.name.casefold() for c in document.components.values() if c.structure_role == role}
            while f"{role.title()} {number}".casefold() in names:
                number += 1
            label = f"{role.title()} {number}"
        c, i = container(document, actor, label, role)
        if role == "layout":
            document.active_layout = c.id
        return {"component_id": c.id, "instance_id": i.id}, [c.id, i.id], f"Create {role} · {c.name}"
    if name == "part.primitive":
        from .commands import create_feature
        kind = args.get("shape", "box")
        if kind not in {"box", "sphere", "cylinder"}:
            raise CadError("invalid_primitive", "Choose Box, Sphere or Cylinder.")
        part, library = container(document, actor, available_name(document, args.get("name") or kind.title(), "part"), "part")
        body, _ = create_component(document, actor, "Component", parent=part.id)
        feature = create_feature(document, actor, body.id, kind, args.get("values"), name=kind.title())
        if args.get("place"):
            placed = create_instance(document, actor, part.id, parent=document.active_layout)
            return {"component_id": part.id, "instance_id": placed.id, "primitive_feature_id": feature.id}, [part.id, body.id, feature.id, placed.id], f"Place {kind} copy · {part.name}"
        return {"component_id": part.id, "instance_id": library.id, "primitive_feature_id": feature.id}, [part.id, body.id, feature.id], f"Create {kind} part · {part.name}"
    if name == "layout.select":
        c = require(document.components, args.get("id"), "layout")
        if c.structure_role != "layout":
            raise CadError("invalid_layout", "Choose a design layout.")
        document.active_layout = c.id
        return {}, [c.id], f"Open layout · {c.name}"
    if name == "part.insert":
        c = require(document.components, args.get("part"), "part")
        if c.structure_role != "part":
            raise CadError("invalid_part", "Choose a part definition.")
        parent = args.get("parent") or document.active_layout
        i = create_instance(document, actor, c.id, parent=parent, placement=args.get("placement"))
        i.variation = args.get("variation") or None
        return {"instance_id": i.id}, [i.id], f"Place part · {c.name}"
    if name == "part.delete":
        from .parameters import dependencies
        c = require(document.components, args.get("id"), "part")
        if c.structure_role != "part":
            raise CadError("invalid_part", "Choose a reusable part definition.")
        owned = {p.id for p in document.parameters.values() if p.owner == c.id}
        if any(dependencies(p.expression) & owned for p in document.parameters.values() if p.owner != c.id):
            raise CadError("part_in_use", "Other parameters depend on this part. Remove those dependencies first.")
        remaining = {k:i for k,i in document.instances.items() if i.parent != c.id and i.definition != c.id}
        if any(owned & set([*i.placement.values(), *i.pattern.values()]) for i in remaining.values()):
            raise CadError("part_in_use", "Other placements depend on this part's parameters.")
        document.instances = remaining
        document.variations = {k:v for k,v in document.variations.items() if v.part != c.id}
        document.parameters = {k:p for k,p in document.parameters.items() if k not in owned}
        del document.components[c.id]
        return {}, [c.id], f"Delete part · {c.name}"
    if name == "part.component.create":
        c = require(document.components, args.get("part"), "part")
        if c.structure_role != "part":
            raise CadError("invalid_part", "Create components inside a part.")
        component, instance = create_component(document, actor, args.get("name") or "Component", parent=c.id)
        return {"component_id": component.id, "instance_id": instance.id}, [component.id], f"Create component · {component.name}"
    if name == "partgroup.create":
        parent = require(document.components, args.get("parent") or document.active_layout, "parent")
        if parent.structure_role not in {"part", "layout"}:
            raise CadError("invalid_group", "Create a Part Group in a layout or part.")
        c, i = container(document, actor, args.get("name") or available_name(document, "Part Group", "group"), "group")
        i.parent = parent.id
        return {"component_id": c.id, "instance_id": i.id}, [c.id], f"Create Part Group · {c.name}"
    if name == "structure.rename":
        c = require(document.components, args.get("id"), "definition")
        c.name = unique_name(document, args.get("name"), c.structure_role, c.id) if c.structure_role in {"part", "layout"} else str(args.get("name", "")).strip()[:120]
        if not c.name:
            raise CadError("invalid_name", "Enter a name.")
        for i in document.instances.values():
            if i.definition == c.id:
                i.name = c.name
        return {}, [c.id], f"Rename {c.structure_role} · {c.name}"
    if name == "structure.remove":
        i = require(document.instances, args.get("instance"), "placement")
        if i.parent == "root":
            raise CadError("library_definition", "Remove placements from layouts or parts. Library definitions are retained.")
        del document.instances[i.id]
        return {}, [i.id], f"Remove placement · {i.name}"
    if name == "layout.delete":
        c = require(document.components, args.get("id"), "layout")
        layouts = [v for v in document.components.values() if v.structure_role == "layout"]
        if c not in layouts or len(layouts) < 2:
            raise CadError("last_layout", "Keep at least one design layout.")
        document.instances = {k: i for k, i in document.instances.items() if i.parent != c.id and i.definition != c.id}
        # Keep the empty container if placement parameters still belong to it.
        # Leave a non-part tombstone for any historical parameter owners.
        c.structure_role = "group"
        if document.active_layout == c.id:
            document.active_layout = next(v.id for v in layouts if v.id != c.id)
        return {}, [c.id], f"Delete layout · {c.name}"
    if name in {"variation.create", "variation.update"}:
        previous = require(document.variations, args.get("id"), "variation") if name.endswith("update") else None
        part = previous.part if previous else args.get("part")
        label = str(args.get("name") or (previous.name if previous else "Variation")).strip()[:120]
        if not label:
            raise CadError("invalid_name", "Name the variation.")
        overrides = args.get("overrides", previous.overrides if previous else {})
        if not isinstance(overrides, dict):
            raise CadError("invalid_variation", "Provide named parameter values.")
        v = PartVariation(id=previous.id if previous else uid("variation"), part=part, name=label,
                          overrides={pid: bind_expression(value, document) for pid, value in overrides.items()})
        document.variations[v.id] = v
        validate_structure(document)
        return {"variation_id": v.id}, [v.id, part], f"Save variation · {label}"
    if name == "variation.delete":
        v = require(document.variations, args.get("id"), "variation")
        if any(i.variation == v.id for i in document.instances.values()):
            raise CadError("variation_in_use", "Remove this variation's placements before deleting it.")
        del document.variations[v.id]
        return {}, [v.id], f"Delete variation · {v.name}"
    raise CadError("unknown_command", f"Unknown structure command {name}.")


STRUCTURE_COMMANDS = {name: description for name, description in [
    ("part.delete", "Delete a part definition, its variations and placements; retain child definitions and reject external parameter dependencies."),
    ("structure.enable", "Undoable conversion of legacy bodies/groups into reusable parts and one layout; preserves geometry and placement."),
    ("part.create", "Create a uniquely named reusable part definition."),
    ("part.primitive", "Create a reusable box, sphere or cylinder part with explicit editable dimensions; shape and optional values."),
    ("part.component.create", "Create a body within part=<definition ID>; component names may repeat."),
    ("part.insert", "Place part=<definition ID> in parent=<part/group/layout ID>, optionally with variation and placement."),
    ("partgroup.create", "Create a group that contains only parts, in parent=<part or layout ID>."),
    ("layout.create", "Create and activate an independent arrangement using shared part definitions."),
    ("layout.select", "Select layout id."), ("layout.delete", "Remove a layout's placements, retaining library parts."),
    ("structure.rename", "Rename definition id; part and layout names must be unique."),
    ("structure.remove", "Remove instance=<placement ID> without deleting its reusable definition."),
    ("variation.create", "Create part variation with name and overrides={named parameter ID: expression}; features stay linked."),
    ("variation.update", "Update variation id, name, overrides."),
    ("variation.delete", "Delete unused variation id."),
]}

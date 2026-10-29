"""Edit an existing recipe in place; evaluation/commit remain transactional."""
from .commands import parameter, require
from .errors import CadError


def update_feature(document, actor, args):
    unknown = set(args) - {"id", "name", "values", "options", "suppressed"}
    if unknown:
        raise CadError("unknown_field", f"Unsupported feature edits: {', '.join(sorted(unknown))}.")
    feature = require(document.features, args.get("id"), "feature")
    if feature.type == "sketch":
        raise CadError("invalid_operation", "Use sketch.update to edit sketch geometry and its constraints.")
    values, options = args.get("values", {}), args.get("options", {})
    if not isinstance(values, dict) or not isinstance(options, dict):
        raise CadError("invalid_value", "Feature values and options must be objects.")
    unknown = set(values) - set(feature.parameters)
    if unknown:
        raise CadError("unknown_field", f"This feature has no inputs named {', '.join(sorted(unknown))}.")
    allowed = {"result", "reverse", "extent"} if feature.type == "operation" else {"operation"}
    if set(options) - allowed:
        raise CadError("unsupported_edit", "Edit the existing dimensions and effect; the original profile and reference geometry are retained.")
    if "result" in options:
        result = options["result"]
        if result not in {"new", "auto", "add", "cut", "intersect"}:
            raise CadError("invalid_operation", "Choose new, auto, add, cut or intersect.")
        if feature.options.get("profile") in {"fillet", "chamfer"} and result != feature.options.get("result"):
            raise CadError("unsupported_edit", "A corner finish retains its native material-removal effect.")
        if result == "new" and document.components[feature.owner].feature_ids[0] != feature.id:
            raise CadError("invalid_operation", "Only the first feature can create this component's initial body.")
    if "operation" in options and options["operation"] not in {"new", "add", "cut", "intersect"}:
        raise CadError("invalid_operation", "Choose new, add, cut or intersect.")
    if "reverse" in options and type(options["reverse"]) is not bool:
        raise CadError("invalid_value", "Reverse direction must be true or false.")
    if "extent" in options:
        if options["extent"] not in {"distance", "through", "symmetric"}:
            raise CadError("invalid_extent", "Choose distance, through or symmetric travel.")
        if feature.options.get("motion") != "linear" or "distance" not in feature.parameters:
            raise CadError("unsupported_extent", "This feature retains its original path extent.")
    if "name" in args:
        label = str(args["name"]).strip()
        if not label or len(label) > 120:
            raise CadError("invalid_name", "Give the feature a name of 1–120 characters.")
        feature.name = label
    affected = [feature.owner, feature.id]
    for field, value in values.items():
        previous = document.parameters[feature.parameters[field]]
        replacement = parameter(document, actor, feature.owner, previous.name, value, previous.kind, previous.category)
        updated = document.parameters[replacement]
        # Keep private dimension identity (and tolerance). Never change a shared
        # named value just because one operation is being edited.
        if previous.named is False and updated.named is False:
            previous.expression, previous.modified_by = updated.expression, actor.id
            document.parameters.pop(replacement)
            replacement = previous.id
        feature.parameters[field] = replacement
        affected.append(replacement)
    feature.options.update(options)
    if "suppressed" in args:
        if type(args["suppressed"]) is not bool:
            raise CadError("invalid_value", "Suppressed must be true or false.")
        feature.suppressed = args["suppressed"]
    feature.modified_by = actor.id
    document.components[feature.owner].modified_by = actor.id
    return {"feature_id": feature.id}, affected, f"Edit {feature.name} · {document.components[feature.owner].name}"

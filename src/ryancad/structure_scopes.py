"""Shared group-context rules, independent of modeling command initialization."""
from .errors import CadError


def group_scope(document, identifier):
    """Groups belong to one authoring context; layout copies of a part stop at that part."""
    pending = [i.parent for i in document.instances.values() if i.definition == identifier]
    scopes, seen = set(), set()
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        parent = document.components.get(current)
        if not parent:
            continue
        if parent.structure_role in {"layout", "part"}:
            scopes.add(parent.structure_role)
        else:
            pending.extend(i.parent for i in document.instances.values() if i.definition == current)
    if len(scopes) > 1:
        raise CadError("group_scope", "Layout groups and part groups cannot be shared across the two contexts.")
    return next(iter(scopes), "part")



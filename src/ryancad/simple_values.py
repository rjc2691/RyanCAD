"""Compatibility normalization for explicit named inputs and private numeric values."""
import re

from .model import uid
from .parameters import dependencies, evaluate


def simplify_values(document):
    for p in document.parameters.values():
        if p.named is None:
            p.named = p.category in {"Shared", "Shared standards", "Design inputs"}
    values = evaluate(document)
    for p in document.parameters.values():
        if p.named:
            p.owner = "root"
        for dependency in dependencies(p.expression):
            source = document.parameters[dependency]
            if not source.named:
                unit = "mm" if source.kind == "length" else "deg" if source.kind == "angle" else None
                literal = f"quantity({values[dependency]!r}, '{unit}')" if unit else repr(values[dependency])
                p.expression = re.sub(r"\b" + re.escape(dependency) + r"\b", "(" + literal + ")", p.expression)
    used = set()
    for mapping in ([f.parameters for f in document.features.values()] +
                    [i.placement for i in document.instances.values()] + [i.pattern for i in document.instances.values()]):
        for field, identifier in list(mapping.items()):
            p = document.parameters[identifier]
            if not p.named and identifier in used:
                clone = p.model_copy(deep=True)
                clone.id = uid("p")
                document.parameters[clone.id] = clone
                mapping[field] = clone.id
            used.add(identifier)
    document.fits.clear()

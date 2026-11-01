"""Reference examples must explicitly opt into reusable named dimensions."""
import pytest

from ryancad.public_workspace import seed_document
from ryancad.placements import flatten_instances
from ryancad.model import Actor, Document
from ryancad.parameters import evaluate, dependencies


@pytest.mark.parametrize('recipe,parts', [('mold',4),('plate',3)])
def test_reference_recipe_builds_with_explicit_named_inputs(recipe, parts):
    document=seed_document(recipe)
    values=evaluate(document)
    assert len([o for o in flatten_instances(document,values) if o["kind"]!="assembly" and o.get("layout")==document.active_layout])==parts
    assert document.features and values
    inputs=[p for p in document.parameters.values() if p.named]
    assert inputs and all(p.owner=='root' for p in inputs)
    # These are deliberate reusable inputs. Ordinary feature values remain
    # private and must not accidentally become the source of shared expressions.
    for parameter in document.parameters.values():
        for dependency in dependencies(parameter.expression):
            assert document.parameters[dependency].named
    uses={identifier for feature in document.features.values() for identifier in feature.parameters.values()}
    assert uses.intersection(p.id for p in inputs)

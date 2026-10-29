"""Reference examples must explicitly opt into reusable named dimensions."""
import pytest

from ryancad.commands import reduce
from ryancad.model import Actor, Document
from ryancad.parameters import evaluate, dependencies


@pytest.mark.parametrize('recipe,parts', [('mold',4),('plate',3)])
def test_reference_recipe_builds_with_explicit_named_inputs(recipe, parts):
    document=Document()
    result,_,_=reduce(document,Actor(),'recipe.load',{'recipe':recipe})
    values=evaluate(document)
    assert len(document.instances)==parts
    assert result['component_ids']
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

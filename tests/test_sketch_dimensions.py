import math
import pytest
from ryancad.errors import CadError
from ryancad.model import Actor, Document
from ryancad.parameters import evaluate
from ryancad.sketches import edit_sketch, solve_sketch

@pytest.mark.parametrize("rotation", [0, .7, 1.57])
@pytest.mark.parametrize("reverse", [False, True])
@pytest.mark.parametrize("gap", [0, 3, 12])
def test_parallel_distance_preserves_orientation_and_actual_perpendicular_gap(rotation, reverse, gap):
    u=(math.cos(rotation), math.sin(rotation));n=(-u[1],u[0])
    points=[(0,0),(20*u[0],20*u[1]),(-5*n[0],-5*n[1]),(20*u[0]-5*n[0],20*u[1]-5*n[1])]
    if reverse: points[2],points[3]=points[3],points[2]
    entities=[{"id": identifier,"type":"line","x1":points[i][0],"y1":points[i][1],"x2":points[i+1][0],"y2":points[i+1][1],"fixed":identifier=="a"} for identifier,i in [("a",0),("b",2)]]
    doc=Document();result,_,_=edit_sketch(doc,Actor(),"sketch.create",{"entities":entities,"constraints":[{"type":"line_distance","a":"a","b":"b","value":gap}]})
    feature=doc.features[result["feature_id"]];solved=solve_sketch(feature,evaluate(doc))["entities"];a,b=solved
    dx,dy=b["end"][0]-b["start"][0],b["end"][1]-b["start"][1]
    assert abs(dx*u[1]-dy*u[0])<1e-5
    assert abs((b["start"][0]-a["start"][0])*n[0]+(b["start"][1]-a["start"][1])*n[1])==pytest.approx(gap,abs=1e-5)
    assert len(feature.options["constraints"])==1

def test_parallel_distance_cannot_violate_fixed_geometry_and_rejects_negative_values():
    for value in [-2, 12]:
        doc=Document();result,_,_=edit_sketch(doc,Actor(),"sketch.create",{"entities":[{"id":"a","type":"line","x1":0,"y1":0,"x2":10,"y2":0,"fixed":True},{"id":"b","type":"line","x1":0,"y1":5,"x2":10,"y2":5,"fixed":True}],"constraints":[{"type":"line_distance","a":"a","b":"b","value":value}]})
        with pytest.raises(CadError): solve_sketch(doc.features[result["feature_id"]],evaluate(doc))

def test_zero_angle_is_a_valid_alternative_for_parallel_lines():
    doc=Document();result,_,_=edit_sketch(doc,Actor(),"sketch.create",{"entities":[{"id":"a","type":"line","x1":0,"y1":0,"x2":10,"y2":0,"fixed":True},{"id":"b","type":"line","x1":0,"y1":5,"x2":10,"y2":5}],"constraints":[{"type":"angle","a":"a","b":"b","value":0,"angle_frame":{"a":"start","b":"start","orientation":1}}]})
    solved=solve_sketch(doc.features[result["feature_id"]],evaluate(doc))["entities"][1]
    assert solved["start"][1]==pytest.approx(solved["end"][1])

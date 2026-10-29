import math
import pytest
from ryancad.model import Actor,Document
from ryancad.commands import reduce
from ryancad.geometry import Evaluator
from ryancad.errors import CadError

def create(d,entities,**extra):
    return reduce(d,Actor(),"sketch.create",{"entities":entities,**extra})[0]

def circle(x=0,radius=2):
    return {"id":"c","type":"circle","x":x,"y":0,"radius":radius,"fixed":True}

def test_design_sketches_are_independent_profiles_not_components_and_regenerate():
    d=Document();a=create(d,[circle()]);b=create(d,[circle(20,3)])
    assert len(d.components)==1 and not d.instances
    assert d.features[a["feature_id"]].owner=="root"
    k=Evaluator();v=k.evaluate(d.model_dump(mode="json"))
    assert not v["components"]
    assert v["profiles"][a["feature_id"]]["status"]=="closed"
    assert v["profiles"][b["feature_id"]]["center"][0]==pytest.approx(20)
    p=reduce(d,Actor(),"operation.create",{"profile":"sketch","sketch":a["feature_id"],"values":{"distance":5}})[0]
    v=k.evaluate(d.model_dump(mode="json"));assert v["components"][p["component_id"]]["volume"]==pytest.approx(math.pi*4*5)
    reduce(d,Actor(),"sketch.update",{"feature_id":a["feature_id"],"name":"Master circle","entities":[circle(radius=3)],"constraints":[]})
    assert d.features[a["feature_id"]].name == "Master circle"
    v=k.evaluate(d.model_dump(mode="json"));assert v["components"][p["component_id"]]["volume"]==pytest.approx(math.pi*9*5)

def test_arbitrary_world_sketch_frame_and_open_geometry_are_preserved():
    d=Document();a=create(d,[circle()],frame={"origin":[10,20,30],"u":[0,1,0],"normal":[1,0,0]})
    b=create(d,[{"id":"l","type":"line","x1":0,"y1":0,"x2":10,"y2":0,"fixed":True}])
    v=Evaluator().evaluate(d.model_dump(mode="json"));f=v["profiles"][a["feature_id"]]
    assert f["center"]==pytest.approx([10,20,30]);assert abs(f["normal"][0])==pytest.approx(1)
    assert v["profiles"][b["feature_id"]]["status"]=="open"

def test_disjoint_regions_and_nested_holes_are_valid_design_sketches():
    d=Document();c=circle(20);c["id"]="d";hole=circle(radius=1);hole["id"]="h"
    a=create(d,[circle(),c,hole]);v=Evaluator().evaluate(d.model_dump(mode="json"))
    assert v["profiles"][a["feature_id"]]["region_count"]==2
    assert len(v["profiles"][a["feature_id"]]["outlines"])==3

@pytest.mark.parametrize("frame",[
    {"origin":[0,0,0],"u":[1,0,0],"normal":[1,0,0]},
    {"origin":[0,0,0],"u":[2,0,0],"normal":[0,0,1]},
    {"origin":[20000,0,0],"u":[1,0,0],"normal":[0,0,1]},
])
def test_malformed_sketch_frames_are_rejected(frame):
    with pytest.raises(CadError,match="frame"):create(Document(),[circle()],frame=frame)


def test_sketch_length_dimension_references_parameter_and_regenerates():
    d=Document(); actor=Actor()
    root=reduce(d,actor,"parameter.create",{"name":"Width", "value":12})[0]["parameter_id"]
    line={"id":"l", "type":"line", "x1":0, "y1":0, "x2":8, "y2":0, "fixed":False}
    feature=create(d,[line],constraints=[{"type":"distance","a":"l.start","b":"l.end","value":"Width"}])["feature_id"]
    con=d.features[feature].options["constraints"][0]; param=d.features[feature].parameters[con["parameter_key"]]
    assert param == root
    k=Evaluator(); solved=k.evaluate(d.model_dump(mode="json"))["sketches"][feature]["entities"][0]
    assert math.dist(solved["start"],solved["end"]) == pytest.approx(12)
    reduce(d,actor,"parameter.set",{"id":root,"value":20})
    solved=k.evaluate(d.model_dump(mode="json"))["sketches"][feature]["entities"][0]
    assert math.dist(solved["start"],solved["end"]) == pytest.approx(20)
    reduce(d,actor,"sketch.update",{"feature_id":feature,"entities":[line],"constraints":[{**con,"value":20}]})
    assert d.features[feature].parameters[con["parameter_key"]] == param
    assert param == root


def test_editing_a_reused_constraint_does_not_mutate_the_shared_parameter():
    d=Document();actor=Actor()
    root=reduce(d,actor,"parameter.create",{"name":"Width","value":12})[0]["parameter_id"]
    line={"id":"l","type":"line","x1":0,"y1":0,"x2":8,"y2":0,"fixed":False}
    feature=create(d,[line],constraints=[{"type":"distance","a":"l.start","b":"l.end","value":{"parameter":root}}])["feature_id"]
    con=d.features[feature].options["constraints"][0]
    reduce(d,actor,"sketch.update",{"feature_id":feature,"entities":[line],"constraints":[{**con,"value":18}]})
    assert d.parameters[root].expression == "12"
    assert d.features[feature].parameters[con["parameter_key"]] != root
    solved=Evaluator().evaluate(d.model_dump(mode="json"))["sketches"][feature]["entities"][0]
    assert math.dist(solved["start"],solved["end"]) == pytest.approx(18)


@pytest.mark.parametrize("value",[0,-1])
def test_sketch_length_dimension_requires_positive_value(value):
    d=Document();line={"id":"l","type":"line","x1":0,"y1":0,"x2":8,"y2":0,"fixed":False}
    create(d,[line],constraints=[{"type":"distance","a":"l.start","b":"l.end","value":value}])
    with pytest.raises(CadError,match="must be positive"):
        Evaluator().evaluate(d.model_dump(mode="json"))

import math
import numpy as np
import pytest
from ryancad.commands import reduce
from ryancad.errors import CadError
from ryancad.geometry import Evaluator
from ryancad.model import Document,Actor

def edit(doc,**args):return reduce(doc,Actor(),"operation.create",args)[0]
def scene():
    k=Evaluator();d=Document();p=edit(d,profile="rectangle",values={"width":20,"height":20,"distance":10})
    out=k.evaluate(d.model_dump(mode="json"))["components"][p["component_id"]]
    e=next(e for e in out["edges"] if abs(e["tangent"][2])>.99)
    r={"component":p["component_id"],"occurrence":p["instance_id"],"edge":e["signature"],"anchor":"start"}
    return k,d,p,e,r

def test_target_projection_is_native_parametric_and_no_distance_parameter_is_added():
    k,d,p,e,r=scene();t=edit(d,profile="circle",motion="linear",origin="reference",reference=r,plane="perpendicular",direction="edge",path_reference=r,travel_target={**r,"anchor":"mid"},values={"diameter":2})
    v=k.evaluate(d.model_dump(mode="json"));assert v["components"][t["component_id"]]["volume"]==pytest.approx(math.pi*5)
    assert "distance" not in d.features[t["feature_id"]].parameters
    assert v["operation_displays"][t["feature_id"]]["travel"]["distance"]==pytest.approx(5)
    height=d.features[p["feature_id"]].parameters["distance"];d.parameters[height].expression="20"
    assert k.evaluate(d.model_dump(mode="json"))["components"][t["component_id"]]["volume"]==pytest.approx(math.pi*10)

def test_blank_full_selected_path_uses_its_entire_native_length():
    k,d,p,e,r=scene();t=edit(d,profile="circle",motion="linear",origin="reference",reference=r,plane="perpendicular",direction="edge",path_reference=r,path_extent="full",values={"diameter":2})
    v=k.evaluate(d.model_dump(mode="json"));assert v["components"][t["component_id"]]["volume"]==pytest.approx(math.pi*e["length"])
    assert "distance" not in d.features[t["feature_id"]].parameters

def test_world_origin_reference_and_target_project_signed_distance():
    k=Evaluator();d=Document();t=edit(d,profile="circle",plane="XY",direction="Z",travel_target={"component":"root","world":"origin"},values={"diameter":2,"origin_z":10})
    v=k.evaluate(d.model_dump(mode="json"));assert v["components"][t["component_id"]]["volume"]==pytest.approx(math.pi*10)
    assert v["operation_displays"][t["feature_id"]]["travel"]["distance"]==-10
    edit(d,profile="circle",origin="reference",reference={"component":"root","world":"origin"},values={"diameter":2,"distance":3})
    k.evaluate(d.model_dump(mode="json"))

def test_sweep_target_projects_to_curve_and_measures_arc_length():
    k=Evaluator();d=Document();p=edit(d,profile="circle",values={"diameter":20,"distance":2});v=k.evaluate(d.model_dump(mode="json"));e=next(e for e in v["components"][p["component_id"]]["edges"] if e["type"]=="CIRCLE")
    r={"component":p["component_id"],"edge":e["signature"],"anchor":"start"}
    t=edit(d,profile="circle",motion="sweep",origin="reference",reference=r,plane="perpendicular",direction="edge",path_reference=r,travel_target={**r,"anchor":"mid"},values={"diameter":1})
    v=k.evaluate(d.model_dump(mode="json"));assert v["components"][t["component_id"]]["volume"]==pytest.approx(math.pi/4*e["length"]/2,rel=1e-4)

@pytest.mark.parametrize("profile,area",[("fillet",4-math.pi),("chamfer",2)])
@pytest.mark.parametrize("partial",[False,True])
def test_finish_profiles_are_exact_perpendicular_removed_regions(profile,area,partial):
    k,d,p,e,r=scene();args={"travel_target":{**r,"anchor":"mid"}} if partial else {}
    t=edit(d,target=p["component_id"],target_occurrence=p["instance_id"],profile=profile,path_reference=r,values={"amount":2},**args)
    v=k.evaluate(d.model_dump(mode="json"));section=v["operation_displays"][t["feature_id"]]["finish_section"]
    assert "unavailable" not in section,section
    assert section["area"]==pytest.approx(area,rel=1e-6)
    assert section["effect"]=="removed"
    assert v["components"][p["component_id"]]["volume"]==pytest.approx(4000-area*(5 if partial else 10),rel=1e-6)
    for loop in section["loops"]:
        for point in loop:assert np.dot(np.array(point)-section["origin"],section["normal"])==pytest.approx(0,abs=1e-7)

def test_face_boundaries_are_exact_edge_references():
    k,d,p,e,r=scene();g=k.evaluate(d.model_dump(mode="json"))["components"][p["component_id"]]
    for f in g["faces"]:
        assert len(f["edge_signatures"])==4
        for signature in f["edge_signatures"]:assert len([e for e in g["edges"] if e["signature"]==signature])==1

def test_explicit_full_travel_cannot_invent_length_for_an_implicit_axis():
    with pytest.raises(CadError,match="finite length"):edit(Document(),profile="rectangle",path_extent="full")

def test_helical_rise_can_end_at_a_projected_world_point():
    k=Evaluator();d=Document();t=edit(d,profile="circle",motion="helix",plane="axial",direction="Z",travel_target={"component":"root","world":"origin"},values={"origin_x":10,"origin_z":10,"diameter":2,"angle":360})
    v=k.evaluate(d.model_dump(mode="json"));travel=v["operation_displays"][t["feature_id"]]["travel"]
    assert travel["distance"]==pytest.approx(-10)
    assert travel["end"][2]==pytest.approx(0,abs=1e-7)
    assert v["components"][t["component_id"]]["volume"]>100

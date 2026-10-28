import copy
import math
import pytest
from ryancad.commands import reduce
from ryancad.geometry import Evaluator
from ryancad.model import Actor, Document
from ryancad.errors import CadError

@pytest.fixture(scope="module")
def kernel(): return Evaluator()

def edit(doc,**args): return reduce(doc,Actor(),"operation.create",args)[0]
def evaluate(kernel,doc): return kernel.evaluate(doc.model_dump(mode="json"))
def plate(kernel):
    doc=Document();part=edit(doc,name="Plate",profile="rectangle",values={"width":40,"height":30,"distance":6})
    output=evaluate(kernel,doc)["components"][part["component_id"]]
    face=next(f for f in output["faces"] if f["normal"][2]>.99)
    ref={"component":part["component_id"],"occurrence":part["instance_id"],"face":face["signature"]}
    return doc,part,output,ref

def test_face_hole_and_symmetric_placement(kernel):
    doc,part,_,ref=plate(kernel)
    hole=edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="circle",result="cut",origin="reference",reference=ref,profile_reference=ref,plane="face",extent="through",values={"diameter":5,"offset_u":8})
    assert "distance" not in doc.features[hole["feature_id"]].parameters
    out=evaluate(kernel,doc)["components"][part["component_id"]]
    assert out["volume"]==pytest.approx(7200-math.pi*2.5**2*6)
    assert len(doc.feature_order)==2

def test_face_extrusion_and_edge_finish(kernel):
    doc,part,_,ref=plate(kernel)
    edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="face",result="add",origin="reference",reference=ref,profile_reference=ref,plane="face",values={"distance":4})
    out=evaluate(kernel,doc)["components"][part["component_id"]]
    assert out["volume"]==pytest.approx(40*30*10)
    edge=out["edges"][0]
    edit(doc,target=part["component_id"],profile="chamfer",result="add",motion="sweep",path_reference={"component":part["component_id"],"edge":edge["signature"]},values={"amount":1})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]<12000


@pytest.mark.parametrize("distance,reverse", [(-2,False),(2,True)])
def test_signed_face_extrusion_removes_material_along_the_chosen_direction(kernel,distance,reverse):
    doc,part,_,ref=plate(kernel)
    edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="face",result="cut",origin="reference",reference=ref,profile_reference=ref,plane="face",reverse=reverse,values={"distance":distance})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(40*30*4)

def test_polygon_perpendicular_sweep_and_offset_path(kernel):
    doc,part,out,ref=plate(kernel)
    edge=next(e for e in out["edges"] if abs(e["tangent"][2])>.99)
    ref={"component":part["component_id"],"edge":edge["signature"],"anchor":"start"}
    tool=edit(doc,name="Swept section",profile="polygon",motion="sweep",origin="reference",reference=ref,path_reference=ref,plane="perpendicular",direction="edge",points=[[-1,-1],[1,-1],[0,1]],values={"offset_u":10})
    out=evaluate(kernel,doc)["components"][tool["component_id"]]
    assert out["volume"]==pytest.approx(2*6)

def test_revolve_and_combined_helical_travel(kernel):
    doc=Document()
    ring=edit(doc,profile="circle",motion="revolve",plane="axial",direction="Z",values={"origin_x":10,"diameter":2,"angle":360})
    ring_geometry=evaluate(kernel,doc)["components"][ring["component_id"]]
    assert ring_geometry["volume"]==pytest.approx(2*math.pi**2*10,rel=1e-4)
    assert any(len(edge["samples"])>2 for edge in ring_geometry["edges"])
    spring=edit(doc,profile="circle",motion="helix",plane="axial",direction="Z",values={"origin_x":10,"diameter":2,"distance":20,"angle":720})
    assert evaluate(kernel,doc)["components"][spring["component_id"]]["volume"]>300

def test_native_recipe_parameters_change_and_round_trip(kernel):
    doc=Document();part=edit(doc,profile="rectangle",extent="symmetric",values={"width":10,"height":8,"distance":6})
    out=evaluate(kernel,doc)["components"][part["component_id"]]
    assert out["bounds"]["min"][2]==pytest.approx(-3)
    restored=Document.model_validate_json(doc.model_dump_json())
    ft=restored.features[part["feature_id"]]
    reduce(restored,Actor(),"parameter.set",{"id":ft.parameters["distance"],"value":10})
    assert evaluate(kernel,restored)["components"][part["component_id"]]["volume"]==pytest.approx(800)

def test_ambiguous_reference_and_invalid_motion_rejected(kernel):
    doc,part,_,ref=plate(kernel)
    edit(doc,target=part["component_id"],profile="face",result="cut",origin="reference",reference={**ref,"face":"missing"},profile_reference=ref,plane="face")
    with pytest.raises(CadError): evaluate(kernel,doc)

def test_body_boolean_uses_occurrence_frame(kernel):
    doc,part,_,ref=plate(kernel)
    source=edit(doc,profile="circle",values={"diameter":6,"distance":10})
    cut=edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="body",motion="none",result="cut",profile_reference={"component":source["component_id"],"occurrence":source["instance_id"]},sketch="discarded-profile")
    assert doc.features[cut["feature_id"]].parameters=={}
    assert "profile" not in doc.features[cut["feature_id"]].references
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(7200-math.pi*9*6)

def test_rotated_target_and_parameter_driven_reference_regeneration(kernel):
    doc,part,out,ref=plate(kernel)
    reduce(doc,Actor(),"instance.transform",{"id":part["instance_id"],"x":100,"y":-30,"rx":35,"rz":20})
    hole=edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="circle",result="cut",origin="reference",reference=ref,profile_reference=ref,plane="face",extent="through",values={"diameter":5,"offset_u":8})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(7200-math.pi*2.5**2*6)
    width=doc.features[part["feature_id"]].parameters["width"]
    reduce(doc,Actor(),"parameter.set",{"id":width,"value":50})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(9000-math.pi*2.5**2*6)
    assert doc.features[hole["feature_id"]].references["reference"]["face"]==ref["face"]

def test_closed_sketch_keeps_implicit_yz_plane(kernel):
    doc=Document()
    profile=reduce(doc,Actor(),"feature.create",{"type":"rectangle","values":{"length":20,"width":10,"z":3},"options":{"plane":"YZ"}})[0]
    reduce(doc,Actor(),"instance.transform",{"id":profile["instance_id"],"rz":90,"x":25})
    edit(doc,target=profile["component_id"],target_occurrence=profile["instance_id"],profile="sketch",result="add",sketch=profile["feature_id"],sketch_occurrence=profile["instance_id"],origin="reference",reference={"component":profile["component_id"],"occurrence":profile["instance_id"]},values={"distance":4})
    out=evaluate(kernel,doc)["components"][profile["component_id"]]
    assert out["volume"]==pytest.approx(800)
    assert out["bounds"]["size"][0]==pytest.approx(4)
    assert out["bounds"]["min"][0]==pytest.approx(3)

def test_origin_follows_exact_midpoint_and_offsets(kernel):
    doc,part,out,_=plate(kernel)
    edge=next(e for e in out["edges"] if abs(e["tangent"][2])>.99)
    ref={"component":part["component_id"],"occurrence":part["instance_id"],"edge":edge["signature"],"anchor":"mid"}
    new=edit(doc,profile="rectangle",reference=ref,path_reference=ref,origin="reference",plane="perpendicular",direction="edge",values={"width":2,"height":2,"distance":2,"offset_u":10})
    out=evaluate(kernel,doc)["components"][new["component_id"]]
    assert out["volume"]==pytest.approx(8)
    assert out["bounds"]["size"][2]==pytest.approx(2)
    assert min(abs(out["bounds"][key][2]-3) for key in ("min","max"))<1e-6

def test_mismatched_occurrence_reference_is_rejected(kernel):
    doc,part,_,ref=plate(kernel)
    other=edit(doc,profile="circle",values={"distance":3})
    edit(doc,target=part["component_id"],profile="body",motion="none",result="cut",profile_reference={"component":other["component_id"],"occurrence":part["instance_id"]})
    with pytest.raises(CadError) as exc:evaluate(kernel,doc)
    assert exc.value.code=="invalid_reference"

def test_body_mirror_and_connected_repeat_use_the_same_recipe(kernel):
    doc,part,_,_=plate(kernel)
    ref={"component":part["component_id"],"occurrence":part["instance_id"]}
    mirrored=edit(doc,profile="body",motion="mirror",plane="XY",profile_reference=ref)
    out=evaluate(kernel,doc)["components"][mirrored["component_id"]]
    assert out["bounds"]["min"][2]==pytest.approx(-6)
    assert out["volume"]==pytest.approx(7200)
    edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="body",motion="pattern",direction="X",profile_reference=ref,result="add",values={"count":2,"spacing":10})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(50*30*6)

def test_planar_circle_cut_has_no_separate_thickness_or_body(kernel):
    doc=Document();part=edit(doc,profile="rectangle",motion="none",values={"width":40,"height":30})
    out=evaluate(kernel,doc)["components"][part["component_id"]];face=out["faces"][0]
    ref={"component":part["component_id"],"occurrence":part["instance_id"],"face":face["signature"]}
    edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="circle",motion="none",result="cut",origin="reference",reference=ref,profile_reference=ref,plane="face",values={"diameter":10})
    out=evaluate(kernel,doc)["components"][part["component_id"]]
    assert out["status"]=="planar" and out["area"]==pytest.approx(1200-math.pi*25)

def test_native_finishing_recipe_is_canonical_and_partial_sweep_is_not_silently_ignored(kernel):
    doc,part,out,_=plate(kernel)
    finish=edit(doc,target=part["component_id"],profile="fillet",path_reference={"component":part["component_id"],"edge":out["edges"][0]["signature"]},values={"amount":1})
    assert doc.features[finish["feature_id"]].options["motion"]=="sweep"
    assert doc.features[finish["feature_id"]].options["result"]=="add"
    evaluate(kernel,doc)
    with pytest.raises(CadError) as exc:edit(Document(),profile="circle",motion="sweep",extent="symmetric")
    assert exc.value.code=="unsupported_extent"


def test_intersection_normalizes_kernel_collections_and_rejects_empty_overlap(kernel):
    doc,part,_,_=plate(kernel)
    source=edit(doc,profile="circle",values={"diameter":6,"distance":10})
    args=dict(target=part["component_id"],profile="body",motion="none",result="intersect",profile_reference={"component":source["component_id"],"occurrence":source["instance_id"]})
    edit(doc,**args)
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(math.pi*9*6)
    doc,part,_,_=plate(kernel)
    source=edit(doc,profile="circle",values={"origin_x":100,"diameter":6,"distance":10})
    edit(doc,target=part["component_id"],profile="body",motion="none",result="intersect",profile_reference={"component":source["component_id"]})
    with pytest.raises(CadError) as exc:evaluate(kernel,doc)
    assert exc.value.code=="empty_solid"


@pytest.mark.parametrize("distance,mode,volume",[(2,"add",9600),(-2,"cut",4800)])
def test_auto_face_result_uses_native_overlap_and_cached_decisions(kernel,distance,mode,volume):
    doc,part,_,ref=plate(kernel)
    ft=edit(doc,target=part["component_id"],profile="face",result="auto",origin="reference",reference=ref,profile_reference=ref,plane="face",values={"distance":distance})
    for _ in range(2):
        out=evaluate(kernel,doc)
        assert out["components"][part["component_id"]]["volume"]==pytest.approx(volume)
        decision=out["operation_decisions"][ft["feature_id"]]
        assert decision["mode"]==mode
        assert decision["overlap_fraction"]==pytest.approx(1 if mode=="cut" else 0)


def test_auto_partial_overlap_and_through_extents(kernel):
    doc,part,_,_=plate(kernel)
    ft=edit(doc,target=part["component_id"],profile="circle",result="auto",values={"origin_z":5,"diameter":4,"distance":4})
    out=evaluate(kernel,doc)
    assert out["operation_decisions"][ft["feature_id"]]["overlap_fraction"]==pytest.approx(.25)
    assert out["components"][part["component_id"]]["volume"]==pytest.approx(7200+12*math.pi)
    doc,part,_,ref=plate(kernel)
    ft=edit(doc,target=part["component_id"],profile="circle",result="auto",plane="face",origin="reference",reference=ref,profile_reference=ref,extent="through",values={"diameter":4})
    out=evaluate(kernel,doc)
    assert out["operation_decisions"][ft["feature_id"]]["policy"]=="through_target"
    assert out["operation_decisions"][ft["feature_id"]]["mode"]=="cut"
    assert out["components"][part["component_id"]]["volume"]==pytest.approx(7200-24*math.pi)


def test_auto_planar_result_uses_area_overlap(kernel):
    doc=Document();part=edit(doc,profile="rectangle",motion="none",values={"width":40,"height":30})
    ft=edit(doc,target=part["component_id"],profile="circle",motion="none",result="auto",values={"diameter":10})
    out=evaluate(kernel,doc)
    assert out["operation_decisions"][ft["feature_id"]]["measure"]=="area"
    assert out["operation_decisions"][ft["feature_id"]]["mode"]=="cut"
    assert out["components"][part["component_id"]]["area"]==pytest.approx(1200-25*math.pi)

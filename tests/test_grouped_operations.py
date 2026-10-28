"""Native grouped-reference regressions: volume, placement and editable intent."""
import math
import copy
import pytest
from build123d import Edge, Vector
from ryancad.commands import reduce
from ryancad.errors import CadError
from ryancad.geometry import Evaluator
from ryancad.model import Actor, Document
from ryancad.operation_selection import connected_path
from test_operations import edit, evaluate, plate


@pytest.fixture(scope="module")
def kernel(): return Evaluator()


def region(kernel,doc,x,z=6,bottom=False):
    part=edit(doc,profile="circle",values={"origin_x":x,"origin_z":z if bottom else z-2,"diameter":4,"distance":2})
    out=evaluate(kernel,doc)["components"][part["component_id"]]
    face=next(f for f in out["faces"] if f["normal"][2] < -.99) if bottom else next(f for f in out["faces"] if f["normal"][2]>.99)
    return {"component":part["component_id"],"occurrence":part["instance_id"],"face":face["signature"]}


def grouped(doc,part,refs,**kwargs):
    return edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="sketch" if refs[0].get("sketch") else "face",origin="reference",reference=refs[0],profile_references=refs,plane="face" if refs[0].get("face") else "XY",**kwargs)


def test_native_chain_orders_reversed_edges_and_accepts_closed_loop():
    edges=[Edge.make_line((10,0,0),(0,0,0)),Edge.make_line((10,10,0),(10,0,0)),Edge.make_line((20,10,0),(10,10,0))]
    path=connected_path([edges[1],edges[0],edges[2]])
    assert path.length==pytest.approx(30)
    assert (path.position_at(0)-path.position_at(1)).length==pytest.approx(math.sqrt(500))
    loop=connected_path([Edge.make_line((0,0,0),(10,0,0)),Edge.make_line((10,10,0),(10,0,0)),Edge.make_line((10,10,0),(0,0,0))])
    assert loop.is_closed


@pytest.mark.parametrize("points,code",[
    ([((0,0,0),(10,0,0)),((10,0,0),(20,0,0)),((10,0,0),(10,10,0))],"branched_path"),
    ([((0,0,0),(10,0,0)),((20,0,0),(30,0,0))],"disconnected_path"),
])
def test_native_chain_rejects_branches_and_gaps(points,code):
    with pytest.raises(CadError) as exc: connected_path([Edge.make_line(a,b) for a,b in points])
    assert exc.value.code==code


def test_real_multi_edge_sweep_and_finish(kernel):
    doc,part,out,_=plate(kernel)
    edges=[next(e for e in out["edges"] if abs(e["tangent"][0])>.99 and abs(e["center"][1]+15)<1e-5 and abs(e["center"][2]-6)<1e-5),next(e for e in out["edges"] if abs(e["tangent"][1])>.99 and abs(e["center"][0]-20)<1e-5 and abs(e["center"][2]-6)<1e-5)]
    refs=[{"component":part["component_id"],"occurrence":part["instance_id"],"edge":e["signature"]} for e in edges]
    native=connected_path([Edge.make_line(e["start"],e["end"]) for e in edges]);start=native.position_at(0)
    anchor=next({**r,"anchor":key} for e,r in zip(edges,refs) for key in ("start","end") if (start-Vector(e[key])).length<1e-6)
    finish_doc=copy.deepcopy(doc)
    tube=edit(doc,profile="circle",motion="sweep",path_references=refs,reference=anchor,origin="reference",plane="perpendicular",direction="edge",values={"diameter":2})
    result=evaluate(kernel,doc)["components"][tube["component_id"]]
    assert result["volume"]==pytest.approx(math.pi*70,rel=1e-5)
    assert doc.features[tube["feature_id"]].options["recipe_version"]==2
    edit(finish_doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="fillet",path_references=refs,values={"amount":1})
    assert evaluate(kernel,finish_doc)["components"][part["component_id"]]["volume"]<7200


def test_parallel_profiles_preserve_spacing_and_regenerate_together(kernel):
    doc,part,_,_=plate(kernel);refs=[region(kernel,doc,-8),region(kernel,doc,8)]
    operation=grouped(doc,part,refs,result="add",values={"distance":3,"offset_u":2})
    out=evaluate(kernel,doc)["components"][part["component_id"]]
    assert out["volume"]==pytest.approx(7200+2*math.pi*4*3)
    assert out["bounds"]["max"][2]==pytest.approx(9)
    restored=Document.model_validate_json(doc.model_dump_json())
    reduce(restored,Actor(),"parameter.set",{"id":restored.features[operation["feature_id"]].parameters["distance"],"value":5})
    assert evaluate(kernel,restored)["components"][part["component_id"]]["volume"]==pytest.approx(7200+2*math.pi*4*5)


def test_profiles_on_parallel_offset_planes_are_not_flattened(kernel):
    doc,part,_,_=plate(kernel);refs=[region(kernel,doc,-8,z=6),region(kernel,doc,8,z=8)]
    grouped(doc,part,refs,result="cut",values={"distance":-4})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(7200-math.pi*4*6)


def test_opposite_face_normals_share_one_signed_direction(kernel):
    doc,part,_,_=plate(kernel);refs=[region(kernel,doc,-8),region(kernel,doc,8,bottom=True)]
    grouped(doc,part,refs,result="add",values={"distance":3})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(7200+2*math.pi*4*3)


def test_grouped_existing_sketches_use_their_own_regions(kernel):
    doc,part,_,_=plate(kernel);refs=[]
    for x in (-8,8):
        source=reduce(doc,Actor(),"feature.create",{"type":"circle","values":{"diameter":4,"x":x,"z":6}})[0]
        refs.append({"component":source["component_id"],"occurrence":source["instance_id"],"sketch":source["feature_id"]})
    grouped(doc,part,refs,result="add",values={"distance":3})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(7200+2*math.pi*4*3)


def test_nonparallel_or_missing_secondary_profile_is_rejected(kernel):
    doc,part,out,top=plate(kernel)
    side={**top,"face":next(f for f in out["faces"] if f["normal"][0]>.99)["signature"]}
    grouped(doc,part,[top,side],result="cut",values={"distance":-1})
    with pytest.raises(CadError) as exc:evaluate(kernel,doc)
    assert exc.value.code=="nonparallel_profiles"
    doc.features[doc.feature_order[-1]].references["profile_references"][1]["face"]="missing"
    with pytest.raises(CadError) as exc:evaluate(kernel,doc)
    assert exc.value.code=="missing_reference"


def test_grouped_references_use_each_occurrence_frame(kernel):
    doc,part,_,_=plate(kernel);refs=[region(kernel,doc,-8),region(kernel,doc,8)]
    for instance in [part["instance_id"],*(r["occurrence"] for r in refs)]:
        reduce(doc,Actor(),"instance.transform",{"id":instance,"x":100,"y":50,"rz":30,"rx":20})
    grouped(doc,part,refs,result="add",values={"distance":3})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(7200+2*math.pi*4*3)


def test_disconnected_new_profiles_do_not_bypass_component_ownership(kernel):
    doc,part,_,_=plate(kernel);refs=[region(kernel,doc,-8),region(kernel,doc,8)]
    edit(doc,profile="face",profile_references=refs,reference=refs[0],origin="reference",plane="face",result="new",values={"distance":3})
    with pytest.raises(CadError) as exc:evaluate(kernel,doc)
    assert exc.value.code=="separate_components_required"


def test_distinct_coplanar_faces_on_one_body_are_individually_referenceable(kernel):
    doc,part,_,_=plate(kernel)
    for x in (-9,9):
        edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="circle",result="add",values={"origin_x":x,"origin_z":6,"diameter":6,"distance":4})
    out=evaluate(kernel,doc)["components"][part["component_id"]]
    faces=[f for f in out["faces"] if f["normal"][2]>.99 and abs(f["center"][2]-10)<1e-5]
    assert len(faces)==2 and faces[0]["signature"]!=faces[1]["signature"]
    refs=[{"component":part["component_id"],"occurrence":part["instance_id"],"face":f["signature"]} for f in faces]
    grouped(doc,part,refs,result="cut",values={"distance":-2})
    assert evaluate(kernel,doc)["components"][part["component_id"]]["volume"]==pytest.approx(7200+2*math.pi*9*2)


def test_secondary_group_reference_prevents_source_deletion(kernel):
    doc,part,_,_=plate(kernel);refs=[region(kernel,doc,-8),region(kernel,doc,8)]
    grouped(doc,part,refs,result="add",values={"distance":3})
    with pytest.raises(CadError) as exc:reduce(doc,Actor(),"component.delete",{"id":refs[1]["component"]})
    assert exc.value.code=="component_in_use"


def test_multiple_profiles_sweep_along_the_same_connected_path(kernel):
    doc=Document();part=edit(doc,profile="rectangle",values={"width":50,"height":50,"distance":20})
    out=evaluate(kernel,doc)["components"][part["component_id"]]
    edges=[next(e for e in out["edges"] if abs(e["tangent"][0])>.99 and abs(e["center"][1]+25)<1e-6 and abs(e["center"][2])<1e-6),next(e for e in out["edges"] if abs(e["tangent"][1])>.99 and abs(e["center"][0]-25)<1e-6 and abs(e["center"][2])<1e-6)]
    path=connected_path([Edge.make_line(e["start"],e["end"]) for e in edges]);start=path.position_at(0);direction=path.tangent_at(0)
    paths=[{"component":part["component_id"],"occurrence":part["instance_id"],"edge":e["signature"]} for e in edges]
    refs=[]
    for z in (8,12):
        source=edit(doc,profile="circle",plane="YZ" if abs(direction.X)>.99 else "XZ",values={"origin_x":start.X,"origin_y":start.Y,"origin_z":z,"diameter":2,"distance":2})
        geo=evaluate(kernel,doc)["components"][source["component_id"]]
        face=next(f for f in geo["faces"] if f["type"]=="PLANE" and abs(f["center"][0]-start.X)<1e-6 and abs(f["center"][1]-start.Y)<1e-6)
        refs.append({"component":source["component_id"],"occurrence":source["instance_id"],"face":face["signature"]})
    removed=[]
    for regions in ([refs[0]],[refs[1]],refs):
        candidate=copy.deepcopy(doc)
        grouped(candidate,part,regions,result="cut",motion="sweep",path_references=paths,direction="edge")
        removed.append(50000-evaluate(kernel,candidate)["components"][part["component_id"]]["volume"])
    assert removed[0]>0 and removed[1]>0
    assert removed[2]==pytest.approx(removed[0]+removed[1])


@pytest.mark.parametrize("second",[{"component":"other","occurrence":"b","edge":"edge2"},{"component":"part","occurrence":"other-copy","edge":"edge2"}])
def test_path_lists_cannot_mix_components_or_linked_instances(second):
    doc=Document()
    with pytest.raises(CadError,match="same component instance"):
        edit(doc,profile="circle",motion="sweep",path_references=[{"component":"part","occurrence":"a","edge":"edge1"},second])
    assert not doc.features


def test_regeneration_rejects_saved_mixed_component_path_lists(kernel):
    doc,part,out,_=plate(kernel)
    edge=out["edges"][0]
    ref={"component":part["component_id"],"occurrence":part["instance_id"],"edge":edge["signature"]}
    made=edit(doc,target=part["component_id"],target_occurrence=part["instance_id"],profile="fillet",path_reference=ref,values={"amount":1})
    doc.features[made["feature_id"]].references["path_references"]=[ref,{**ref,"occurrence":"different-copy"}]
    with pytest.raises(CadError,match="same component instance"):evaluate(kernel,doc)

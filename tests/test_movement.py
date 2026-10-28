import copy

import numpy as np
import pytest

from ryancad.commands import reduce
from ryancad.errors import CadError
from ryancad.model import Actor, Document
from ryancad.parameters import evaluate
from ryancad.placements import flatten_instances


@pytest.fixture
def scene():
    doc, actor = Document(), Actor(id="human", name="Human", kind="human")
    a = reduce(doc, actor, "component.create", {"name": "Part", "placement": {"x": 10, "rz": 20}})[0]
    b = reduce(doc, actor, "component.duplicate", {"id": a["component_id"], "name": "Target", "placement": {"x": 50, "y": 12, "z": 7}})[0]
    return doc, actor, a, b


def row(doc, id):
    return next(o for o in flatten_instances(doc, evaluate(doc)) if o["source_id"] == id)


def move(scene, **args):
    doc, actor, a, _ = scene
    return reduce(doc, actor, "instance.move", {"id": a["instance_id"], "occurrence": row(doc, a["instance_id"])["id"], **args})[0]["movement"]


def refs(scene):
    doc, _, a, b = scene
    return dict(origin={"occurrence": row(doc, a["instance_id"])["id"], "point": [0, 0, 0]},
                target={"occurrence": row(doc, b["instance_id"])["id"], "point": [0, 0, 0]})


def test_axes_are_offsets_from_nonzero_placement_and_keep_inputs_parameterized(scene):
    doc, _, a, b = scene
    result = move(scene, method="axes", values={"x": "1 in", "y": -3, "rz": "10 deg"})
    after = row(doc, a["instance_id"])
    assert np.array(after["matrix"])[:3, 3] == pytest.approx([35.4, -3, 0])
    assert result["delta_parent"] == pytest.approx([25.4, -3, 0])
    assert evaluate(doc)[doc.instances[a["instance_id"]].placement["rz"]] == pytest.approx(30)
    assert row(doc, b["instance_id"])["matrix"][0][3] == 50
    param = next(p for p in doc.parameters.values() if p.name == "Part move · x")
    param.expression = "30"
    assert row(doc, a["instance_id"])["matrix"][0][3] == pytest.approx(40)


def test_point_alignment_rotated_origin_is_exact_and_orientation_preserved(scene):
    doc, _, a, _ = scene
    r = refs(scene)
    r["origin"]["point"] = [2, 3, 4]
    before = np.array(row(doc, a["instance_id"])["matrix"])
    result = move(scene, method="point", **r)
    after = np.array(row(doc, a["instance_id"])["matrix"])
    assert (after @ [2, 3, 4, 1])[:3] == pytest.approx([50, 12, 7])
    assert after[:3, :3] == pytest.approx(before[:3, :3])
    assert result["remaining_gap"] == pytest.approx(0)


def test_direction_uses_reference_world_rotation_signed_distance_and_reverse(scene):
    doc, actor, a, b = scene
    reduce(doc, actor, "instance.transform", {"id": b["instance_id"], "rz": 90})
    direction = {"occurrence": row(doc, b["instance_id"])["id"], "start": [0, 0, 0], "end": [4, 0, 0]}
    result = move(scene, method="direction", direction=direction, values={"distance": -5}, reverse=True)
    assert result["displacement"] == pytest.approx([0, 5, 0], abs=1e-10)
    assert np.array(row(doc, a["instance_id"])["matrix"])[:3, 3] == pytest.approx([10, 5, 0])


def test_projected_move_preserves_all_perpendicular_components(scene):
    doc, _, a, b = scene
    r = refs(scene)
    direction = {"occurrence": r["target"]["occurrence"], "start": [0, 0, 0], "end": [1, 1, 0]}
    result = move(scene, method="projected", direction=direction, **r)
    # (target-origin)=(40,12,7); projection on (1,1,0)=(26,26,0).
    assert result["displacement"] == pytest.approx([26, 26, 0])
    assert np.dot(np.array(result["displacement"]), [1, -1, 0]) == pytest.approx(0)
    assert result["remaining_gap"] == pytest.approx(np.linalg.norm([14, -14, 7]))
    assert np.array(row(doc, a["instance_id"])["matrix"])[:3, 3] == pytest.approx([36, 26, 0])


def test_nested_rotated_parent_and_circular_pattern_frame(scene):
    doc, actor, a, _ = scene
    parent = reduce(doc, actor, "component.create", {"name": "Assembly", "kind": "assembly", "placement": {"x": 100, "rz": 90}})[0]
    reduce(doc, actor, "instance.reparent", {"id": a["instance_id"], "parent": parent["component_id"]})
    result = move(scene, method="axes", values={"x": 3})
    assert result["displacement"] == pytest.approx([0, 3, 0], abs=1e-10)
    assert np.array(row(doc, a["instance_id"])["matrix"])[:3, 3] == pytest.approx([100, 13, 0])
    result = move(scene, method="point", **refs(scene))
    assert result["destination"] == pytest.approx([50, 12, 7])


def test_moves_detach_shared_placement_without_moving_unrelated_instance(scene):
    doc, _, a, b = scene
    doc.instances[b["instance_id"]].placement["x"] = doc.instances[a["instance_id"]].placement["x"]
    move(scene, method="axes", values={"x": 8})
    assert row(doc, a["instance_id"])["matrix"][0][3] == 18
    assert row(doc, b["instance_id"])["matrix"][0][3] == 10


@pytest.mark.parametrize("method,extra", [
    ("invalid", {}), ("point", {}),
    ("direction", {"direction": {"start": [0, 0, 0], "end": [0, 0, 0]}}),
])
def test_invalid_movement_is_rejected(scene, method, extra):
    doc, _, a, _ = scene
    if "direction" in extra: extra["direction"]["occurrence"] = row(doc, a["instance_id"])["id"]
    with pytest.raises(CadError): move(scene, method=method, **extra)


def test_origin_cannot_be_picked_on_other_component(scene):
    r = refs(scene); r["origin"] = copy.deepcopy(r["target"])
    with pytest.raises(CadError, match="origin must be on the active"):
        move(scene, method="point", **r)


def test_circular_member_uses_its_own_frame_and_point_alignment(scene):
    doc, actor, a, b = scene
    reduce(doc, actor, "component.pattern", {"instance_id":a["instance_id"],"mode":"circular","axis":"Z","count":2,"angle":90})
    member = next(o for o in flatten_instances(doc,evaluate(doc)) if o["source_id"]==a["instance_id"] and o["pattern_index"]==1)
    result = reduce(doc, actor, "instance.move", {"id":a["instance_id"], "occurrence":member["id"],"method":"point",
        "origin":{"occurrence":member["id"],"point":[0,0,0]},"target":{"occurrence":row(doc,b["instance_id"])["id"],"point":[0,0,0]}})[0]
    after = next(o for o in flatten_instances(doc,evaluate(doc)) if o["id"]==member["id"])
    assert np.array(after["matrix"])[:3,3] == pytest.approx([50,12,7])
    assert result["movement"]["remaining_gap"] == pytest.approx(0)


def test_perpendicular_projection_is_zero_without_inventing_translation(scene):
    doc, actor, a, b = scene
    reduce(doc, actor, "instance.transform", {"id":b["instance_id"],"x":10,"y":9,"z":4})
    r = refs(scene)
    result = move(scene,method="projected",**r,direction={"occurrence":r["target"]["occurrence"],"start":[0,0,0],"end":[5,0,0]})
    assert result["displacement"] == pytest.approx([0,0,0])
    assert result["remaining_gap"] == pytest.approx(97**.5)


@pytest.mark.parametrize("has_direction,distance,expected", [(False,None,[40,12,7]), (True,None,[40,0,0]), (True,5,[5,0,0]), (True,-5,[-5,0,0])])
def test_unified_references_infer_motion_and_exact_distance_overrides_target(scene,has_direction,distance,expected):
    r=refs(scene)
    args={"method":"reference",**r}
    if has_direction: args["direction"]={"occurrence":r["target"]["occurrence"],"start":[0,0,0],"end":[2,0,0]}
    if distance is not None: args["values"]={"distance":distance}
    result=move(scene,**args)
    assert result["displacement"] == pytest.approx(expected)


def test_unified_target_only_defaults_origin_and_distance_can_follow_target_ray(scene):
    r=refs(scene)
    result=move(scene,method="reference",target=r["target"],values={"distance":10})
    assert result["displacement"] == pytest.approx(np.array([40,12,7])/np.linalg.norm([40,12,7])*10)


def test_unified_direction_distance_uses_explicit_source_point_for_guide(scene):
    r=refs(scene);r["origin"]["point"]=[2,0,0]
    result=move(scene,method="reference",origin=r["origin"],direction={"occurrence":r["target"]["occurrence"],"start":[0,0,0],"end":[0,0,3]},values={"distance":8})
    assert result["displacement"] == pytest.approx([0,0,8])
    assert result["origin"] != [10,0,0]


def test_axis_rotation_uses_real_axis_position_and_angle_stays_editable(scene):
    doc,_,a,b=scene
    axis={"occurrence":row(doc,b["instance_id"])["id"],"start":[0,0,0],"end":[0,0,5]}
    result=move(scene,method="rotate",direction=axis,values={"angle":"90 deg"})
    actual=np.array(row(doc,a["instance_id"])["matrix"])
    assert actual[:3,3] == pytest.approx([62,-28,0])
    assert actual[0,0] == pytest.approx(np.cos(np.deg2rad(110)))
    assert result["rotation_angle"] == 90
    angle=doc.parameters[doc.instances[a["instance_id"]].placement["rotation_angle"]]
    angle.expression="180 deg"
    assert np.array(row(doc,a["instance_id"])["matrix"])[:3,3] == pytest.approx([90,24,0])
    assert np.array(row(doc,b["instance_id"])["matrix"])[:3,3] == pytest.approx([50,12,7])


@pytest.mark.parametrize("angle", [90,-90,180,45])
def test_rotation_then_relative_and_absolute_movement_do_not_jump_at_gimbal(scene,angle):
    doc,actor,a,b=scene
    reduce(doc,actor,"instance.transform",{"id":a["instance_id"],"rz":0})
    axis={"occurrence":row(doc,b["instance_id"])["id"],"start":[-50,-12,-7],"end":[-50,-11,-7]}
    move(scene,method="rotate",direction=axis,values={"angle":angle})
    rotated=np.array(row(doc,a["instance_id"])["matrix"])
    move(scene,method="axes",values={"x":3})
    after=np.array(row(doc,a["instance_id"])["matrix"])
    assert after[:3,:3] == pytest.approx(rotated[:3,:3],abs=1e-8)
    assert after[:3,3] == pytest.approx(rotated[:3,3]+[3,0,0])
    reduce(doc,actor,"instance.transform",{"id":a["instance_id"],"z":22})
    final=np.array(row(doc,a["instance_id"])["matrix"])
    assert final[:3,:3] == pytest.approx(rotated[:3,:3],abs=1e-8)
    assert final[2,3] == pytest.approx(22)


def test_rotation_in_nested_parent_frame_and_repeated_rotation_compose(scene):
    doc,actor,a,b=scene
    parent=reduce(doc,actor,"component.create",{"name":"Parent","kind":"assembly","placement":{"rz":90,"x":100}})[0]
    reduce(doc,actor,"instance.reparent",{"id":a["instance_id"],"parent":parent["component_id"]})
    axis={"occurrence":row(doc,b["instance_id"])["id"],"start":[0,0,0],"end":[0,0,1]}
    before=np.array(row(doc,a["instance_id"])["matrix"])
    move(scene,method="rotate",direction=axis,values={"angle":45})
    move(scene,method="rotate",direction=axis,values={"angle":45})
    after=np.array(row(doc,a["instance_id"])["matrix"])
    rz=np.array([[0,-1,0],[1,0,0],[0,0,1]])
    pivot=np.array([50,12,7])
    assert after[:3,3] == pytest.approx(pivot+rz@(before[:3,3]-pivot))
    assert after[:3,:3] == pytest.approx(rz@before[:3,:3])


@pytest.mark.parametrize("axis,expected",[("X",[6,0,0]),("Y",[0,6,0]),("Z",[0,0,6])])
def test_world_axes_are_global_in_rotated_parent_frames(scene,axis,expected):
    doc,actor,a,_=scene
    parent=reduce(doc,actor,"component.create",{"name":"Parent","kind":"assembly","placement":{"rz":90}})[0]
    reduce(doc,actor,"instance.reparent",{"id":a["instance_id"],"parent":parent["component_id"]})
    result=move(scene,method="reference",direction={"axis":axis},values={"distance":6})
    assert result["displacement"]==pytest.approx(expected)


def test_world_axis_rotation_is_about_world_origin_not_part_origin(scene):
    doc,_,a,_=scene
    move(scene,method="rotate",direction={"axis":"Z"},values={"angle":90})
    assert np.array(row(doc,a["instance_id"])["matrix"])[:3,3]==pytest.approx([0,10,0],abs=1e-8)


@pytest.mark.parametrize("direction",[{"axis":"bad"},{"axis":"X","occurrence":"invalid"}])
def test_world_axes_reject_ambiguous_or_unknown_directions(scene,direction):
    with pytest.raises(CadError): move(scene,method="reference",direction=direction,values={"distance":5})

def test_world_origin_is_a_valid_movement_target(scene):
    doc,_,a,_=scene
    result=move(scene,method="reference",target={"world":"origin"})
    assert result["displacement"]==pytest.approx([-10,0,0])
    assert np.array(row(doc,a["instance_id"])["matrix"])[:3,3]==pytest.approx([0,0,0])

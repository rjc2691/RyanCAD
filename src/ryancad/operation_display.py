"""Derived native operation information; never editable mesh geometry."""
import numpy as np


def finish_section(source, result, edge, world, fraction=.5):
    from build123d import Plane, section
    from .geometry import face_outlines, vector
    origin=edge.position_at(fraction);normal=edge.tangent_at(fraction).normalized()
    plane=Plane(origin=origin,z_dir=normal)
    before,after=section(source,plane),section(result,plane)
    regions=[]
    for effect,shape in (("removed",before.cut(after)),("added",after.cut(before))):
        for face in shape.faces():
            if face.area>1e-9:regions.append((face.distance_to(origin),effect,face))
    if not regions:return {"unavailable":"No changed corner section at this path station."}
    _,effect,face=min(regions,key=lambda row:row[0])
    point=lambda p:list(map(float,(world@np.array([*p,1]))[:3]))
    direction=lambda p:list(map(float,(world[:3,:3]@np.array(p))))
    return {"origin":point(vector(origin)),"normal":direction(vector(normal)),"u":direction(vector(plane.x_dir)),
            "loops":[[point(p) for p in loop] for loop in face_outlines(face)],"area":float(face.area),"effect":effect,"station":fraction}


def projected_path_distance(path, target, origin):
    from build123d import Wire
    shifted=path.translate(origin-path.position_at(0))
    nearest,_=shifted.closest_points(target)
    wire=Wire(shifted.edges())
    return wire.param_at_point(nearest)*wire.length,nearest

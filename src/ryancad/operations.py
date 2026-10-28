"""Unified, parameter-backed operation recipes and native geometric execution.

Display selections are converted into guarded references; no cursor coordinates or
preview mesh indices become editable topology references.
"""
from __future__ import annotations
import math
from typing import Any, Literal
import numpy as np
from pydantic import Field
from .errors import CadError
from .model import Model, Feature, uid


class Reference(Model):
    component: str
    occurrence: str | None = None
    face: str | None = None
    edge: str | None = None
    anchor: Literal["center", "start", "mid", "end"] = "center"
    sketch: str | None = None
    world: Literal["origin"] | None = None


class OperationRequest(Model):
    target: str | None = None
    target_occurrence: str | None = None
    name: str = "Tool operation"
    result: Literal["new", "auto", "add", "cut", "intersect"] = "new"
    profile: Literal["rectangle", "circle", "polygon", "face", "sketch", "body", "fillet", "chamfer"] = "rectangle"
    motion: Literal["linear", "sweep", "revolve", "helix", "none", "mirror", "pattern"] = "linear"
    plane: Literal["XY", "XZ", "YZ", "face", "perpendicular", "axial"] = "XY"
    direction: Literal["normal", "X", "Y", "Z", "edge"] = "normal"
    origin: Literal["coordinates", "reference"] = "coordinates"
    reference: Reference | None = None
    profile_reference: Reference | None = None
    path_reference: Reference | None = None
    travel_target: Reference | None = None
    path_references: list[Reference] = Field(default_factory=list, max_length=64)
    profile_references: list[Reference] = Field(default_factory=list, max_length=64)
    sketch: str | None = None
    sketch_occurrence: str | None = None
    extent: Literal["distance", "through", "symmetric"] = "distance"
    path_extent: Literal["full", "distance", "percent", "target"] = "full"
    reverse: bool = False
    keep_body_placement: bool = True
    points: list[list[Any]] = Field(default_factory=list, max_length=100)
    values: dict[str, Any] = Field(default_factory=dict)


DEFAULTS = {"origin_x":0,"origin_y":0,"origin_z":0,"offset_u":0,"offset_v":0,"offset_n":0,
            "width":20,"height":12,"diameter":5,"distance":10,"path_percent":100,"angle":360,"amount":2,"axis_x":0,"axis_y":0,"axis_z":0,"count":2,"spacing":10}


def validate_path_components(refs):
    owners={(r.get("component"),r.get("occurrence") or "") for r in refs}
    if len(owners)>1:
        raise CadError("invalid_path", "Tool Path edges must belong to the same component instance.")


def create_operation(document, actor, args):
    from .commands import create_component, parameter, require
    spec=OperationRequest.model_validate(args)
    if "path_extent" not in args and spec.motion=="linear" and "distance" in spec.values:spec.path_extent="distance"
    if spec.travel_target:spec.path_extent="target"
    if spec.path_references:
        validate_path_components([r.model_dump() for r in spec.path_references])
        if any(not r.edge or r.face or r.sketch for r in spec.path_references): raise CadError("invalid_path", "Every path reference must identify an edge.")
        spec.path_reference=spec.path_references[0]
    if spec.profile_references:
        if spec.profile not in {"face","sketch"}: raise CadError("invalid_profile", "Multiple profiles require planar faces or closed sketches.")
        if any(bool(r.face)==bool(r.sketch) or r.edge for r in spec.profile_references): raise CadError("invalid_profile", "Each profile reference must identify one face or sketch.")
        first=spec.profile_references[0]
        if first.sketch: spec.profile="sketch";spec.sketch=first.sketch;spec.sketch_occurrence=first.occurrence
        else: spec.profile="face";spec.profile_reference=first
    if len(spec.path_references)>1 and spec.motion not in {"sweep"} and spec.profile not in {"fillet","chamfer"}:
        raise CadError("unsupported_path", "A multi-edge path requires Sweep. Use one straight edge for an axis or direction.")
    if spec.profile!="sketch": spec.sketch=None;spec.sketch_occurrence=None
    if spec.profile in {"fillet","chamfer"}:
        spec.motion="sweep";spec.plane="perpendicular";spec.direction="edge";spec.extent="distance";spec.result="add"
        if spec.path_extent=="full":spec.reverse=False
    if spec.motion!="linear" and spec.extent!="distance":raise CadError("unsupported_extent","Symmetric and through-all extents apply to straight travel. Sweeps support distance or percentage in one direction.")
    if spec.path_extent!="full":
        if spec.motion=="helix" and spec.path_extent=="percent":raise CadError("unsupported_extent","Helical rise accepts a distance, a target point, or the full finite axis length.")
        if (spec.profile in {"fillet","chamfer"} and spec.path_extent!="target") or spec.motion not in {"linear","sweep","helix"}:
            raise CadError("unsupported_extent","Distance/percent extents apply to extrusion and sweep. Native edge finishes use full edges.")
        if spec.path_extent=="percent" and (not spec.path_reference or not spec.path_reference.edge):
            raise CadError("missing_path","A percentage needs a finite edge or connected path. An implicit normal has no total length.")
        if spec.extent=="through": raise CadError("unsupported_extent","Through-all does not take a distance or percentage.")
        if spec.path_extent=="target" and not spec.travel_target:raise CadError("missing_reference","Choose a travel target point.")
    if spec.path_extent=="full" and args.get("path_extent")=="full" and spec.motion in {"linear","helix"} and not spec.path_reference and spec.extent!="through":
        raise CadError("missing_path","An implicit normal/axis has no finite length. Enter a distance or choose a target point.")
    if spec.result != "new" and not spec.target:
        raise CadError("missing_target", "Pick the component to change in the viewport.")
    if spec.profile in {"fillet","chamfer"} and (not spec.target or not spec.path_reference or not spec.path_reference.edge):
        raise CadError("missing_path", "Pick the edge to finish. You can keep this operation open while selecting it.")
    if spec.motion == "sweep" and (not spec.path_reference or not spec.path_reference.edge):
        raise CadError("missing_path", "Pick a design edge for the sweep path.")
    if spec.direction=="edge" and spec.motion not in {"none","mirror"} and not spec.path_reference:
        raise CadError("missing_path","Pick an edge to define the direction or axis.")
    if spec.profile in {"face","body"} and not spec.profile_reference:
        raise CadError("missing_profile", "Pick the face or body to use as the tool profile.")
    if spec.profile=="face" and not spec.profile_reference.face:raise CadError("invalid_profile","Choose one planar face for a 2D tool profile.")
    if spec.profile == "sketch" and not spec.sketch:
        raise CadError("missing_profile", "Choose an existing closed sketch/profile.")
    if spec.profile == "polygon" and (len(spec.points)<3 or any(len(p)!=2 for p in spec.points)):
        raise CadError("open_profile", "Place at least three exact points, then close the inline profile.")
    if len(document.features)>=2000:
        raise CadError("document_limit", "This release supports at most 2,000 features.")
    for ref in (spec.reference,spec.profile_reference,spec.path_reference,spec.travel_target,*spec.path_references,*spec.profile_references):
        if ref:
            if ref.world:
                if ref.face or ref.edge or ref.sketch:raise CadError("invalid_reference","World origin is a point, not model geometry.")
                continue
            require(document.components,ref.component,"reference component")
            if ref.sketch and require(document.features,ref.sketch,"profile feature").owner!=ref.component: raise CadError("invalid_reference", "The sketch does not belong to the referenced component.")
    if spec.sketch: require(document.features,spec.sketch,"profile feature")
    owner=spec.target
    created={}
    if spec.result=="new" and spec.profile not in {"fillet","chamfer"}:
        planar=spec.motion in {"none","mirror","pattern"} and spec.profile!="body"
        part,instance=create_component(document,actor,spec.name,"planar" if planar else "solid")
        if spec.target and document.components[spec.target].purpose=="tool":
            if planar:raise CadError("invalid_tool_body","Tool bodies need solid geometry. Give the profile 3D travel or use a design sketch for a 2D profile.")
            part.purpose="tool"
        owner=part.id
        created={"component_id":owner,"instance_id":instance.id}
    component=require(document.components,owner,"target")
    if component.kind=="assembly": raise CadError("invalid_target","Pick a physical component, not an assembly group.")
    fields=set()
    if spec.profile in {"fillet","chamfer"}: fields.add("amount")
    else:
        if not (spec.profile=="body" and spec.keep_body_placement and spec.motion in {"none","pattern"}):
            fields.update(["origin_x","origin_y","origin_z"] if spec.origin=="coordinates" else ["offset_u","offset_v","offset_n"])
        if spec.profile=="rectangle": fields.update(["width","height"])
        if spec.profile=="circle": fields.add("diameter")
        if spec.path_extent=="percent": fields.add("path_percent")
        elif (spec.motion=="helix" and spec.path_extent!="target" and not (spec.path_extent=="full" and spec.path_reference)) or (spec.motion=="linear" and spec.extent!="through" and spec.path_extent!="target" and not (spec.path_extent=="full" and spec.path_reference)) or (spec.motion=="sweep" and spec.path_extent=="distance"): fields.add("distance")
        if spec.motion in {"revolve","helix"}:
            fields.add("angle")
            if not spec.path_reference: fields.update(["axis_x","axis_y","axis_z"])
        if spec.motion=="pattern":fields.update(["count","spacing"])
    unknown=set(spec.values)-set(DEFAULTS)
    if unknown: raise CadError("unknown_field",f"Unknown operation values: {', '.join(sorted(unknown))}")
    feature=Feature(id=uid("ft"),owner=owner,type="operation",name=spec.name[:120] or "Tool operation",
                    options=spec.model_dump(exclude={"values","points","reference","profile_reference","path_reference","travel_target","sketch","sketch_occurrence","target","target_occurrence","path_references","profile_references"}),
                    references={"target_occurrence":spec.target_occurrence if owner==spec.target else None,
                                **{k:getattr(spec,k).model_dump() for k in ("reference","profile_reference","path_reference","travel_target") if getattr(spec,k)},
                                **({"profile":spec.sketch,"profile_occurrence":spec.sketch_occurrence} if spec.sketch else {}),
                                **({"path_references":[r.model_dump() for r in spec.path_references]} if spec.path_references else {}),
                                **({"profile_references":[r.model_dump() for r in spec.profile_references]} if spec.profile_references else {})},created_by=actor.id,modified_by=actor.id)
    for field in sorted(fields):
        feature.parameters[field]=parameter(document,actor,owner,f"{feature.name} · {field.replace('_',' ')}",spec.values.get(field,DEFAULTS[field]),"angle" if field=="angle" else "count" if field=="count" else "ratio" if field=="path_percent" else "length","Tool operation")
    if spec.profile=="polygon":
        feature.options["point_count"]=len(spec.points)
        for i,point in enumerate(spec.points):
            for j,axis in enumerate("uv"):
                field=f"point_{i}_{axis}"
                feature.parameters[field]=parameter(document,actor,owner,f"{feature.name} · point {i+1} {axis}",point[j],category="Tool profile")
    document.features[feature.id]=feature
    feature.options["recipe_version"]=4 if spec.path_extent=="target" or (spec.path_extent=="full" and spec.path_reference and spec.motion in {"linear","helix"}) else 3 if spec.path_extent=="percent" or (spec.motion=="sweep" and spec.path_extent=="distance") else 2 if spec.path_references or spec.profile_references else 1
    document.feature_order.append(feature.id);component.feature_ids.append(feature.id);component.modified_by=actor.id
    if spec.motion in {"linear","sweep","revolve","helix"} and spec.profile not in {"fillet","chamfer"}: component.kind="solid"
    return {**created,"feature_id":feature.id},[owner,feature.id],f"{feature.name} · {component.name}"


def semantic_face(face, box):
    from .geometry import vector
    center=vector(face.center());size=vector(box.size);low=vector(box.min)
    try: normal=vector(face.normal_at())
    except Exception: normal=[0.,0.,0.]
    coords=[]
    for i in range(3):
        if face.geom_type.name=="PLANE" and abs(normal[i])<1e-6: coords.append("in-plane")
        else: coords.append(round((center[i]-low[i])/size[i],6) if size[i]>1e-9 else 0)
    clean=lambda value: 0.0 if abs(value)<5e-7 else round(value,6)
    return f"{face.geom_type.name}:{','.join(str(clean(v)) for v in normal)}:{[clean(v) if isinstance(v,(int,float)) else v for v in coords]}"


def face_signatures(shape):
    """Keep legacy unique signatures; disambiguate genuinely separate coplanar faces.

    Geometric guards deliberately fail on an unmatched replacement rather than
    silently selecting another face by enumeration order.
    """
    from collections import Counter
    from .geometry import vector
    faces=list(shape.faces());base=[semantic_face(f,shape.bounding_box()) for f in faces]
    counts=Counter(base);result=[]
    for face,key in zip(faces,base):
        if counts[key]>1:
            box=face.bounding_box()
            guard=vector(face.center())+vector(box.min)+vector(box.max)
            key+="@"+",".join(str(0.0 if abs(v)<5e-7 else round(v,6)) for v in guard)
        result.append(key)
    return result


def prepare(feature, document, values, shape, body_key, resolve, profiles, profile_keys):
    validate_path_components(feature.references.get("path_references",[]))
    from .placements import flatten_instances
    occurrences={o["id"]:o for o in flatten_instances(document,values)}
    matrices={key:np.asarray(o["matrix"]) for key,o in occurrences.items()}
    target_id=feature.references.get("target_occurrence")
    if target_id and target_id not in matrices: raise CadError("missing_reference","The target instance no longer exists.")
    if target_id and occurrences[target_id]["definition"]!=feature.owner: raise CadError("invalid_reference","The target instance does not belong to the target definition.")
    target=matrices.get(target_id,np.eye(4)); inverse=np.linalg.inv(target)
    context={"inverse":inverse,"refs":{},"profile":None};stamp={"target":target.tolist()}
    references={key:feature.references.get(key) for key in ("reference","profile_reference","path_reference","travel_target")}
    references.update({f"path_{i}":ref for i,ref in enumerate(feature.references.get("path_references",[]))})
    references.update({f"region_{i}":ref for i,ref in enumerate(feature.references.get("profile_references",[]))})
    for key,ref in references.items():
        if not ref: continue
        if ref.get("world"):
            context["refs"][key]=(None,inverse,ref);stamp[key]={"world":"origin"};continue
        if ref.get("sketch"):
            profile_id=ref["sketch"]
            if profile_id not in document.features or document.features[profile_id].owner!=ref["component"]: raise CadError("invalid_reference","The selected sketch no longer belongs to its component.")
            if profile_id not in profiles and ref["component"]!=feature.owner: resolve(ref["component"])
            if profile_id not in profiles: raise CadError("missing_reference","A selected profile is missing or occurs later in history.")
            source,source_key=profiles[profile_id],profile_keys[profile_id]
        elif ref["component"]==feature.owner: source,source_key=shape,body_key
        else: source,source_key=resolve(ref["component"])
        if source is None: raise CadError("missing_reference","The selected reference has no geometry.",reference=key)
        occurrence=ref.get("occurrence")
        if occurrence and occurrence not in matrices: raise CadError("missing_reference","A referenced instance no longer exists.",reference=key)
        if occurrence and occurrences[occurrence]["definition"]!=ref["component"]: raise CadError("invalid_reference","A reference instance does not match its component definition.",reference=key)
        matrix=inverse @ matrices.get(occurrence,np.eye(4))
        context["refs"][key]=(source,matrix,ref)
        stamp[key]={"shape":source_key,"matrix":matrix.tolist(),"ref":ref}
    profile_id=feature.references.get("profile")
    if profile_id:
        owner=document.features[profile_id].owner
        if profile_id not in profiles and owner!=feature.owner: resolve(owner)
        if profile_id not in profiles: raise CadError("missing_reference","The profile is missing or occurs later in history.")
        occurrence=feature.references.get("profile_occurrence")
        if occurrence and occurrence not in matrices: raise CadError("missing_reference","The sketch instance no longer exists.")
        if occurrence and occurrences[occurrence]["definition"]!=owner: raise CadError("invalid_reference","The sketch instance does not match its owner.")
        profile_matrix=inverse @ matrices.get(occurrence,np.eye(4))
        from build123d import Location
        from OCP.gp import gp_Trsf
        tr=gp_Trsf();tr.SetValues(*[float(v) for v in profile_matrix[:3,:].flat])
        context["profile"]=profiles[profile_id].moved(Location(tr))
        stamp["profile"]={"key":profile_keys[profile_id],"matrix":profile_matrix.tolist()}
    return context,stamp


def execute(feature, q, shape, context):
    from build123d import Axis, Edge, Face, Location, Plane, Solid, Vector, Wire
    from OCP.gp import gp_Trsf
    from .geometry import edge_selector
    o=feature.options
    if o.get("recipe_version",1) not in {1,2,3,4}: raise CadError("unsupported_operation_version","This operation recipe needs a newer engine.")
    def transform(source,matrix):
        transform=gp_Trsf();transform.SetValues(*[float(v) for v in matrix[:3,:].flat])
        return source.moved(Location(transform))
    def vec(point,matrix,point_like=True): return Vector(*((matrix @ np.array([*point,1 if point_like else 0]))[:3]))
    face_lookup={}
    def resolve_ref(key):
        source,matrix,ref=context["refs"][key]
        if ref.get("world"):return vec((0,0,0),matrix),ref
        selected=source
        if ref.get("edge"):
            selected=edge_selector(source,{"group":"semantic","signature":ref["edge"],"expected_count":1})[0]
        elif ref.get("face"):
            identifier=id(source)
            if identifier not in face_lookup:
                lookup={}
                for face,signature in zip(source.faces(),face_signatures(source)):
                    lookup.setdefault(signature,[]).append(face)
                    legacy=semantic_face(face,source.bounding_box())
                    if legacy!=signature:lookup.setdefault(legacy,[]).append(face)
                face_lookup[identifier]=lookup
            matches=face_lookup[identifier].get(ref["face"],[])
            if len(matches)!=1: raise CadError("ambiguous_reference" if matches else "missing_reference","The selected face no longer has a unique match. Pick its replacement.",matches=len(matches))
            selected=matches[0]
        return transform(selected,matrix),ref
    def point_ref(key):
        selected,ref=resolve_ref(key)
        if ref.get("world"):return selected
        if ref.get("edge"):return selected.position_at({"start":0,"end":1}.get(ref.get("anchor"),.5))
        return selected.center()
    world=np.linalg.inv(context["inverse"])
    def travel_info(origin,destination,distance,target=None):
        point=lambda p:list(map(float,(world@np.array([*p,1]))[:3]))
        if "travel" in context.setdefault("display",{}):return
        context["display"]["travel"]={"distance":float(distance),"origin":point(origin),"end":point(destination),"target":point(target) if target is not None else None}
    profile_kind=o["profile"]
    if profile_kind in {"fillet","chamfer"}:
        if shape is None or not shape.solids(): raise CadError("missing_solid","Select a solid component to finish.")
        refs=feature.references.get("path_references") or [feature.references["path_reference"]]
        selected=[]
        for ref in refs:
            if ref["component"]!=feature.owner or (ref.get("occurrence") and feature.references.get("target_occurrence") and ref["occurrence"]!=feature.references["target_occurrence"]): raise CadError("invalid_path","Finishing edges must belong to the active component instance.")
            selected.extend(edge_selector(shape,{"group":"semantic","signature":ref["edge"],"expected_count":1}))
        if len(set(r["edge"] for r in refs))!=len(refs): raise CadError("duplicate_reference","The same finishing edge was selected more than once.")
        if q["amount"]<=1e-5: raise CadError("invalid_dimension","Enter a positive edge finish size.")
        try:
            result=shape.fillet(q["amount"],selected) if profile_kind=="fillet" else shape.chamfer(q["amount"],None,selected)
        except Exception as exc:
            raise CadError("invalid_edge_finish",f"The {q['amount']:g} mm corner section does not fit this edge. Reduce its size or pick another edge.",reason=str(exc)[:500]) from exc
        station=.5
        if o.get("path_extent")=="target":
            if len(selected)!=1 or selected[0].geom_type.name!="LINE":raise CadError("unsupported_extent","Target-limited corner finishes require one straight edge. Curved/multiple edges use their full paths.")
            edge=selected[0];start=edge.position_at(1 if o["reverse"] else 0);direction=edge.tangent_at(0).normalized()*(-1 if o["reverse"] else 1)
            target=point_ref("travel_target");distance=(target-start).dot(direction)
            if not 1e-5<distance<=edge.length+1e-6:raise CadError("invalid_extent","Project the target between the path start and end. Reverse the path to start at its other end.")
            if distance<edge.length-1e-6:
                size=shape.bounding_box().diagonal*3+1
                slab=Solid.extrude(Face.make_rect(size,size,Plane(origin=start,z_dir=direction)),direction*distance)
                removed=shape.cut(result);added=result.cut(shape)
                clipped_removed=removed.intersect(slab) if removed.solids() else None
                clipped_added=added.intersect(slab) if added.solids() else None
                result=shape.cut(*clipped_removed.solids()) if clipped_removed is not None and clipped_removed.solids() else shape
                if clipped_added is not None and clipped_added.solids():result=result.fuse(*clipped_added.solids())
            station=(1-distance/edge.length/2) if o["reverse"] else distance/edge.length/2
            travel_info(start,start+direction*distance,distance,target)
        try:
            from .operation_display import finish_section
            context.setdefault("display",{})["finish_section"]=finish_section(shape,result,selected[0],world,station)
        except Exception as exc:context.setdefault("display",{})["finish_section"]={"unavailable":str(exc)[:200]}
        return result
    axis_world={"X":(1,0,0),"Y":(0,1,0),"Z":(0,0,1)}
    normal=vec((0,0,1),context["inverse"],False);u=vec((1,0,0),context["inverse"],False)
    base=vec((0,0,0),context["inverse"])
    reference=None
    if "reference" in context["refs"]:
        reference,ref=resolve_ref("reference")
        if ref.get("face"):
            base=reference.center();normal=reference.normal_at()
            u=Vector(1,0,0)
            if abs(normal.normalized().dot(u))>.95: u=Vector(0,1,0)
            u=(u-normal*normal.dot(u)).normalized()
        elif ref.get("edge"):
            t={"start":0,"end":1}.get(ref.get("anchor"),.5)
            base=reference.position_at(t);normal=reference.tangent_at(t).normalized()
            u=Vector(1,0,0) if abs(normal.X)<.9 else Vector(0,1,0)
            u=(u-normal*normal.dot(u)).normalized()
        else: base=reference if ref.get("world") else reference.center()
    if o["plane"]=="face" and "profile_reference" in context["refs"]:
        support,_=resolve_ref("profile_reference")
        if len(support.faces())==1:
            normal=support.faces()[0].normal_at();u=Vector(1,0,0) if abs(normal.X)<.95 else Vector(0,1,0);u=(u-normal*normal.dot(u)).normalized()
    if profile_kind=="face" and o["motion"]!="mirror":
        support,_=resolve_ref("profile_reference");normal=support.normal_at();u=Vector(1,0,0) if abs(normal.X)<.95 else Vector(0,1,0);u=(u-normal*normal.dot(u)).normalized()
    if profile_kind=="sketch" and context["profile"] and len(context["profile"].faces())==1:
        normal=context["profile"].faces()[0].normal_at();u=Vector(1,0,0) if abs(normal.X)<.95 else Vector(0,1,0);u=(u-normal*normal.dot(u)).normalized()
    if o["plane"] in {"XY","XZ","YZ"} and (profile_kind not in {"sketch","face"} or o["motion"]=="mirror"):
        normal=vec({"XY":(0,0,1),"XZ":(0,-1,0),"YZ":(1,0,0)}[o["plane"]],context["inverse"],False)
        u=vec({"XY":(1,0,0),"XZ":(1,0,0),"YZ":(0,1,0)}[o["plane"]],context["inverse"],False)
    path=None
    if "path_reference" in context["refs"]:
        from .operation_selection import connected_path
        path_refs=feature.references.get("path_references",[])
        path=connected_path([resolve_ref(f"path_{i}")[0] for i in range(len(path_refs))]) if path_refs else resolve_ref("path_reference")[0]
        if not hasattr(path,"tangent_at"): raise CadError("invalid_path","Pick an edge as the travel reference.")
        if o["motion"] in {"revolve","helix"} and (len(path.edges())!=1 or path.edges()[0].geom_type.name!="LINE"): raise CadError("invalid_axis","Pick a straight edge for a rotation axis. Use Sweep to follow a curved edge.")
    direction=(path.tangent_at(0).normalized() if o["direction"]=="edge" and path is not None else vec(axis_world[o["direction"]],context["inverse"],False) if o["direction"] in axis_world else normal.normalized())
    if o["plane"]=="perpendicular":
        normal=direction;u=Vector(1,0,0) if abs(normal.X)<.9 else Vector(0,1,0);u=(u-normal*normal.dot(u)).normalized()
    elif o["plane"]=="axial":
        u=Vector(1,0,0) if abs(direction.X)<.9 else Vector(0,1,0);u=(u-direction*direction.dot(u)).normalized();normal=u.cross(direction).normalized()
    v=normal.cross(u).normalized()
    origin=(vec((q.get("origin_x",0),q.get("origin_y",0),q.get("origin_z",0)),context["inverse"]) if o["origin"]=="coordinates" else base+u*q.get("offset_u",0)+v*q.get("offset_v",0)+normal*q.get("offset_n",0))
    plane=Plane(origin=origin,x_dir=u,z_dir=normal)
    if profile_kind=="circle":
        if q["diameter"]<=1e-5: raise CadError("invalid_dimension","Enter a positive profile diameter.")
        profile=Face(Wire.make_circle(q["diameter"]/2,plane))
    elif profile_kind=="rectangle":
        if min(q["width"],q["height"])<=1e-5: raise CadError("invalid_dimension","Enter positive profile width and height.")
        profile=Face.make_rect(q["width"],q["height"],plane)
    elif profile_kind=="polygon":
        points=[origin+u*q[f"point_{i}_u"]+v*q[f"point_{i}_v"] for i in range(o["point_count"])]
        profile=Face(Wire.make_polygon(points,close=True))
    elif profile_kind=="face":
        profile,_=resolve_ref("profile_reference")
        if len(profile.faces())!=1 or profile.geom_type.name!="PLANE": raise CadError("invalid_profile","Choose one planar face for a 2D tool profile.")
        profile=profile.translate(origin-profile.center())
    elif profile_kind=="sketch":
        source=context["profile"]
        if len(source.faces())!=1: raise CadError("open_profile","Choose a closed sketch with one region.")
        # Preserve the sketch's own plane; the origin explicitly repositions its center.
        profile=source.faces()[0].translate(origin-source.faces()[0].center())
    else:
        profile,_=resolve_ref("profile_reference")
        if not profile.solids(): raise CadError("invalid_profile","Pick a solid component for the 3D tool.")
        if not o["keep_body_placement"]: profile=profile.translate(origin-profile.center())
    regions=[profile]
    if feature.references.get("profile_references"):
        from .operation_selection import parallel_regions
        regions=[]
        for i in range(len(feature.references["profile_references"])):
            region,_=resolve_ref(f"region_{i}")
            if len(region.faces())!=1: raise CadError("open_profile","Each selected sketch must contain one closed region.")
            regions.append(region.faces()[0])
        parallel_regions(regions)
        delta=origin-regions[0].center()
        regions=[region.translate(delta) for region in regions]
    def travel(profile,region_origin,path=path):
        motion=o["motion"];reverse=-1 if o["reverse"] else 1
        if profile_kind=="body" and motion not in {"none","mirror","pattern"}: raise CadError("unsupported_motion","A 3D tool supports placed Booleans, mirroring, and connected repeats. Use a face or sketch for travel.")
        if motion=="none": tool=profile
        elif motion=="mirror":tool=profile.mirror(plane)
        elif motion=="pattern":
            if not 1<=q["count"]<=100 or int(q["count"])!=q["count"]:raise CadError("pattern_limit","Use 1–100 connected copies. Repeat part is for separate linked instances.")
            tool=profile.fuse(*[profile.translate(direction*(q["spacing"]*i*reverse)) for i in range(1,int(q["count"]))]) if q["count"]>1 else profile
        elif motion=="linear":
            distance=q.get("distance",DEFAULTS["distance"])
            target=None
            if o.get("path_extent")=="full" and o.get("recipe_version",1)>=4:
                if path is None:raise CadError("missing_path","Full travel requires a finite path.")
                distance=path.length
            if o.get("path_extent")=="target":
                target=point_ref("travel_target")
                distance=(target-origin).dot(direction)*reverse*(2 if o["extent"]=="symmetric" else 1)
            if o.get("path_extent")=="percent":
                if path is None: raise CadError("missing_path","Percentage extent needs a finite path.")
                if not 0<abs(q["path_percent"])<=100: raise CadError("invalid_extent","Use a nonzero percentage between -100 and 100.")
                distance=path.length*q["path_percent"]/100
            if o["extent"]=="through":
                if shape is None or not shape.solids(): raise CadError("missing_target","Through-all needs an existing solid target.")
                # A two-sided tool guarantees coverage along arbitrary directions, including offset region_origins.
                distance=shape.bounding_box().diagonal*2+(region_origin-shape.center()).length*2+2
                tool=Solid.extrude(profile.translate(direction*(-distance/2)),direction*distance)
            else:
                if abs(distance)<1e-5: raise CadError("invalid_dimension","Set a nonzero travel distance.")
                start=profile.translate(direction*(-distance*reverse/2)) if o["extent"]=="symmetric" else profile
                tool=Solid.extrude(start,direction*(distance*reverse))
                travel_info(region_origin,region_origin+direction*(distance*reverse/(2 if o["extent"]=="symmetric" else 1)),distance*reverse,target)
        elif motion=="sweep":
            if path is None: raise CadError("missing_path","Pick a path edge.")
            if o["reverse"]:
                from .operation_selection import reverse_path
                path=reverse_path(path)
            extent=o.get("path_extent","full")
            if extent!="full":
                from .operation_selection import trim_path_distance
                if extent=="percent":
                    if not 0<q["path_percent"]<=100: raise CadError("invalid_extent","Use a path percentage greater than zero and at most 100.")
                    distance=path.length*q["path_percent"]/100
                elif extent=="target":
                    from .operation_display import projected_path_distance
                    distance,_=projected_path_distance(path,point_ref("travel_target"),origin)
                else: distance=q["distance"]
                path=trim_path_distance(path,distance)
            travel_info(region_origin,region_origin+path.position_at(1)-path.position_at(0),path.length,point_ref("travel_target") if extent=="target" else None)
            tool=Solid.sweep(profile,path.translate(region_origin-path.position_at(0)),transition=Transition.RIGHT if len(path.edges())>1 else Transition.TRANSFORMED)
        elif motion=="revolve":
            angle=q["angle"]*reverse
            if not 0<abs(angle)<=360: raise CadError("invalid_angle","Use a revolution angle greater than zero and at most 360 degrees.")
            axis_region_origin=path.position_at(0) if path is not None else vec((q["axis_x"],q["axis_y"],q["axis_z"]),context["inverse"])
            tool=Solid.revolve(profile,angle,Axis(axis_region_origin,direction))
        else:
            rise=q.get("distance",DEFAULTS["distance"]);target=None
            if o.get("path_extent")=="full" and o.get("recipe_version",1)>=4:
                if path is None:raise CadError("missing_path","Full helical travel needs a finite axis edge.")
                rise=path.length
            if o.get("path_extent")=="target":
                target=point_ref("travel_target");signed=(target-origin).dot(direction);rise=abs(signed);reverse=-1 if signed<0 else 1
            if rise<=1e-5 or not .1<=abs(q["angle"])<=3600: raise CadError("invalid_motion","Helical travel needs positive rise and 0.1–3,600 degrees of rotation.")
            axis_region_origin=path.position_at(0) if path is not None else vec((q["axis_x"],q["axis_y"],q["axis_z"]),context["inverse"])
            radial=region_origin-axis_region_origin-direction*(region_origin-axis_region_origin).dot(direction);radius=radial.length
            if radius<=1e-5: raise CadError("invalid_axis","Move the profile away from the helix axis to give it a radius.")
            helix_plane=Plane(origin=region_origin-radial,x_dir=radial,z_dir=direction*reverse)
            helix=helix_plane.location*Edge.make_helix(rise*360/abs(q["angle"]),rise,radius,lefthand=q["angle"]<0)
            # Align the section to the path's initial tangent, preserving its U direction where possible.
            tangent=helix.tangent_at(0).normalized();hu=u-tangent*tangent.dot(u)
            if hu.length<1e-5: hu=radial
            source_plane=Plane(origin=region_origin,x_dir=u,z_dir=normal)
            helix_section=Plane(origin=region_origin,x_dir=hu,z_dir=tangent).location * source_plane.to_local_coords(profile)
            tool=Solid.sweep(helix_section,helix,is_frenet=True)
            travel_info(region_origin,helix.position_at(1),rise*reverse,target)
        return tool
    from build123d import Transition
    tools=[travel(region,origin+(region.center()-regions[0].center())) for region in regions]
    tool=tools[0].fuse(*tools[1:]) if len(tools)>1 else tools[0]
    mode=o["result"]
    if mode=="new": return tool
    if shape is None:
        if mode in {"add","auto"}:
            if mode=="auto":context["decision"]={"mode":"add","policy":"empty_target","overlap_fraction":0.,"threshold":.5}
            return tool
        raise CadError("missing_target","Removal and intersection need a target with geometry.")
    from .geometry import intersection
    if mode=="auto":
        solid=bool(tool.solids())
        measure=abs(float(tool.volume if solid else tool.area))
        box_a,box_b=shape.bounding_box(),tool.bounding_box()
        disjoint=any(getattr(box_a.max,a)<getattr(box_b.min,a)-1e-7 or getattr(box_b.max,a)<getattr(box_a.min,a)-1e-7 for a in "XYZ")
        common=None if disjoint else intersection(shape,tool)
        overlap=abs(float(common.volume if solid else common.area)) if common else 0.
        ratio=max(0.,min(1.,overlap/measure)) if measure>1e-9 else 0.
        through=o["motion"]=="linear" and o["extent"]=="through"
        mode="cut" if (overlap>1e-7 if through else ratio>.5+1e-7) else "add"
        context["decision"]={"mode":mode,"overlap_fraction":ratio,"overlap":overlap,"tool_measure":measure,
                             "measure":"volume" if solid else "area","policy":"through_target" if through else "majority_overlap","threshold":.5}
    if not shape.solids() and tool.solids() and mode=="add": return tool
    if not tool.solids() and shape.solids(): raise CadError("missing_motion","A 2D profile needs travel to change a solid. Set travel or create a new planar component.")
    result=shape.cut(tool) if mode=="cut" else intersection(shape,tool) if mode=="intersect" else shape.fuse(tool)
    if shape.solids() and abs(result.volume-shape.volume)<1e-7: raise CadError("no_effect","The tool does not change the target. Check the origin, direction, and travel.")
    return result

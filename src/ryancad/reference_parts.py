"""Immutable, self-contained snapshots of reusable part definitions."""
import re
from .errors import CadError
from .model import Document, Instance, uid
from .parameters import evaluate, dependencies
from .project_structure import descendants, available_name


def protected_state(document):
    result = {}
    for root in document.components.values():
        if not root.reference_source:
            continue
        members = descendants(document, root.id)
        features = {f.id:f.model_dump(mode='json') for f in document.features.values() if f.owner in members}
        instances = {i.id:i.model_dump(mode='json') for i in document.instances.values() if i.parent in members}
        used = {p for f in document.features.values() if f.owner in members for p in f.parameters.values()}
        used |= {p for i in document.instances.values() if i.parent in members for p in [*i.placement.values(), *i.pattern.values()]}
        result[root.id] = {'components':{c:document.components[c].model_dump(mode='json') for c in members},
                           'features':features,'instances':instances,
                           'parameters':{p:document.parameters[p].model_dump(mode='json') for p in used}}
    return result


def copy_part(target, actor, source, part_id, origin=None):
    part = source.components.get(part_id)
    if not part or part.structure_role != 'part':
        raise CadError('missing_part', 'Choose a reusable part.')
    members = descendants(source, part_id)
    if len(target.components)+len(members)>250:
        raise CadError('document_limit','This release supports at most 250 component definitions.')
    values = evaluate(source)
    features = [f for f in source.feature_order if source.features[f].owner in members]
    instances = [i for i in source.instances.values() if i.parent in members]
    variations = [v for v in source.variations.values() if v.part in members]
    used={p for fid in features for p in source.features[fid].parameters.values()}
    used|={p for i in instances for p in [*i.placement.values(),*i.pattern.values()]}
    used|={source.components[c].stock_thickness for c in members if source.components[c].stock_thickness}
    used|={p for v in variations for p in v.overrides}
    pending=list(used)
    for v in variations:
        for expression in v.overrides.values():
            for pid in dependencies(expression):
                if pid not in used:used.add(pid);pending.append(pid)
    while pending:
        for pid in dependencies(source.parameters[pending.pop()].expression):
            if pid not in used:used.add(pid);pending.append(pid)
    mapping = {key:uid('ref') for key in [*members,*features,*[i.id for i in instances],*[v.id for v in variations]]}
    mapping.update({pid:uid('p') for pid in used})
    def remap(value):
        if isinstance(value,dict):return {mapping.get(k,k):remap(v) for k,v in value.items()}
        if isinstance(value,list):return [remap(v) for v in value]
        if isinstance(value,str):
            if value in mapping:return mapping[value]
            for old,new in mapping.items():
                value=value.replace('@'+old,'@'+new)
            value=re.sub(r'\bp_[a-f0-9]+\b',lambda m:mapping.get(m[0],m[0]),value)
            return '/'.join(mapping.get(segment,segment) for segment in value.split('/'))
        return value
    # Capture numeric values so another design's parameter changes cannot propagate.
    for pid in used:
        p=source.parameters[pid]
        new=p.model_copy(deep=True);new.id=mapping[pid];new.owner=mapping.get(p.owner,mapping[part_id]);new.expression=repr(values[pid]);new.created_by=new.modified_by=actor.id
        if new.named:new.name=available_parameter_name(target,part.name+' · '+p.name)
        target.parameters[new.id]=new
    for cid in sorted(members, key=lambda c:c!=part_id):
        c=source.components[cid].model_copy(deep=True);c.id=mapping[cid];c.feature_ids=[mapping[f] for f in c.feature_ids];c.source_definition=None;c.reference_source=None
        if c.structure_role=='part':c.name=available_name(target,c.name if origin else c.name+' custom','part')
        c.read_only=bool(origin);c.created_by=c.modified_by=actor.id
        if c.stock_thickness:c.stock_thickness=mapping[c.stock_thickness]
        target.components[c.id]=c
    for fid in features:
        f=source.features[fid].model_copy(deep=True);f.id=mapping[fid];f.owner=mapping[f.owner];f.parameters=remap(f.parameters);f.options=remap(f.options);f.references=remap(f.references);f.created_by=f.modified_by=actor.id
        target.features[f.id]=f;target.feature_order.append(f.id)
    for instance in instances:
        i=instance.model_copy(deep=True)
        for key,value in remap(i.model_dump(mode='json')).items():setattr(i,key,value)
        i.created_by=actor.id;target.instances[i.id]=i
    for variation in variations:
        v=variation.model_copy(deep=True)
        for key,value in remap(v.model_dump(mode='json')).items():setattr(v,key,value)
        target.variations[v.id]=v
    root=target.components[mapping[part_id]];root.reference_source=origin
    library=Instance(id=uid('inst'),name=root.name,definition=root.id,created_by=actor.id)
    target.instances[library.id]=library
    return root.id,library.id


def available_parameter_name(document, name):
    used={p.name.casefold() for p in document.parameters.values() if p.named};base=name[:100];label=base;index=2
    while label.casefold() in used:label=f'{base} {index}';index+=1
    return label


def import_parts(document, actor, args):
    sources=args.get('sources',[])
    if not sources or len(sources)>50:raise CadError('invalid_selection','Choose between 1 and 50 parts.')
    made=[]
    for entry in sources:
        source=Document.model_validate(entry['document'])
        part=source.components.get(entry['part'])
        if not part or part.read_only:raise CadError('invalid_selection','Choose a custom part.')
        origin={'design_id':source.id,'design_name':source.name,'part_id':part.id,'part_name':part.name,'revision':source.revision}
        made.append(copy_part(document,actor,source,part.id,origin))
    return {'parts':[p for p,i in made]},[p for p,i in made],f'Import {len(made)} reference part(s)'


def customize(document, actor, args):
    part=document.components.get(args.get('part'))
    if not part or not part.reference_source:raise CadError('invalid_selection','Choose a reference part.')
    part_id,instance=copy_part(document,actor,document.model_copy(deep=True),part.id)
    return {'component_id':part_id,'instance_id':instance},[part_id,instance],'Create custom part from reference'


from functools import lru_cache


@lru_cache(maxsize=2)
def bundled_document(recipe):
    from .model import Actor
    from .recipes import build_recipe
    from .project_structure import normalize_structure
    if recipe not in {"plate", "mold"}:
        raise CadError("unknown_recipe", "Choose a bundled reference design.")
    document=Document(id="bundled_"+recipe,structure_version=1)
    build_recipe(document,Actor(kind="system"),recipe)
    normalize_structure(document,Actor(kind="system"))
    return document


def bundled_catalog():
    return [{"workspace":"builtin","workspace_name":"Included with RyanCAD","id":recipe,
             "name":bundled_document(recipe).name,"bundled":True,
             "parts":[{"id":c.id,"name":c.name} for c in bundled_document(recipe).components.values()
                      if c.structure_role=="part"]} for recipe in ("plate","mold")]


@lru_cache(maxsize=3)
def primitive_document(shape):
    from .model import Actor
    from .project_structure import structure_command,normalize_structure
    if shape not in {"box","sphere","cylinder"}:raise CadError("invalid_primitive","Choose Box, Sphere or Cylinder.")
    document=Document(id="primitive_"+shape)
    actor=Actor(kind="system")
    structure_command(document,actor,"structure.enable",{})
    values={"box":{"length":40,"width":30,"height":10},"sphere":{"diameter":20},"cylinder":{"diameter":10,"height":20}}[shape]
    made=structure_command(document,actor,"part.primitive",{"shape":shape,"values":values})[0]
    normalize_structure(document,actor)
    return document,made["component_id"]

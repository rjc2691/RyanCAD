"""Assembly-backed selection groups. Organization never moves existing geometry."""
import numpy as np
from .errors import CadError
from .parameters import evaluate
from .placements import flatten_instances,local_matrix,matrix_pose

def remap_references(document,mapping):
    """Occurrence paths change on reparenting; guarded geometry references must follow."""
    def path(value):
        for old,new in sorted(mapping.items(),key=lambda p:-len(p[0])):
            if value==old or value.startswith(old+'/'):return new+value[len(old):]
        return value
    def visit(value):
        if isinstance(value,dict):
            return {k:path(v) if isinstance(v,str) and (k=='occurrence' or k.endswith('_occurrence')) else visit(v) for k,v in value.items()}
        if isinstance(value,list):return [visit(v) for v in value]
        return value
    for f in document.features.values():
        f.references=visit(f.references)

def group_command(document,actor,name,args):
    from .commands import create_component,create_instance,parameter,require
    values=evaluate(document);rows={o['id']:o for o in flatten_instances(document,values)}
    def row(identifier):return require(rows,identifier,'placed component')
    def unique_parent(parent):
        if document.structure_version and document.components[parent].structure_role in {'part','group','layout'}:
            return  # membership belongs to the definition and updates every placement
        if parent!='root' and sum(o['definition']==parent for o in rows.values())!=1:
            raise CadError('shared_group_structure','This assembly has shared placement structure. Copy the group first to edit membership independently.')
    def members():
        ids=args.get('occurrences',[])
        if not isinstance(ids,list) or not 1<=len(ids)<=200 or any(not isinstance(i,str) for i in ids) or len(set(ids))!=len(ids):
            raise CadError('invalid_group','Choose 1–200 different components or groups.')
        selected=[row(i) for i in ids]
        if any(o.get('purpose')=='tool' for o in selected):raise CadError('tool_library','Tool bodies stay in the flat tool library, outside component groups.')
        if any(o['pattern_mode'] for o in selected):raise CadError('pattern_group','Make pattern members independent before changing their group membership.')
        if any(o['suppressed'] for o in selected):raise CadError('invalid_group','Choose unsuppressed components.')
        if len({o['id'].rsplit('/',1)[0] if '/' in o['id'] else '' for o in selected})!=1:
            raise CadError('invalid_group','Choose components at the same group level. Double-click a group to edit its contents.')
        unique_parent(selected[0]['parent'])
        return selected
    def rebase(instance,matrix,parent):
        # New parameters retain the old parameter identities for any other users.
        instance.placement={k:parameter(document,actor,parent,f'{instance.name} · {k.upper()}',v,'angle' if k.startswith('r') else 'length','Placement') for k,v in matrix_pose(matrix).items()}
        instance.parent=parent
    if name in {'group.insert','group.reparent'}:
        destination_id=args.get('parent','')
        destination=row(destination_id) if destination_id else None
        parent=destination['definition'] if destination else 'root'
        if destination and (destination['kind']!='assembly' or destination['pattern_mode'] or destination['suppressed']):
            raise CadError('invalid_group','Choose an unsuppressed, independent group or the design root.')
        unique_parent(parent)
        if name=='group.insert':
            kind=args.get('kind','assembly')
            if kind not in {'solid','assembly'}:raise CadError('invalid_kind','Create a component or a group.')
            base=str(args.get('name') or ('Group' if kind=='assembly' else 'Component')).strip()
            label=base;number=2;names={c.name for c in document.components.values()}
            while label in names:label=f'{base} {number}';number+=1
            definition,instance=create_component(document,actor,label,kind,parent)
            identifier=f'{destination_id}/{instance.id}' if destination_id else instance.id
            return {'component_id':definition.id,'instance_id':instance.id,'occurrence_id':identifier},[definition.id,instance.id],f'Create {label}'
        source=row(args.get('occurrence'))
        if source.get('purpose')=='tool':raise CadError('tool_library','Tool bodies stay in the flat tool library, outside component groups.')
        if source['pattern_mode'] or source['suppressed']:
            raise CadError('pattern_group','Choose an unsuppressed, independent component before reorganizing it.')
        unique_parent(source['parent'])
        prefix=source['id'].rsplit('/',1)[0] if '/' in source['id'] else ''
        if prefix==destination_id:raise CadError('unchanged_group','This component already belongs at this level.')
        if destination_id==source['id'] or destination_id.startswith(source['id']+'/'):
            raise CadError('ownership_cycle','A group cannot be placed inside itself or its descendants.')
        # A different placed copy can still share a definition with an ancestor.
        descendants={source['definition']}
        pending=[source['definition']]
        while pending:
            current=pending.pop()
            for child in document.instances.values():
                if child.parent==current and child.definition not in descendants:
                    descendants.add(child.definition);pending.append(child.definition)
        if parent in descendants:raise CadError('ownership_cycle','This move would create a shared assembly ownership cycle.')
        instance=document.instances[source['source_id']]
        parent_matrix=np.array(destination['matrix']) if destination else np.eye(4)
        new_id=f'{destination_id}/{instance.id}' if destination_id else instance.id
        rebase(instance,np.linalg.inv(parent_matrix)@np.array(source['matrix']),parent)
        mapping={source['id']:new_id};remap_references(document,mapping)
        return {'component_id':source['definition'],'instance_id':instance.id,'occurrence_id':new_id,
                'occurrence_map':mapping,'placement_rebased':True},[source['definition'],instance.id,parent],f'Move {document.components[source["definition"]].name} to {document.components[parent].name}'
    if name in {'group.create','group.add'}:
        selected=members();parent=selected[0]['parent'];prefix=selected[0]['id'].rsplit('/',1)[0] if '/' in selected[0]['id'] else ''
        rebased=False
        if name=='group.create':
            label=str(args.get('name','Component group')).strip()
            if not label:raise CadError('invalid_name','Give the group a name.')
            definition,instance=create_component(document,actor,label,'assembly',parent)
            if document.structure_version:
                definition.structure_role='group' if all(document.components[o['definition']].structure_role=='part' for o in selected) else 'part'
                from .project_structure import available_name
                if definition.structure_role=='part':
                    definition.structure_role='component'
                    definition.name=available_name(document,definition.name,'part')
                    definition.structure_role='part'
            # The wrapper takes the earliest selected sibling's browser position.
            selected_ids={o['source_id'] for o in selected};ordered={};inserted=False
            for identifier,placed in document.instances.items():
                if identifier==instance.id:continue
                if identifier in selected_ids and not inserted:
                    ordered[instance.id]=instance;inserted=True
                ordered[identifier]=placed
            document.instances=ordered
            group_id=f'{prefix}/{instance.id}' if prefix else instance.id
            inverse=np.eye(4)
        else:
            target=row(args.get('group'));definition=document.components[target['definition']]
            if definition.kind!='assembly':raise CadError('invalid_group','Choose a group to receive the components.')
            if target['parent']!=parent or (target['id'].rsplit('/',1)[0] if '/' in target['id'] else '')!=prefix or target['id'] in [s['id'] for s in selected]:
                raise CadError('invalid_group','Choose a sibling group outside the selected members.')
            unique_parent(definition.id)
            instance=document.instances[target['source_id']];group_id=target['id'];inverse=np.linalg.inv(local_matrix(instance,values));rebased=not np.allclose(inverse,np.eye(4),atol=1e-12)
        mapping={}
        for o in selected:
            child=document.instances[o['source_id']]
            if rebased:rebase(child,inverse@local_matrix(child,values),definition.id)
            else:child.parent=definition.id
            mapping[o['id']]=group_id+'/'+child.id
        remap_references(document,mapping)
        return {'component_id':definition.id,'instance_id':instance.id,'occurrence_id':group_id,'occurrence_map':mapping,'placement_rebased':rebased},[definition.id,instance.id,*[o['source_id'] for o in selected]],f"{'Group' if name=='group.create' else 'Add to group'} · {definition.name}"
    target=row(args.get('occurrence'));definition=document.components[target['definition']]
    if definition.kind!='assembly':raise CadError('invalid_group','Choose a component group.')
    if target['pattern_mode']:raise CadError('pattern_group','Patterned assemblies cannot be edited as independent groups.')
    instance=document.instances[target['source_id']]
    if name=='group.copy':
        if document.structure_version and definition.structure_role=='part':
            pose=matrix_pose(local_matrix(instance,values))
            offset=args.get('offset',[30,0,0])
            if not isinstance(offset,list) or len(offset)!=3 or any(type(v) not in (int,float) or not np.isfinite(v) or abs(v)>10000 for v in offset):
                raise CadError('invalid_group','Copy offset needs three finite distances.')
            for k,v in zip('xyz',offset):pose[k]+=v
            new=create_instance(document,actor,definition.id,parent=instance.parent,placement=pose)
            new.variation=instance.variation
            return {'instance_id':new.id},[new.id],f'Repeat linked part · {definition.name}'
        def clone(source,parent,label=None,top=False):
            original=document.components[source.definition]
            if original.kind=='assembly':
                new_def,new=create_component(document,actor,label or original.name+' copy','assembly',parent,original.color)
                new_def.structure_role=original.structure_role
                for child in list(document.instances.values()):
                    if child.parent==original.id:clone(child,new_def.id,child.name)
            else:new=create_instance(document,actor,original.id,label or source.name,parent)
            new.placement={k:parameter(document,actor,parent,document.parameters[p].name,values[p],document.parameters[p].kind,'Placement') for k,p in source.placement.items()}
            new.visible,new.suppressed=source.visible,source.suppressed
            new.pattern_mode,new.pattern_axis=source.pattern_mode,source.pattern_axis
            new.omitted_indices=list(source.omitted_indices)
            new.pattern={k:parameter(document,actor,parent,document.parameters[p].name,values[p],document.parameters[p].kind,'Component patterns') for k,p in source.pattern.items()}
            if top:
                pose=matrix_pose(local_matrix(source,values));offset=args.get('offset',[30,0,0])
                if not isinstance(offset,list) or len(offset)!=3 or any(type(v) not in (int,float) or not np.isfinite(v) or abs(v)>10000 for v in offset):raise CadError('invalid_group','Copy offset needs three finite millimetre distances.')
                for k,v in zip('xyz',offset):pose[k]+=v
                new.placement={k:parameter(document,actor,parent,f'{new.name} · {k.upper()}',v,'angle' if k.startswith('r') else 'length','Placement') for k,v in pose.items()}
            return new
        new=clone(instance,instance.parent,args.get('name',definition.name+' copy'),True)
        prefix=target['id'].rsplit('/',1)[0] if '/' in target['id'] else ''
        return {'component_id':new.definition,'instance_id':new.id,'occurrence_id':f'{prefix}/{new.id}' if prefix else new.id},[new.definition,new.id],f'Copy group · {definition.name}'
    if name=='group.ungroup':
        unique_parent(definition.id);unique_parent(instance.parent)
        prefix=target['id'].rsplit('/',1)[0] if '/' in target['id'] else '';mapping={}
        for child in list(document.instances.values()):
            if child.parent!=definition.id:continue
            rebase(child,local_matrix(instance,values)@local_matrix(child,values),instance.parent)
            mapping[target['id']+'/'+child.id]=f'{prefix}/{child.id}' if prefix else child.id
        del document.instances[instance.id]
        remap_references(document,mapping)
        # Retain the unplaced definition/parameters so external parameter users
        # keep their identities. It is no longer an occurrence or physical part.
        return {'occurrence_map':mapping},[definition.id,*mapping.values()],f'Ungroup · {definition.name}'
    raise CadError('unsupported_operation','Unknown group operation.')

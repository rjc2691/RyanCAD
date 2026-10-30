from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import copy
from contextlib import nullcontext
import hashlib
import json
import math
from pathlib import Path
import re
import threading
import time

import numpy as np

from .commands import COMMANDS, create_component, reduce
from .errors import CadError
from .model import Action, Actor, Command, Document, now, uid
from .parameters import evaluate, graph
from .storage import ProjectStore
from .worker import GeometryWorker


from .placements import local_matrix, flatten_instances, pattern_delta
from .project_structure import public_document, part_parameters


def validate_document(document):
    from .project_structure import validate_structure
    validate_structure(document)
    if "root" not in document.components or document.components["root"].kind != "assembly":
        raise CadError("invalid_document", "A document requires a root assembly.")
    if set(document.feature_order) != set(document.features) or len(document.feature_order) != len(document.features):
        raise CadError("invalid_history", "Feature history must contain each feature exactly once.")
    for identifier, feature in document.features.items():
        if feature.id != identifier or feature.owner not in document.components or identifier not in document.components[feature.owner].feature_ids:
            raise CadError("invalid_owner", "A feature has inconsistent component ownership.", feature=identifier)
        for p in feature.parameters.values():
            if p not in document.parameters:
                raise CadError("missing_parameter", "A feature refers to a missing parameter.", feature=identifier, parameter=p)
    for identifier, parameter in document.parameters.items():
        if identifier != parameter.id or parameter.owner not in document.components:
            raise CadError("invalid_owner", "A parameter has inconsistent component ownership.", parameter=identifier)
    for identifier, component in document.components.items():
        if component.id != identifier:
            raise CadError("invalid_identity", "A component ID does not match its document key.")
        if component.stock_thickness and (component.stock_thickness not in document.parameters or document.parameters[component.stock_thickness].kind != "length"):
            raise CadError("missing_parameter", "Stock thickness must refer to a length parameter.", component=identifier)
        if len(set(component.feature_ids)) != len(component.feature_ids) or any(f not in document.features or document.features[f].owner != component.id for f in component.feature_ids):
            raise CadError("invalid_owner", "Component features must be unique and consistently owned.", component=component.id)
    for identifier, instance in document.instances.items():
        if identifier != instance.id:
            raise CadError("invalid_identity", "An instance ID does not match its document key.")
        if instance.parent not in document.components or document.components[instance.parent].kind != "assembly":
            raise CadError("invalid_owner", "Every instance must belong to an assembly.")
        definition=document.components.get(instance.definition)
        if definition and definition.purpose=="tool":
            if definition.kind!="solid" or instance.parent!="root" or instance.pattern_mode or sum(i.definition==instance.definition for i in document.instances.values())!=1:
                raise CadError("tool_library","A tool body has one private local workbench. Reuse it through Tool Profile references instead of placing or grouping copies.")
        if any(p not in document.parameters for p in list(instance.placement.values()) + list(instance.pattern.values())):
            raise CadError("missing_parameter", "An instance placement refers to a missing parameter.")
    visited, visiting = set(), set()
    def check_assembly(identifier):
        if identifier in visiting:
            raise CadError("ownership_cycle", "An assembly cannot contain itself or one of its ancestors.")
        if identifier in visited:
            return
        visiting.add(identifier)
        for instance in document.instances.values():
            if instance.parent == identifier:
                if instance.definition not in document.components:
                    raise CadError("missing_component", "An instance refers to a missing definition.")
                if document.components[instance.definition].kind == "assembly":
                    check_assembly(instance.definition)
        visiting.remove(identifier)
        visited.add(identifier)
    for identifier, component in document.components.items():
        if component.kind == "assembly":
            check_assembly(identifier)
    for fit in document.fits.values():
        if fit.pin_parameter not in document.parameters or fit.socket_parameter not in document.parameters:
            raise CadError("missing_parameter", "A fit refers to a missing parameter.")
    values = evaluate(document)
    for component in document.components.values():
        if component.stock_thickness and values[component.stock_thickness] <= 1e-5:
            raise CadError("invalid_dimension", "Stock thickness must be positive.", component=component.id)
    flatten_instances(document, values)
    return values


class CadService:
    def __init__(self, directory: Path):
        self.design_name_guard = None
        self.design_name_lock = None
        self.store = ProjectStore(directory)
        self.document = self.store.load()
        validate_document(self.document)
        self.geometry = GeometryWorker()
        self.evaluation = {"components": {}, "timings": {}, "sketches": {}, "values": evaluate(self.document)}
        self.write_lock = threading.RLock()
        self.state_lock = threading.RLock()
        self.jobs = {}
        self.requests = {}
        self.events = []
        self.sequence = 0
        self.pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ryancad-job")
        self.agent_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ryancad-agent")
        self.agents = {}
        self.previews = {}
        self.current_actor = None
        self.closed = False
        self.history_cache = {}

    def event(self, kind, **data):
        with self.state_lock:
            self.sequence += 1
            self.events.append({"sequence": self.sequence, "type": kind, "timestamp": now(), **data})
            self.events = self.events[-1000:]

    def register_agent(self, name):
        actor = Actor(id=uid("agent"), name=str(name)[:100] or "External agent", kind="agent", identity_source="local_bearer_session; client-supplied display name")
        self.agents[actor.id] = {"actor": actor, "connected": True, "paused": False, "revoked": False, "step_mode": False, "credits": 0, "connected_at": now()}
        self.event("agent_connected", actor=actor.model_dump())
        return actor

    def agent_control(self, identifier, operation):
        if identifier not in self.agents:
            raise CadError("missing_agent", "The agent session no longer exists.")
        agent = self.agents[identifier]
        if operation == "pause":
            agent["paused"] = True
        elif operation == "resume":
            agent.update(paused=False, step_mode=False)
        elif operation == "step_mode":
            agent.update(paused=False, step_mode=True, credits=0)
        elif operation == "step":
            agent.update(paused=False, step_mode=True, credits=agent["credits"] + 1)
        elif operation == "revoke":
            agent["revoked"] = True
        else:
            raise CadError("invalid_control", "Choose pause, resume, step_mode, step or revoke.")
        if operation in {"pause", "revoke"} and self.current_actor == identifier:
            self.geometry.cancel()
        self.event("agent_control", actor_id=identifier, operation=operation)
        return {"ok": True}

    def _permission(self, actor, wait=False, job_id=None):
        if self.closed:
            raise CadError("session_closed", "The local document session is closing.")
        if actor.kind != "agent":
            return
        if actor.id not in self.agents or self.agents[actor.id]["revoked"] or not self.agents[actor.id]["connected"]:
            raise CadError("agent_revoked", "This agent's write capability has been revoked.")
        agent = self.agents[actor.id]
        if agent["paused"]:
            raise CadError("agent_paused", "The user paused this agent. Resume before making another edit.")
        if agent["step_mode"]:
            if not wait:
                return
            while agent["step_mode"] and agent["credits"] <= 0:
                if self.closed or agent["revoked"] or agent["paused"]:
                    raise CadError("agent_paused", "The agent was stopped before its next action.")
                if job_id and self.jobs[job_id]["status"] == "cancelled":
                    raise CadError("cancelled", "The pending agent action was cancelled.")
                time.sleep(.05)
            if agent["step_mode"]:
                agent["credits"] -= 1

    def submit(self, operation, actor=None, **payload):
        if self.closed:
            raise CadError("session_closed", "The local document session is closing.")
        if len(self.jobs) > 500:
            completed = [identifier for identifier, job in self.jobs.items() if job["status"] in {"complete", "failed", "cancelled"}]
            for identifier in completed[:-250]:
                self.jobs.pop(identifier, None)
            self.requests = {request: identifier for request, identifier in self.requests.items() if identifier in self.jobs}
        actor = actor or Actor()
        if len([j for j in self.jobs.values() if j["status"] in {"queued", "running", "waiting"}]) >= 16:
            raise CadError("queue_full", "The operation queue is full. Wait or cancel pending work.")
        if operation in {"command", "preview", "sketch_preview"}:
            command = Command.model_validate(payload["command"])
            signature = hashlib.sha256(json.dumps({"name": command.name, "args": command.args}, sort_keys=True).encode()).hexdigest()
            prior = self.store.request(command.request_id, signature)
            if prior:
                return {"status": "complete", "result": prior}
            if command.request_id in self.requests:
                job = self.jobs[self.requests[command.request_id]]
                if job.get("signature") != signature:
                    raise CadError("idempotency_conflict", "This request ID identifies a different pending operation.")
                return {"job_id": job["id"], "status": job["status"]}
            payload.update(command=command, signature=signature)
        job = {"id": uid("job"), "operation": operation, "actor": actor.model_dump(), "status": "queued", "started_at": now(), "result": None, "error": None}
        if "command" in payload:
            job["description"] = payload["command"].name
            job["signature"] = payload["signature"]
            self.requests[payload["command"].request_id] = job["id"]
        self.jobs[job["id"]] = job
        self.event("job_queued", job_id=job["id"], actor=actor.model_dump(), operation=operation)
        (self.agent_pool if actor.kind == "agent" else self.pool).submit(self._run_job, job, actor, payload)
        return {"job_id": job["id"], "status": "queued"}

    def _run_job(self, job, actor, payload):
        job["thread_id"] = threading.get_ident()
        try:
            if job["operation"] in {"command", "commit_preview"}:
                if actor.kind == "agent" and self.agents.get(actor.id, {}).get("step_mode"):
                    job["status"] = "waiting"
                self._permission(actor, wait=True, job_id=job["id"])
            if job["status"] == "cancelled":
                raise CadError("cancelled", "This queued job was cancelled.")
            job["status"] = "running"
            self.event("job_started", job_id=job["id"], actor=actor.model_dump())
            operation = job["operation"]
            if operation in {"command", "preview", "commit_preview"}:
                job["result"] = self._command(actor, preview=operation == "preview", preview_token=payload.get("token"), job_id=job["id"], **{k: v for k, v in payload.items() if k != "token"})
            elif operation == "sketch_preview":
                command = payload["command"]
                if command.name not in {"sketch.create", "sketch.update"}:
                    raise CadError("invalid_request", "A sketch preview requires sketch.create or sketch.update.")
                with self.write_lock:
                    self._permission(actor)
                    if job["status"] == "cancelled":
                        raise CadError("cancelled", "This sketch preview was cancelled.")
                    if command.expected_revision != self.document.revision:
                        raise CadError("stale_revision", "The design changed since this sketch was prepared. Reopen it and try again.", expected=command.expected_revision, current=self.document.revision)
                    candidate = self.document.model_copy(deep=True)
                    result, _, _ = reduce(candidate, actor, command.name, command.args)
                    validate_document(candidate)
                    solved = self.geometry.call("solve_sketch_preview", payload=candidate.model_dump(mode="json"), feature_id=result["feature_id"])
                    feature = candidate.features[result["feature_id"]]
                    constraint_values = [solved["parameter_values"].get(feature.parameters.get(c.get("parameter_key", ""))) for c in feature.options["constraints"]]
                    job["result"] = {"base_revision": self.document.revision, "feature_id": result["feature_id"], "constraint_values": constraint_values, **solved}
            elif operation == "rebuild":
                with self.write_lock:
                    self.evaluation = self.geometry.call("evaluate", payload=self.document.model_dump(mode="json"))
                    job["result"] = {"revision": self.document.revision}
            elif operation == "history":
                with self.write_lock:
                    feature_id = payload["feature_id"]
                    if feature_id != "origin" and feature_id not in self.document.features:
                        raise CadError("missing_feature", "This history feature no longer exists.")
                    key = f"{self.document.revision}:{feature_id}"
                    data = self.history_cache.get(key)
                    if data is None:
                        data = self.geometry.call("evaluate", payload=self.document.model_dump(mode="json"), rollback=feature_id)
                        self.history_cache[key] = data
                        if len(self.history_cache) > 12:
                            self.history_cache.pop(next(iter(self.history_cache)))
                    job["result"] = {"history_key": key, "revision": self.document.revision, "components": self._public_geometry(data)}
            elif operation == "measure":
                with self.write_lock:
                    state = self.state()
                    choices = {i["id"]: i for i in state["occurrences"]}
                    if payload["first"] not in choices or payload["second"] not in choices:
                        raise CadError("missing_instance", "Select two physical component instances.")
                    a, b = choices[payload["first"]], choices[payload["second"]]
                    job["result"] = {**self.geometry.call("measure", payload=self.document.model_dump(mode="json"), first=a["definition"], second=b["definition"], matrices=[a["matrix"], b["matrix"]]), "revision": self.document.revision}
            elif operation == "export":
                self._permission(actor)
                job["result"] = self._export(payload)
            else:
                raise CadError("unknown_operation", f"Unsupported job {operation}.")
            job["status"] = "complete"
            self.event("job_complete", job_id=job["id"], revision=self.document.revision, result=job["result"])
        except CadError as exc:
            job["status"] = "cancelled" if exc.code == "cancelled" else "failed"
            job["error"] = exc.payload()
            self.event("job_failed", job_id=job["id"], actor=actor.model_dump(), error=exc.payload())
        except (KeyError, TypeError, ValueError) as exc:
            job["status"] = "failed"
            job["error"] = {"code": "invalid_arguments", "message": "The operation has missing or incompatible arguments.", "details": {"reason": str(exc)[:500]}}
            self.event("job_failed", job_id=job["id"], error=job["error"])
        except Exception as exc:
            job["status"] = "failed"
            job["error"] = {"code": "internal_error", "message": str(exc), "details": {}}
            self.event("job_failed", job_id=job["id"], error=job["error"])
        finally:
            job["finished_at"] = now()
            if job["status"] != "complete" or job["operation"] in {"preview", "sketch_preview"}:
                command = payload.get("command")
                if command:
                    self.requests.pop(command.request_id, None)

    def _command(self, actor, command=None, signature=None, preview=False, preview_token=None, job_id=None):
        started = time.perf_counter()
        with self.write_lock:
            if job_id and self.jobs[job_id]["status"] == "cancelled":
                raise CadError("cancelled", "This operation was cancelled before evaluation.")
            if preview_token:
                proposed = self.previews.get(preview_token)
                if not proposed or time.monotonic() - proposed["created"] > 900:
                    raise CadError("expired_preview", "This preview expired; create it again.")
                if proposed["actor_id"] != actor.id:
                    raise CadError("preview_owner", "Only the originating session can commit this preview.")
                command, signature = proposed["command"], proposed["signature"]
            self._permission(actor)
            duplicate = self.store.request(command.request_id, signature)
            if duplicate:
                return duplicate
            if command.expected_revision != self.document.revision:
                raise CadError("stale_revision", "The design changed since this operation was prepared. Read the current revision and try again.", expected=command.expected_revision, current=self.document.revision)
            candidate = self.document.model_copy(deep=True)
            # Freeze legacy construction aids at the saved placement BEFORE a
            # move, source edit or deletion can change the frame they resolve in.
            from .reference_snapshots import detach_references
            if any(f.type in {"operation", "boolean", "mirror", "extrude", "revolve"} and not f.options.get("reference_snapshot") for f in candidate.features.values()):
                baseline = self.geometry.call("evaluate", payload=self.document.model_dump(mode="json"))
                detach_references(candidate, baseline)
            undo, redo = self.store.stacks()
            checkpoint = None
            if preview_token:
                candidate = proposed["candidate"].model_copy(deep=True)
                result, affected, description = copy.deepcopy(proposed["result"]), list(proposed["affected"]), proposed["description"]
                undo, redo, checkpoint = list(proposed["undo"]), list(proposed["redo"]), proposed["checkpoint"]
            elif command.name in {"history.undo", "history.redo"}:
                stack, other = (undo, redo) if command.name == "history.undo" else (redo, undo)
                if not stack:
                    raise CadError("empty_history", "There is nothing to undo." if command.name == "history.undo" else "There is nothing to redo.")
                target = stack.pop()
                other.append(self.document.revision)
                candidate = self.store.load(target)
                result, affected, description = {}, list(candidate.features), "Undo transaction" if command.name == "history.undo" else "Redo transaction"
            elif command.name == "checkpoint.restore":
                candidate = self.store.load(self.store.checkpoint_revision(command.args["name"]))
                undo.append(self.document.revision)
                redo = []
                result, affected, description = {}, list(candidate.features), f"Restore checkpoint · {command.args['name']}"
            elif command.name == "checkpoint.create":
                checkpoint = str(command.args["name"]).strip()[:120]
                if not checkpoint:
                    raise CadError("invalid_name", "Give the checkpoint a name.")
                result, affected, description = {}, [], f"Checkpoint · {checkpoint}"
            elif command.name == "document.replace":
                candidate = Document.model_validate(command.args["document"])
                undo.append(self.document.revision)
                redo = []
                result, affected, description = {}, list(candidate.features), f"Open native design · {candidate.name}"
            else:
                from .simple_values import simplify_values
                simplify_values(candidate)
                result, affected, description = reduce(candidate, actor, command.name, command.args)
                undo.append(self.document.revision)
                redo = []
            from .simple_values import simplify_values
            simplify_values(candidate)
            from .project_structure import normalize_structure
            normalize_structure(candidate, actor)
            validate_document(candidate)
            from .parameters import dependencies
            changed_parameters = {identifier for identifier, p in candidate.parameters.items() if identifier in self.document.parameters and
                                  (p.expression != self.document.parameters[identifier].expression or p.tolerance != self.document.parameters[identifier].tolerance)}
            while True:
                expanded = changed_parameters | {p.id for p in candidate.parameters.values() if dependencies(p.expression) & changed_parameters}
                if expanded == changed_parameters:
                    break
                changed_parameters = expanded
            for feature in candidate.features.values():
                if changed_parameters & set(feature.parameters.values()):
                    feature.modified_by = actor.id
                    candidate.components[feature.owner].modified_by = actor.id
                    affected += [feature.id, feature.owner]
            affected = list(dict.fromkeys(affected))
            candidate.actors[actor.id] = actor
            self.current_actor = actor.id
            generation = self.geometry.generation
            try:
                try:
                    evaluated = proposed["evaluation"] if preview_token else self.geometry.call("evaluate", payload=candidate.model_dump(mode="json"))
                except CadError as exc:
                    # Only initial creation can choose new ownership. Regeneration never
                    # silently changes the physical part count of an existing feature.
                    constructor=command.name=="feature.create" and command.args.get("type") in {"box","cylinder","extrude"} and command.args.get("options",{}).get("operation","add")=="add"
                    auto_add=command.args.get("result")=="auto" and (exc.details.get("auto_decision") or {}).get("mode")=="add"
                    unified=command.name=="operation.create" and (command.args.get("result")=="add" or auto_add) and command.args.get("profile") not in {"body","fillet","chamfer"}
                    if exc.code != "separate_components_required" or not (constructor or unified):
                        raise
                    feature = candidate.features[result["feature_id"]]
                    previous = candidate.components[feature.owner]
                    component, instance = create_component(candidate, actor, command.args.get("component_name", feature.name + " part"))
                    previous.feature_ids.remove(feature.id)
                    component.feature_ids.append(feature.id)
                    feature.owner = component.id
                    feature.options["operation"] = "new"
                    if unified:
                        feature.options["result"]="new";feature.references["target_occurrence"]=None
                        previous.kind=self.document.components[previous.id].kind
                    for identifier in feature.parameters.values():
                        if identifier not in self.document.parameters:
                            candidate.parameters[identifier].owner = component.id
                    result.update(component_id=component.id, instance_id=instance.id,
                                  ownership_change={"reason": "disconnected_addition", "from": previous.id, "to": component.id})
                    affected += [component.id, instance.id]
                    description = f"Create separate component · {component.name}"
                    normalize_structure(candidate, actor)
                    validate_document(candidate)
                    evaluated = self.geometry.call("evaluate", payload=candidate.model_dump(mode="json"))
            finally:
                self.current_actor = None
            if generation != self.geometry.generation or (job_id and self.jobs[job_id]["status"] == "cancelled"):
                raise CadError("cancelled", "The operation was cancelled before commit.")
            decision=evaluated.get("operation_decisions",{}).get(result.get("feature_id"))
            for identifier,choice in evaluated.get("operation_decisions",{}).items():
                feature=candidate.features[identifier]
                if feature.options.get("result")=="auto":
                    feature.options["result"]=choice["mode"]
                    feature.options["auto_selection"]=choice
            for identifier, binding in evaluated.get("bindings", {}).items():
                candidate.features[identifier].options["selector"] = binding
            detach_references(candidate, evaluated)
            candidate.revision = self.document.revision + 1
            candidate.modified_at = now()
            if preview:
                token = uid("preview")
                self.previews[token] = {"created": time.monotonic(), "command": command, "signature": signature, "actor_id": actor.id, "evaluation": evaluated,
                                        "candidate": candidate, "result": result, "affected": affected, "description": description,
                                        "undo": undo, "redo": redo, "checkpoint": checkpoint}
                self.previews = dict(list(self.previews.items())[-20:])
                return {"preview_token": token, "base_revision": self.document.revision, "description": description,
                        "changes": result, "affected": affected, "components": self._public_geometry(evaluated),
                        "parameter_values": evaluated["values"], "feature_values": {field:evaluated["values"][p] for field,p in candidate.features[result["feature_id"]].parameters.items()} if result.get("feature_id") else {}, "occurrences": flatten_instances(candidate, evaluated["values"]), "operation_decision":decision, "operation_display":evaluated.get("operation_displays",{}).get(result.get("feature_id")), "preview_elapsed_ms":(time.perf_counter()-started)*1000,"validation": "passed", "committed": False}
            self._permission(actor)
            action = Action(revision=candidate.revision, actor=actor, command=command.name, description=description,
                            affected=affected, group_id=command.group_id, duration_ms=(time.perf_counter() - started) * 1000,
                            steps=[{"command": entry["name"], "description": label, "arguments": entry.get("args", {})}
                                   for entry, label in zip(command.args.get("commands", []), result.get("descriptions", []))] if command.name == "batch" else [])
            result = {**result, "revision": candidate.revision, "document_id": candidate.id, "description": description,
                      "affected": affected, "saved": True, "action_id": action.id}
            with self.design_name_lock if self.design_name_lock is not None else nullcontext():
                if self.design_name_guard and (candidate.name != self.document.name or command.name == "document.rename"):
                    candidate.name = self.design_name_guard(candidate.name)
                self.store.commit(candidate, action, command.request_id, signature, result, undo, redo, checkpoint)
                with self.state_lock:
                    self.document, self.evaluation = candidate, evaluated
            self.history_cache.clear()
            if preview_token:
                self.previews.pop(preview_token, None)
            self.event("document_changed", revision=candidate.revision, actor=actor.model_dump(), action=action.model_dump(mode="json"))
            return result

    @staticmethod
    def _public_geometry(evaluation):
        return {identifier: {k: v for k, v in data.items() if k != "mesh"} for identifier, data in evaluation["components"].items()}

    def state(self):
        # State is copied under the short state lock; native evaluation never holds it.
        with self.state_lock:
            document, evaluation = self.document, self.evaluation
            values = evaluation.get("values", {})
            if set(values) != set(document.parameters):
                values = evaluate(document)
            occurrences = flatten_instances(document, values)
            parameter_graph = graph(document, values)
            physical = [i for i in occurrences if i["kind"] != "assembly" and i.get("purpose")!="tool" and not i["suppressed"] and (not document.structure_version or i.get("layout") == document.active_layout)]
            summary = {"instances": len(physical), "definitions": len({i["definition"] for i in physical}),
                       "volume_mm3": sum(evaluation["components"].get(i["definition"], {}).get("volume") or 0 for i in physical),
                       "area_mm2": sum(evaluation["components"].get(i["definition"], {}).get("area") or 0 for i in physical)}
            undo, redo = self.store.stacks()
            return {"document": public_document(document), "geometry": self._public_geometry(evaluation),
                    "parameter_graph": parameter_graph["parameters"], "fits": parameter_graph["fits"], "occurrences": occurrences,
                    "summary": summary, "timings": evaluation.get("timings", {}), "sketches": evaluation.get("sketches", {}), "profiles": evaluation.get("profiles", {}),
                    "operation_displays": evaluation.get("operation_displays", {}),
                    "part_parameters": {c.id: part_parameters(document, c.id) for c in document.components.values() if c.structure_role == "part"},
                    "actions": self.store.actions(), "checkpoints": self.store.checkpoints(), "can_undo": bool(undo), "can_redo": bool(redo),
                    "save_status": "snapshot_warning" if (self.store.error or self.store.snapshot_error) else "saved", "save_error": self.store.error or self.store.snapshot_error,
                    "worker_status": self.geometry.status, "sequence": self.sequence,
                    "agents": [{**{k: v for k, v in a.items() if k != "actor"}, "actor": a["actor"].model_dump()} for a in self.agents.values()],
                    "jobs": [{k: v for k, v in j.items() if k not in {"signature", "result"}} for j in list(self.jobs.values())[-30:]]}

    def _export(self, payload):
        with self.write_lock:
            if payload.get("frame", "part") not in {"part", "assembly"}:
                raise CadError("invalid_frame", "Export coordinates use the local part frame or the assembled frame.")
            if payload.get("expected_revision") != self.document.revision:
                raise CadError("stale_revision", "Refresh the design before exporting the current revision.")
            document = self.document.model_dump(mode="json")
            occurrences = [i for i in flatten_instances(self.document, evaluate(self.document)) if i["kind"] != "assembly" and i.get("purpose")!="tool" and not i["suppressed"] and (not self.document.structure_version or i.get("layout") == self.document.active_layout)]
            wanted = payload["instance_ids"] if payload.get("instance_ids") is not None else [i["id"] for i in occurrences]
            selected = [i for i in occurrences if i["id"] in wanted]
            if len(selected) != len(set(wanted)) or not selected:
                raise CadError("invalid_selection", "Select one or more current manufactured instances.")
            export_id = uid("export")
            root = self.store.directory / "exports"
            root.mkdir(exist_ok=True)
            destination = root / export_id
            selections = []
            for index, instance in enumerate(selected):
                label = re.sub(r"[^\w .-]", "_", self.document.components[instance.get("source_definition", instance["definition"])].name, flags=re.UNICODE).strip(" .")[:70] or "part"
                selections.append({"definition": instance["definition"], "instance_id": instance["id"], "filename": f"{index + 1:02d}_{label}.stl",
                                   "frame": payload.get("frame", "part"), "matrix": instance["matrix"] if payload.get("frame") == "assembly" else None})
            receipt = self.geometry.call("export", payload=document, selections=selections, destination=str(destination),
                                         tolerance=float(payload.get("tolerance", .03)), angular=float(payload.get("angular", .1)))
            self.store.snapshot()
            return {"export_id": export_id, "receipt": receipt, "files": [s["filename"] for s in selections]}

    def mesh(self, component_id, history_key=None, preview_token=None):
        data = self.history_cache.get(history_key) if history_key else self.previews.get(preview_token, {}).get("evaluation") if preview_token else self.evaluation
        if data is None or component_id not in data["components"] or not data["components"][component_id].get("mesh"):
            raise CadError("missing_geometry", "This component has no current display geometry.")
        return data["components"][component_id]["mesh"]

    def cancel(self, identifier=None):
        if identifier and identifier in self.jobs:
            job = self.jobs[identifier]
            if job["status"] in {"complete", "failed", "cancelled"}:
                return {"ok": True, "already_finished": True}
            job["status"] = "cancelled"
            if job.get("thread_id") == self.geometry.owner_thread:
                self.geometry.cancel()
        elif identifier:
            raise CadError("missing_job", "The selected job no longer exists.")
        else:
            self.geometry.cancel()
        self.event("cancel_requested", job_id=identifier)
        return {"ok": True}

    def close(self):
        self.closed = True
        self.geometry.close()
        self.agent_pool.shutdown(wait=True, cancel_futures=True)
        self.pool.shutdown(wait=True, cancel_futures=True)
        self.store.close()

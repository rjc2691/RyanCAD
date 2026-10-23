# Engine, document and external-agent contracts

## Ownership of a live design

`CadService` owns one `ProjectStore` and `Document`, a serialized mutation boundary, an event sequence and an isolated persistent native worker. UI and MCP clients submit the same reducer commands. The reducer edits an isolated candidate; schema/ownership/parameter validation, geometry validation and durable commit must succeed before publication. Native objects and meshes are derived caches, absent from the editable YAML schema.

Code boundaries:

| Module | Responsibility |
|---|---|
| `model.py` | Pydantic document, actor, parameter, component/instance, feature, command and action schemas. |
| `parameters.py` | Restricted typed expression AST, stable binding, cycle detection, graph and fit intervals. |
| `commands.py` | Semantic intent edits on candidates; no HTTP or rendering dependency. |
| `sketches.py` | Native PlaneGCS entities, constraints, solution diagnostics and exact input ownership. |
| `geometry.py`, `meshcheck.py` | OCCT construction, stable-selection guards, tessellation, measurement, validation and STL writing. |
| `worker.py` | Supervised spawned process, cancellation/generation protection and restart. |
| `storage.py`, `projects.py` | Durable revisions, readable snapshots, safe archive restore and single-writer protection. |
| `service.py` | Transactions, previews, revisions, authorship, jobs, agent permissions and quantities. |
| `api.py` | Local HTTP adapter and bundled client delivery. |
| `mcp_server.py` | Official MCP stdio adapter to the running service. |

Changing the UI does not change the native document or reducer. Changing the construction helper must preserve the engine contracts and geometric acceptance fixtures. Format adapters can follow this boundary; they must state retained/lost semantics. A mesh format is not the editable parametric authority.

## Revisioned commands

All successful mutations return a durable revision and authored action. Submit to `POST /api/commands`:

```json
{
  "name": "feature.create",
  "args": {
    "type": "box",
    "component_name": "Bracket",
    "values": {"length": "80 mm", "width": "40 mm", "height": "6 mm"}
  },
  "expected_revision": 0,
  "request_id": "client-generated-unique-id"
}
```

The response is normally `{job_id, status:"queued"}`. Poll `/api/jobs/ID` until complete/failed/cancelled. `result.saved=true` is emitted only after journal durability. Request IDs identify a semantic command and its arguments; retrying a completed identical request returns its result even if the current revision advanced. Reusing an ID with different intent fails. A stale revision fails without overwriting newer work. Operations are serialized, not parallel mutations to separate in-memory models.

Lengths accept explicit units, arithmetic and named references. Native expressions bind names to stable IDs. `{ "parameter": "p_..." }` explicitly reuses a typed input; a numeric/string input creates a distinct named parameter even if its value is equal to another. Canonical units are mm/deg. Counts must be integral and bounded. Expressions never execute Python; AST calls/operators are whitelisted. Local names resolve first; ambiguous names require `[Owner::Name]` or a stable ID.

## Commands

`GET /api/capabilities` is the runtime capability source, including feature fields and numerical bounds. Unsupported commands fail explicitly. The main argument shapes are:

| Command | Arguments |
|---|---|
| `component.create` | `name`, `kind: solid/planar/assembly`, optional `parent`, `placement`, `color`. |
| `component.duplicate` | definition `id`, optional `placement`, `parent`, `name`; always linked. |
| `component.independent` | `instance_id`, optional `pattern_index`, `name`. |
| `component.pattern` | `instance_id`, `mode: linear/circular`, `axis`, `count`, `spacing`, `angle`. Circular rotation is about owning assembly origin. |
| `component.rename`, `.delete` | `id`; rename accepts `name`, optional `color`. Delete protects dependencies. |
| `component.stock` | planar component `id`, `value`, `preview`; metadata and display-only extrusion. |
| `instance.transform` | `id`, any of `x/y/z/rx/ry/rz`; numeric input or explicit parameter reuse. |
| `instance.reparent` | `id`, assembly `parent`; preserves local transform. |
| `instance.visibility`, `.suppress` | `id`, `visible` / `suppressed`. |
| `parameter.create` | `name`, `value`, optional `kind`, `owner`, `category`. |
| `parameter.set` | `id`, optional `value`, `tolerance:{minus,plus}` or null, `category`, `description`, `favorite`. |
| `parameter.rename`, `.promote` | `id`, `name` / optional shared `category`. |
| `parameter.link` | `feature_id`, `field`, `parameter_id`. |
| `parameter.independent` | `feature_id`, `field`, optional `name`. |
| `parameter.offset` | `id`, `delta`; preserves a derived formula by appending a named offset. |
| `parameter.delete` | unused `id`. |
| `feature.create` | `type`, optional `owner`, `component_name`, `name`, `values`, `options`, `references`. Omit owner for a new part. |
| `feature.suppress`, `.rename`, `.repair` | feature `id` and `suppressed`, `name` or explicit replacement `selector`. |
| `fit.create` | `name`, `pin_parameter`, `socket_parameter`, `convention: diametral/radial`. |
| `history.undo`, `.redo` | no extra arguments; preserves audit events. |
| `checkpoint.create`, `.restore` | `name`. |
| `document.rename`, `.units` | `name` / `units: mm/in`. |
| `recipe.load` | `recipe: blank/plate/mold`; nonempty replacement requires `replace:true`, remains undoable. |
| `batch` | `commands:[{name,args},...]`, optional `description`; 1–100 steps, no nested batches. |

Feature types: box, cylinder, rectangle, circle, extrude, revolve, holes, fillet, chamfer, Boolean, mirror and connected linear pattern. Options select `operation: add/cut/intersect`, named plane/axis and finishing selector. Extrude/revolve reference an earlier profile feature by `references.profile`. Mirror/Boolean reference `references.component`. Sources use definition-local geometry; placed-instance transforms are not implicitly applied by Booleans.

Each part's result must be one valid connected solid or one planar physical region. Initial disconnected additive constructors can create automatic new ownership; the result explains `ownership_change`. Regeneration of existing features never silently splits into more components. Basic semantic edge signatures and expected counts fail on ambiguity; they are a bounded reference strategy, not a general topological-naming solution.

## Sketches

`sketch.create` accepts `name`, optional `owner`, `plane`, `entities` and `constraints`. Entity IDs must be unique within the sketch:

```json
{
  "entities": [{"id":"line","type":"line","x1":0,"y1":0,"x2":8,"y2":2}],
  "constraints": [
    {"type":"fix","a":"line.start"},
    {"type":"horizontal","a":"line"},
    {"type":"distance","a":"line.start","b":"line.end","value":"10 mm"}
  ]
}
```

Entities are point `(x,y)`, line `(x1,y1,x2,y2)`, circle `(x,y,radius)` and arc `(x,y,radius,start_angle,end_angle)`, with `fixed` and `construction` flags. Constraint references use entity IDs or `.start/.end/.center`. Additional supported relations are vertical, coincidence, parallel, perpendicular, equal length/radius, angle, radius, diameter, tangent, point_on_line and point_on_circle. Compatibility is validated by the solver adapter.

`sketch.constraint` adds a constraint to `feature_id`; `sketch.remove_constraint` removes `constraint_id`. `sketch.update` replaces entity/constraint lists atomically, retaining surviving IDs, parameter identities and unchanged expressions. Diagnostics report DOF, redundant constraints and conflicts. Underdefined sketches remain legal but are shown as such; seed coordinates do not falsely claim constrained design intent.

## Previews, history and jobs

`POST /api/previews` uses the same command envelope. A successful candidate returns a token, components, affected IDs and parameter values without a design commit. `POST /api/previews/TOKEN/commit` commits that exact validated candidate only if actor/revision still match. Tokens expire after 15 minutes and are bounded to the latest 20 previews.

`POST /api/history/FEATURE` explicitly computes a rollback view; `/cost` reports cache state and measured estimate. A view does not change saved intent. Native geometry runs out of process; `POST /api/jobs/ID/cancel` stops its work and protects the saved revision. Job status is distinct from durable success. The queue is bounded; callers must respect backpressure.

`GET /api/state` exposes document, parameter graph/fits, component information, flattened world placements, quantity-aware summary, timings, checkpoints, agents and recent actions/jobs. `/api/activity?before=REV&limit=250` retrieves older actions. `/api/events?after=SEQUENCE` returns ordered diagnostics and reset indication if the bounded event ring was exceeded. Durable action history is not limited by that event ring. Binary display meshes contain per-face triangle ranges and per-edge segment ranges for selection.

## Local access and MCP

The service binds to 127.0.0.1 and checks Host and Origin. Opening the bundled UI establishes an HttpOnly SameSite local cookie. External clients use the connection-file bearer capability, register an actor with `/api/agents`, then send `X-RyanCAD-Actor`. Bearer clients cannot omit their identity to impersonate the human or operate human pause/revoke controls. This is local capability authorization, not multi-user account authentication.

The stdio server uses the official MCP SDK and exposes nine tools:

- `cad_capabilities`: discover supported commands/fields and current document/revision.
- `cad_inspect`: read current document, parameters, components, fits, history or jobs.
- `cad_execute`: validated command, revision and idempotency key; optional bounded wait.
- `cad_preview`, `cad_commit_preview`: evaluate and commit exact proposals.
- `cad_job`, `cad_cancel`: inspect/cancel asynchronous work.
- `cad_measure`: static distance/interference between selected occurrences.
- `cad_export_stl`: selected outputs, frames, precision and validation receipt.

Tool JSON schemas are published by MCP discovery; use them rather than inventing arguments. Waiting is bounded to 25 seconds; a pending response is not a failed operation or a durable commit. Call `cad_job` with the returned ID. Pause/revoke is enforced by the application, not a special guarantee of MCP itself. Step observation waits before each semantic action; explicit batches remain atomic. Disconnecting the adapter closes its registered session.

## Native and export formats

Schema 0.2 stores components/instances, automatic parameters, features, fits, actors and intent. Unknown fields/versions fail safely. There is no earlier released schema to migrate silently. The SQLite journal stores checksum-verified revisions, actions, retry results, undo/redo stacks and named checkpoints. Portable snapshots use SQLite backup. Restore validates/reconstructs known tables and never executes archived SQL or overwrites an existing project directory.

STL export requires an expected revision and current instance IDs. It stages separately named files and only publishes a completion receipt after the selected set validates. Choose local-part or assembly coordinates; STL is always mm. Linear deflection is 0.001–1 mm; angular deflection 0.01–0.5 radians. Validation covers the actual float32 output and reports its numerical/intersection limits. Native intent and STL meshes remain separate contracts.

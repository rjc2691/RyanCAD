# Engine, document and external-agent contracts

## Current reference and value policy — October 28

The [simple design intent policy](SIMPLE_DESIGN_INTENT.md) supersedes the earlier live geometric-link descriptions below. Pending commands accept semantic references as before; accepted features copy external shapes and local frames into `options.reference_snapshot`. Those inputs no longer follow the picked component. Same-part edge selection and sketch-local constraints remain supported. Legacy links are captured before the next mutation, and snapshots survive native export, restart and source deletion.

`Parameter.named` distinguishes explicitly created named values from private compatibility value records. `parameter.create` creates a unique design-wide named value. Numeric feature/placement/sketch inputs remain private; only deliberately named values may be explicitly reused. Client autocomplete reads named values of a compatible type. Cross-component `fit.create` is disabled and is no longer advertised. Native geometry reports provenance for known primitive edge, extent and area dimensions; the renderer does not infer links from equal numbers.

## Ownership of a live design

`CadService` owns one `ProjectStore` and `Document`, a serialized mutation boundary, an event sequence and an isolated persistent native worker. UI and MCP clients submit the same reducer commands. The reducer edits an isolated candidate; schema/ownership/parameter validation, geometry validation and durable commit must succeed before publication. Native objects and meshes are derived caches, absent from the editable YAML schema.

`WorkspaceManager` maps each persistent browser workspace code to a list of separate project directories. A request is bound to one service for its full lifetime, including commands, previews, jobs, geometry and exports. The UI pins each browser tab using `X-RyanCAD-Design`; navigational downloads use the `design_id` query parameter. A tab can therefore keep editing its design while another tab changes the workspace's default. The server validates design membership and preserves each project's journal and worker. Deleted entries remain recoverable and are not routed until restored. At least one design remains active. Projects with queued/running/waiting jobs cannot be deleted.

`GET /api/workspace` returns the workspace code, default design and design list. `POST /api/workspace/designs` creates a design; `/designs/{id}/select`, `/rename`, `/delete` and `/restore` manage it. `/api/workspace/import` imports native data as a new project; `/copy-existing` copies the legacy project and journal without altering it. `/api/workspace/recover` switches the browser using a code; `/new` creates another workspace. Browser profiles keep a persistent cookie, while tabs remember their chosen design in session storage. The workspace code is a recovery identifier, not an account or authorization system.

MCP clients can pass `--workspace CODE --design ID`; both values are available in the app's External agents panel. The adapter pins its HTTP requests, job polling and agent identity to that service. With `--workspace` alone it pins the current default at connection time; omitting both retains compatibility with the original standalone project. The local bearer connection file remains necessary for agent registration.

Code boundaries:

| Module | Responsibility |
|---|---|
| `model.py` | Pydantic document, actor, parameter, component/instance, feature, command and action schemas. |
| `parameters.py` | Restricted typed expression AST, stable binding, cycle detection, graph and fit intervals. |
| `commands.py` | Semantic intent edits on candidates; no HTTP or rendering dependency. |
| `operations.py`, `placements.py` | Unified recipes, guarded origin/profile/path references, native execution and shared exact assembly transforms. |
| `sketches.py` | Native PlaneGCS entities, constraints, solution diagnostics and exact input ownership. |
| `geometry.py`, `meshcheck.py` | OCCT construction, stable-selection guards, tessellation, measurement, validation and STL writing. |
| `worker.py` | Supervised spawned process, cancellation/generation protection and restart. |
| `storage.py`, `projects.py` | Durable revisions, readable snapshots, safe archive restore and single-writer protection. |
| `workspaces.py` | Persistent browser workspaces, project routing, recoverable deletion and legacy-project copies. |
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

## Unified operation recipes

The viewport workspace submits `operation.create`. `/api/capabilities` publishes its strict `operation_schema`; external agents discover this through MCP `cad_capabilities` and use the same preview/commit/execute tools.

Profiles include rectangle, circle, polygon, planar face, existing closed sketch, body and native fillet/chamfer. Motions include linear, connected-edge-chain sweep, revolve, helix, none, mirror and connected repeat. Results are new/auto/add/cut/intersect. Auto requires a target, measures native tool/target overlap, and selects cut above 50% tool overlap or add otherwise; planar tools use area and through-target extents use cut on intersection. Preview receipts expose `operation_decision` (mode, overlap fraction/measure and policy) and `preview_elapsed_ms`. Before acceptance, the candidate stores a fixed resolved result with `auto_selection` provenance. Parameter regeneration never reclassifies the operation. Not every combination is supported: body tools support placed Boolean/mirror/repeat, and symmetric/through extents apply only to straight travel. Fillet/chamfer recipes canonicalize to native finishing on one or more existing target edges.

Origin, profile/support, path and target occurrence are separate references. Coordinates/axes are world based; occurrence transforms resolve them into the target definition's frame. Semantic face/edge signatures must match uniquely. Body sources remain unconsumed. Existing sketches carry implicit planes; display-only stock faces are not native references.

Editable inputs create parameters or reuse `{ "parameter": "p_..." }`. Polygon vertices become U/V parameters. Preview responses add candidate `occurrences` and resolved `feature_values`; ownership changes appear under `changes`. Exact commit preserves validated identities. [UNIFIED_OPERATIONS.md](UNIFIED_OPERATIONS.md) contains a command example, complete launch flows, validation behavior and supported limits.

## Sketches

`sketch.create` accepts `name`, optional `owner` (defaults to `root`), `plane`, optional `frame`, `entities` and `constraints`. Root sketches are independent construction features and create no component/instance. Explicit `owner: null` preserves the legacy new-planar-component constructor; existing physical owners remain supported. A frame is `{ "origin": [x,y,z], "u": [ux,uy,uz], "normal": [nx,ny,nz] }` with perpendicular unit directions and a finite bounded origin. It freezes a world placement rather than storing an associative face attachment. Entity IDs must be unique within the sketch:

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

`GET /api/state` exposes document, parameter graph/fits, component information, flattened world placements, quantity-aware summary, timings, checkpoints, agents and recent actions/jobs. `/api/activity?before=REV&limit=250` retrieves older actions. `/api/events?after=SEQUENCE` returns ordered diagnostics and reset indication if the bounded event ring was exceeded. Durable action history is not limited by that event ring. Binary display meshes contain per-face triangle ranges and per-edge segment ranges for selection. Edge metadata also exposes sampled native curve points for path-reference guides; these are derived display data, not authoritative editable references.

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

### Grouped operation references (recipe version 2)

`operation.create` optionally accepts `path_references` and `profile_references`, each bounded to 64 items. These arrays contain the complete selection, including the first item. Scalar `path_reference` / `profile_reference` / `sketch` inputs remain supported. Grouped recipes are stored with `recipe_version: 2`; the evaluator still accepts version 1. Document schema remains 0.2.

```json
{
  "name": "operation.create",
  "args": {
    "target": "part_actual_id", "target_occurrence": "inst_actual_id",
    "profile": "face", "motion": "linear", "result": "cut",
    "origin": "reference", "plane": "face", "direction": "normal",
    "reference": {"component":"part_actual_id","occurrence":"inst_actual_id","face":"actual_first_face_signature"},
    "profile_references": [
      {"component":"part_actual_id","occurrence":"inst_actual_id","face":"actual_first_face_signature"},
      {"component":"part_actual_id","occurrence":"inst_actual_id","face":"actual_second_face_signature"}
    ],
    "values": {"distance":"-2 mm"}
  }
}
```

Each path item must supply `component`, optional `occurrence`, and `edge`. A custom sweep needs one connected, unbranched chain/loop, ordered natively by endpoints within 1e-6 mm; fillet/chamfer sets may be disjoint but belong to the active occurrence. Multiple edges cannot define a rotation axis. Missing/ambiguous/branched/disconnected paths fail explicitly.

Each profile item supplies a `face` signature or a stable `sketch` feature ID, plus its component and occurrence. Sketch ownership and placement are checked. Regions must be planar and mutually parallel, may have opposite normals, and preserve relative spacing and plane height under one common translation/motion. Their tools are unioned before Auto/Boolean evaluation. Shared dimensions create one feature, not one feature per selected face. The final component must still be one connected physical region/solid. Source deletion checks traverse nested grouped references.


### Distance/percentage travel and display labels

`operation.create` accepts `path_extent: "full" | "distance" | "percent"` (default `full` preserves existing full-edge sweeps). For `linear`, `full` retains legacy measured-distance behavior. `distance` uses parameter-backed `values.distance`; `percent` uses dimensionless `values.path_percent` (50 means 50%, not 0.5) multiplied by the current finite reference path's native arc length. Percent requires a guarded path reference and applies to `linear`/`sweep` only. Linear percentages may be signed within -100..100 excluding zero. Sweeps require 0 < percent <= 100 or a positive distance no greater than total path length. Reverse traverses a sweep from the opposite end. Through-all, native finishes and other motions use `full`; unsupported combinations fail. New percentage/partial-sweep recipes use `recipe_version: 3`; versions 1/2 remain supported without changed defaults.

Example addition to an existing referenced sweep: `"path_extent":"percent", "values":{"diameter":2,"path_percent":50}`. This stores percentage intent and a ratio parameter; it does not bake a length into the file. Grouped paths use the connected total length. Existing revision checks, preview commit, attribution, parameter reuse, undo and autosave apply unchanged.

Derived geometry includes `faces[].id/name`, `edges[].id/name`, and `vertex_info[].id/name/point` alongside the existing vertex point array. IDs and names are unique by entity kind within one component geometry revision, not persistent topological identities. Clients must continue using guarded signatures/endpoint references for commands. UI list hover is local presentation only and creates no API/MCP command.


## Relative and referenced component movement

`instance.transform` remains absolute placement. Use **`instance.move`** for the panel-equivalent movement workflow; preview with `/api/previews`, then commit the returned token. All point/direction coordinates are snapshots in the identified reference occurrence's local frame, canonical mm. Source and references resolve against the saved document, never a transient preview transform.

```json
{
  "name": "instance.move",
  "expected_revision": 12,
  "args": {
    "id": "i_source",
    "occurrence": "i_assembly/i_source",
    "method": "projected",
    "origin": {"occurrence": "i_assembly/i_source", "point": [0, 0, 0]},
    "target": {"occurrence": "i_target", "point": [4, 2, 0]},
    "direction": {"occurrence": "i_reference", "start": [0, 0, 0], "end": [1, 0, 0]}
  }
}
```

Legacy explicit movement methods (still accepted): `axes` takes `values.x/y/z` translation distances and `values.rx/ry/rz` angle increments; omitted increments are zero. `point` requires origin/target. `direction` requires a straight-edge direction snapshot and `values.distance`; optional `reverse` negates the edge direction. `projected` requires origin/target/direction and computes only the direction-parallel part of the point displacement. Origin must identify the active occurrence. Repeated source placements remain shared; unrelated instances' parameter-backed placements are not overwritten. Inputs support native expressions and `{parameter: id}` reuse. Reference-based moves preserve orientation.

`changes.movement` in a preview contains `origin`, `destination`, optional `target` and `direction` in world mm, `displacement`, `delta_parent`, and `remaining_gap`. Point alignment is one-shot and creates no persistent mate. Saved movement inputs/result placements use the normal typed parameters and authored transaction/undo/autosave contracts. Re-evaluating a named distance preserves its fixed reference direction; it does not re-pick edited topology.


### Unified reference inference and axis rotation

Current panel methods map to `instance.move` with `method: reference | axes | rotate`. For `reference`, `target` is optional when `direction` and `values.distance` are supplied; `origin` defaults to `{occurrence: active, point: [0,0,0]}`. Target alone aligns points; target plus direction projects the displacement onto that unit direction. Supplying `values.distance` overrides target-based travel, using the reference edge or, when absent, the source-to-target ray. Omit distance (or use an empty string) to restore alignment. The UI retains the references while changing/clearing individual inputs. A direction without target or distance is incomplete. Explicit `point`, `direction`, and `projected` methods remain supported for existing clients.

For `rotate`, use the same `direction` line snapshot and `values: {angle: "90 deg"}`. Rotation is about the actual line through its start/end, not about the component origin or world origin. `reverse` negates the line direction. The normal preview report includes `rotation_angle`, `directionStart`, `directionEnd`, and source/destination world positions. After commit, `instance.placement.rotation_angle` identifies the editable angle parameter.

The placement map may contain `rotation_angle`, `rotation_axis_x/y/z` (ratio parameters), and `rotation_origin_x/y/z` (length parameters). The shared evaluator applies that parent-frame axis rotation to the base x/y/z/rx/ry/rz placement. All exports, measurements, native regeneration and occurrence/picking matrices use the evaluated result. A subsequent relative move, axis rotation, or absolute `instance.transform` snapshots the evaluated pose into base coordinates before applying the new edit; this prevents jumps or accidental double rotation. These snapshots follow the existing move-from-current-placement semantics and do not add a parametric transform history feature.


### World-axis direction references and midpoint picks

A movement/rotation `direction` can be `{ "axis": "X" }`, `{ "axis": "Y" }`, or `{ "axis": "Z" }` instead of an occurrence-local line snapshot. Do not combine axis and occurrence fields. These are exact global directions, independent of component/parent placement; for rotation the selected world axis passes through the world origin. Reverse and signed distance/angle semantics are unchanged.

Public edge metadata already provides the native `midpoint`. Midpoint point picks serialize that exact local coordinate to movement origin/target snapshots, not the midpoint of the endpoint chord. The client tags display midpoint selections as `vertex.anchor: mid` plus the guarded edge. Display resolution tracks the current guarded edge's native midpoint rather than searching the topological vertex list.

The client prepopulates Movement distance from references. That automatic display remains absent from `values.distance`; native reference inference remains authoritative. Only a user-edited exact override is included. This avoids a preview/input feedback loop and retains parametric inference as references change. The displayed projected distance is signed along the chosen direction (including reversal).


### Recipe v4: travel targets, full finite paths and native sections

`operation.create` accepts `travel_target: Reference` and `path_extent: full | distance | percent | target`. A supplied target chooses target extent and creates no distance parameter. `Reference` adds `world: origin` with `component: root` to select the world-origin point without requiring assembly geometry. Edge anchors remain start/mid/end; faces use centers. The target is stored in feature references, so geometry/placement edits regenerate projected travel.

For linear travel, projection is signed along the selected direction through Tool Origin; symmetric extent places its end at the projection. For Sweep the nearest point on the translated native path is measured using arc length; endpoint projection is finite. For Helix it determines signed axial rise. Explicit full extent uses the selected native edge/chain length, with no distance parameter. An implicit direction cannot supply full finite extent. Legacy recipes v1–v3 retain their previous distance semantics, and older API constructors with explicit distance values remain distance-based.

Target-limited fillet/chamfer recipes require one straight edge. The kernel first constructs the finish, then clips actual removed/added material to a perpendicular finite slab, producing exact planar end caps. Curved/multiple-edge partial requests fail with `unsupported_extent`; full-edge groups remain supported.

Native preview results include `operation_display.travel` (world origin/end/target and signed distance) and `operation_display.finish_section` (native planar loops in world coordinates, area, plane normal/U, interior station, and added/removed effect). These are derived display information and are cached by the same native feature key. They do not enter editable CAD geometry. Section display failure is reported as `unavailable`; no synthetic square replaces it.

Public face metadata adds `edge_signatures`, the exact face boundary membership in the component's guarded edge vocabulary. Clients can expand a face into `path_references` using these signatures. The normal 64-edge limit and connected-path/axis requirements still apply.


Sketch update also accepts `name`. Root sketches evaluate before physical components; each has its own native profile, solver diagnostics and cache key. Closed profile metadata includes `region_count`; one region with holes can feed the current unified operation. Multiple disconnected regions and open wires may be retained as construction sketches without becoming physical bodies. The frontend projection tool copies world-transformed native display curves into fixed construction entities; it does not claim associative or exact analytic-curve projection.


## Component groups

`group.create {name, occurrences}` groups sibling occurrence IDs in an identity assembly frame. `group.add {group, occurrences}` adds siblings to an existing placed assembly, preserving world positions. `group.copy {occurrence, name?, offset?}` clones nested group structure/placement parameters and shares physical part definitions; offset defaults to [30,0,0] in the parent frame. `group.ungroup {occurrence}` preserves child poses while dissolving the placed container. Receipts expose occurrence path maps where applicable. Native modeling references are remapped in the same transaction. Group movement uses `instance.move` on the assembly occurrence and accepts origins on descendants. See GROUPS.md for rebasing, retained parameter identities and membership guards.


## Copyable Codex setup

The Agents dialog includes a Copy Codex config action and setup steps. Codex uses `config.toml`, not YAML; see the [official MCP documentation](https://developers.openai.com/codex/mcp/). `GET /api/agents/setup` generates a TOML stdio entry with the server environment's absolute Python executable, working directory and port-specific connection-file path. Arguments bind the connector to the requesting browser workspace and selected design. The service token is read from the local connection file when the connector starts, rather than embedded in the copyable configuration. Copy a new block and reconnect to target another design. Replace the existing `[mcp_servers.ryancad]` block instead of appending a duplicate table.

This local stdio setup assumes Codex runs on the RyanCAD server computer. A browser on another device still displays server-machine paths; remote Codex execution requires an appropriately installed connector or SSH configuration. Keep RyanCAD running and reconnect/restart the MCP client after changing its configuration. Copy works with the Clipboard API or a selected-text fallback for HTTP LAN browsers.
## Shared feedback API

`GET/POST /api/reports`, `GET/PUT/DELETE /api/reports/{id}`, and `GET /api/reports/{id}/images/{imageId}` manage server-wide bug reports and feature requests. These routes use normal host/authentication checks but ignore workspace/design selection. Updates/deletes use per-report optimistic versions; no CAD revisions are changed. See [Bug reports](BUG_REPORTS.md) for request fields, screenshots and storage details.

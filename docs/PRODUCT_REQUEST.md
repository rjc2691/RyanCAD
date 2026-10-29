# RyanCAD product request

## Editing existing history features — October 29, 2026

Double-click a feature event to reopen it for editing in the right panel. Preview edits by rebuilding that feature and every later operation, while retaining its identity, component and position in the history. Apply updates the existing feature as an undoable authored transaction; Cancel/Escape leaves saved intent unchanged. Enter confirms only the current validated preview. Later-feature failures must be reported and block committing. Sketch events reopen the sketch workflow. Keep timeline stepping available separately for inspecting build stages. Existing operation dimensions and supported material/direction settings are editable initially; preserve original profile and frozen reference geometry rather than recreating cross-component bindings.

## Current interaction policy — October 28, 2026

References to other components and the world origin are one-time construction aids. Accepted operations retain fixed local placement and copied external geometry, not a live relationship to the picked source. Sketch-local dimension constraints remain; projected component geometry is copied. Ordinary dimensions are local numeric values. Named parameters are optional values deliberately created in the Parameters window, with live name suggestions in numeric fields and subtle provenance on viewport dimensions. These decisions supersede earlier requirements to make every dimension a named parameter or maintain cross-component geometric links. See [Simple design intent](SIMPLE_DESIGN_INTENT.md) for behavior and migration.

**Revision 20 — October 28, 2026. Implementation authorized; includes contextual information, unified operations, and the functional workspace layout.**

## 1. Mission and authorization

Build a precise, beautiful, information-centered CAD application for functional 3D-printed parts and multi-component designs. It should be easy to design manually and equally accessible to external AI agents through the same modeling operations. Editable intent, trustworthy information, responsiveness, and recovery matter more than feature count.

The owner has approved implementation. Build Phase 1 in the milestones defined in the roadmap. Do not silently remove essential requirements when a technical choice proves difficult. The [implementation record](IMPLEMENTATION_STATUS.md) tracks evidence and remaining release gates without changing these requirements.

The initial real-world target is a multi-part 3D-printed tool for making a silicone mold that will subsequently form small concrete objects. Close-fitting removable parts, shared dimensions, alignment features, and clearances must therefore work in Phase 1. Windows and the owner's MacBook Pro are equal targets. The project is for personal use now, with future distribution options kept open.

### Operation reference clarity

Tool Origin, Tool Profile and Tool Path must remain visually identifiable throughout setup. Give each a consistent role color distinct from retained selection and hover, and mirror those cues in its panel section. Display the real profile boundaries/body and path relationship; derived normal paths must look different from selected/parallel edge paths. A native finishing section may be identified schematically without claiming an exact swept-cutter representation.

Put travel inputs in an **Extent along path** subsection immediately under Tool Path references. Offer parallel **Distance** and **Percent of path** choices; percentages refer to a finite selected edge/chain and remain linked to its regenerated length. Implicit normals have no total length. Keep diameter/radius fields in Tool Profile; do not draw operation input boxes over the viewport. In every section, group source/mode controls, named reference and count/status together in the same order. Profile and motion choices belong in their relevant sections, with no redundant header launch strip or separate world-origin action. Exact zero coordinates remain available. Hovering a selected-reference name must use the same viewport highlight as hovering the entity directly, without changing selection, previews or history. Faces, edges and vertices need readable per-component labels such as Face 4 and Edge 13. These labels describe the current geometry revision; durable modeling references must remain separately guarded.

The operation form places Origin Type, Tool Profile Shape and Tool Path Type above the colored reference boxes. Reference point offset labels U/V/N offsets below the origin reference. Tool Effect Type uses a dropdown. Extent along path stays visually inside Tool Path with no independent divider. The fixed footer contains Feature Name, then Apply operation / Cancel / preview status on one row. Avoid a redundant active-component header and generic commit/keyboard prose.

Move Component (M; grid toggle on Shift+G) must be a toolbar action beside Tool Operation and a side-panel workflow with live movement previews and Apply/Cancel. Use exact, parameter-backed placement in an explicitly identified frame; nested assembly transforms and linked-instance scope must be truthful. Enter confirms and Escape cancels. Retain undo/autosave/attribution and never save an unconfirmed movement. The panel must offer Reference movement (default), XYZ distances/rotation increments, and true Rotation about a selected axis line and angle. Reference movement must infer point-to-point, projected alignment, or signed directional travel from the chosen origin, target, direction, and optional exact distance. Points on the active occurrence set origin; points elsewhere set target; edges set direction. Whole-component clicks choose the moved component. Explicit reference-pick controls override inference for edge endpoints/midpoints; every reference, exact distance, and active component can be cleared. Exact distance overrides target-based travel, and removing it restores inferred alignment. Rotation must respect the selected line's actual position and retain an editable angle parameter after Apply. Display source, target, line/axis, actual travel/rotation, and any remaining gap. Keep result measurements visible while scrolling. Point picks are exact snapshots, not implicit persistent mates. The world XYZ orientation cue must follow the camera and sit above the view options in the viewport's upper right. Enlarge it by 50% and make its X/Y/Z axes selectable as global direction references, also available in the movement panel. Expose exact edge midpoint snapping, including native curved-edge halfway points. Prepopulate Movement distance from inferred travel without converting automatic reference-driven motion into an exact override until edited. Match origin/target/direction panel styling, icons and pick/clear affordances to the viewport role colors.

### Native path extent and profile accuracy

Expose world origin as a selectable operation reference point, including the corner-indicator center and panel picks. Tool Path must have an independent target-point reference. Target extents project onto straight travel directions, finite sweep paths, or helical axes and regenerate from native references. No distance/percentage and no target means the full selected finite path; implicit infinite directions require explicit distance/target. Face picks made while choosing a path expand to the face's exact native boundary edges, preserving component/profile intent and normal connectivity checks. Do not infer topology by visual proximity.

Fillet/chamfer profiles must show the actual changed corner cross-sectional area on a perpendicular plane, derived from before/after native geometry; do not draw a square surrogate. Show the section's native area and added/removed effect. Full-edge finishing remains available on edge groups. Target-limited finishing must be exact on a single straight edge with a planar cap; explain unsupported curved/multiple-edge partial extents rather than approximating them or silently finishing full edges.

## 2. Product ambition

Aim to exceed Fusion, SketchUp, and SolidWorks in clarity, responsiveness, organization, and edit reliability for the supported workflows. Establish comparative evidence on defined tasks before claiming superiority.

The desired visual experience is an elegant dark engineering workspace: crisp geometry, readable dimensions, excellent typography, immediate useful information, restrained lighting, and smooth navigation. The technologically advanced feeling should come from capability and clarity, without clutter or decorative telemetry. 

## 3. Components are the default organization

Every separately manufactured part is a component automatically. An assembly is a container of placed component instances, not an unlabeled collection of loose bodies. Sketches, features, datums, and parameters have explicit owners.

By default a 3D part component produces one connected solid, including any holes or internal cavities. The document can contain many such components from Phase 1. A 2D part owns its planar profile and optional sheet-thickness parameter under the same organization.

Creation tools must clearly express whether they modify the active part, create a new component, or create construction geometry. A disconnected additive result defaults to new component creation, with a preview of the resulting ownership. Operations that unexpectedly split a part must show the consequence and require an explicit split-to-components decision; they must not silently change the number of physical parts during regeneration.

Repeat part creates a linked instance by default. “Make independent” is explicit and retains provenance. Feature patterns within a part remain features when their result is one part; patterns of separate parts become component instances. Never silently fuse or delete disconnected geometry.

Multi-body components are not a Phase 1 requirement. If later justified, introduce them through an explicit advanced workflow while retaining meaningful per-part statistics.

## 4. Parameters are created automatically

Every accepted editable design dimension—length, radius, angle, count, placement offset, thickness, or clearance—must have a stable named parameter. Typing 5 mm into a fillet creates a parameter with a useful suggested name and component/feature ownership. Naming is optional work; parameter creation is not.

Parameter reuse must be easier than re-entering a number. Offer relevant existing values, recent choices, and favorites such as “Standard edge fillet.” Provide rename, promote to shared, link selected uses, and make independent actions with change-impact previews.

**Equal numbers do not imply shared intent.** Two independent 5 mm inputs remain independent until the user or agent explicitly reuses a parameter. Reusing a standard fillet binds future edits to that parameter; changing it shows every affected feature and component.

The parameter workspace must distinguish:

- Independent root inputs, derived expressions, and measured read-only outputs.
- Upstream dependencies and downstream consumers.
- Component-local, assembly/shared, and explicitly promoted parameters.
- Design purpose, quantity type, tolerance, current value, units, and use count.

Default to a readable table with filters for Root inputs, Shared, This component, Used here, and Unused. A focused dependency graph is an optional explanatory view. Selecting a dimension, feature, or face must reveal its controlling parameters and a direct “trace to root inputs” path. Prevent cycles, preserve references on rename, and explain deletion impacts.

Do not create meaningless exposed parameters for every computed vertex, mesh coordinate, cursor position, or fixed coordinate-system basis. The default applies to user-editable design inputs.

## 5. Precision, tolerances, and hybrid modeling

All committed placements resolve to explicit coordinates, dimensions, snaps, or relationships in a named frame. Pointer interaction is useful for selecting and previewing, but no edit should rely on an unexplained free-space position.

Combine dimensioned constructors and small constrained sketches with fast face selection, planar push/pull, exact transforms, duplication, and patterns. Prefer editing an existing generating dimension when that intent is unambiguous; otherwise append a supported editable feature. Every direct edit participates in history and parameter organization.

Expose nominal dimensions, tolerance ranges, and fit/clearance requirements directly in the inspector. Keep nominal clearance separate from manufacturing tolerance and from kernel/solver/tessellation tolerances. Unspecified tolerance means unspecified, not zero.

For a pin and socket, label whether clearance is radial/per-side or diametral/total. Maintain an explicit shared relationship and show nominal and simple worst-case fit results when sufficient inputs exist. Do not invent a universal printer clearance or present a dimensional check as a guarantee of physical fit.

### Unified viewport operation requirement

Material operations use one **Tool / T** workspace: **Tool Origin · Tool Profile · Tool Path · Tool Effect**. Every aspect remains revisitable. Extrusion, hole, round/bevel, sweep, revolve, planar raised detail and body Boolean are starting configurations within this process. Users must be able to change direction without canceling or opening a different creation dialog.

Use viewport selections for origins, faces, vertices, support planes, paths, axes and targets. Geometry picks should update the relevant draft role from any scroll position: faces replace profiles/supports, edges replace paths, and vertices provide exact anchors. Preserve explicit dimensions, manual result overrides, locked origins and target ownership. Offer Auto Add/Remove from actual target/tool overlap, with an understandable decision display; freeze the accepted result during later regeneration. Keep old previews visibly stale while new work completes, reduce input-to-display latency without reducing geometry accuracy, and never allow an old candidate to apply. Exact coordinates and parameter-backed offsets refine these choices. Edge launch suggests corner finishing or a custom perpendicular section; face launch suggests whole-face travel or an explicitly placed hole. Vertex, component, planar-profile and empty-space launches have sensible defaults. Keep the target distinct from tool/reference selections.

The dock must leave the model visible, with automatic native previews and dimensional inputs beside geometry. Apply commits the exact current visible validated candidate as one authored feature/action with automatic parameters and autosave. Enter confirms the current valid candidate from any workflow focus; one Escape cancels the entire operation, including picking/drawing. Implicit, selected and parallel path references must be visually distinct. Signed travel and Boolean result are independent, so choosing Remove cannot silently invert a negative distance. Cancel makes no document edit. The same interaction handles planar fabrication with no artificial thickness.

[UNIFIED_OPERATIONS.md](UNIFIED_OPERATIONS.md) specifies launch flows, current implementation limits, API recipes and extension points. Advanced paths, richer inline constraints, tool libraries and wrapped emboss extend this workspace rather than multiplying creation dialogs.

## 6. External-agent operation

RyanCAD includes an MCP server for external agents. It includes **no built-in chatbot, model-provider integration, or chat panel**.

Agents edit the same live document session through the same validated semantic commands as humans. They do not have to simulate mouse clicks. The human can watch each meaningful operation update the viewport, parameters, component structure, and timeline.

Every accepted design action records actor identity/type, action description, affected entities, sequence/revision, timestamps, and outcome. Features show created-by and last-modified-by information. The timeline exposes an activity overlay so parameter edits are visible even when they update existing features instead of creating new ones.

Support Follow agent, normal-speed/step observation, pause-before-next-action, revoke write access, and cancellation of running work where possible. Camera following is optional. Failed attempts appear in activity diagnostics without becoming successful modeling features.

Agents can work quickly without artificial delays by default. Rendering and disk writes may be coalesced; semantic actions and authorship must remain individually inspectable. An explicit atomic batch can show staged steps, but nothing inside it is presented as committed until the batch succeeds.

Human and agent edits share revision checks and serialized writes. A human taking control invalidates stale agent proposals rather than allowing them to overwrite the human's changes. All capabilities remain available manually and offline.

## 7. Autosave and recoverable history

Autosave is the normal document lifecycle. Every accepted edit goes to a durable journal, with short bounded coalescing during bursts; readable document snapshots are updated automatically. Users should not need a Save habit.

The interface distinguishes Preview, Saving, Saved locally, and Save failed. Agent responses distinguish a pending operation from a durable successful commit. A write failure must not be reported as saved.

Support undo/redo, named checkpoints, and restore. Autosave must not erase the ability to return to an earlier design. Closing, export, and creating a portable project snapshot flush outstanding committed work. Recovery preserves every edit previously acknowledged as saved.

History has distinct controls for feature rollback, action undo/redo, and saved revisions. Mark expensive features and requested rebuild paths with measured/estimated cost, cache state, and uncertainty. A hover or scrub must not silently launch a costly rebuild. Offer a cached state or explicit Compute action; all heavy work runs outside the UI process.

## 8. Information-centered interface

Proposed workspace:

- Compact top bar: project, units, current actor/session, autosave state, command search, export.
- Component/assembly tree with clear ownership, instance reuse, and health indicators.
- Large shared 2D/3D viewport with precise selection, dimensions, optional section view, and contextual inputs.
- Inspector with dimensions, tolerances, fit relationships, measurements, and change impact.
- Parameter workspace available as a persistent/pinnable panel.
- Feature timeline with authorship/activity overlay, rollback cursor, expensive-operation badges, and separate undo controls.
- Compact external-agent activity controls; no chat panel.

Do not put a statistics strip below the viewport. Put physical-instance and unique-definition counts in Design structure. Put material volume and surface/profile area in the inspector, scoped to the selected part or placed assembly; with no selection show quantity-aware design totals. Put saved revision and Undo/Redo in the bottom history/activity timeline.

Use factual labels, measurements, actions, and status. No slogans, promotional or motivational copy, decorative health claims, or generic placeholder design intent. Show Notes only when the document contains actual notes. Empty states should identify the state and offer direct actions.

Keep component size, volume or planar area, surface area where applicable, count, units, and health easy to see. Assembly statistics distinguish quantities from unique definitions. Hide/show is a display choice and must not silently change the bill of parts or export selection.

Every metric identifies its scope, units, revision, and freshness. Mass and cost require explicit material/process assumptions. Prepare for assembly cost-change analysis, but defer the material/cost library to Phase 2.

### Contextual information selection

The viewport must actively help the user understand the geometry being hovered or selected. Prefer small dimension lines beside actual boundaries—such as a part's span and thickness—over large cards covering the model. Choose the visual form that communicates the fact with the least clutter; not every useful fact requires a dimension line.

Create a service that generates measurement/information candidates, scores their usefulness, and chooses a readable set. Its mathematical policy should account for current interest, recent interactions, similar competing features, novelty/redundancy, view legibility, occlusion, available space, and display stability. Start with a transparent weighted model and leave providers, signals, weights, and layout independently extensible. This is a core product capability, rather than a growing set of per-tool display conditions.

Preserve access to complete information and prepare manual pin/dismiss/show-more overrides. Ranking must never alter dimensions, merge parameter intent, fabricate measurements, or change the model. Phase 1 establishes the service and useful spatial annotations; later phases expand to fits, tolerances, fabrication properties, and task-aware analysis. See [contextual information design](CONTEXTUAL_INFORMATION.md) for the current implementation, limits, and development path.

## 9. Proposed Phase 1 baseline

| Area | Release scope |
|---|---|
| Documents | Readable native model, autosave journal, open/recover, undo/redo, named checkpoints, schema validation and migration. |
| Components | Multiple part definitions and instances, assembly grouping, exact placement, linked duplication, explicit independent copy, per-component statistics. |
| Parameters | Automatic named inputs, reuse/promotion, expressions, root/dependent navigation, usage search, dependency-cycle prevention. |
| Tolerances | Nominal values, optional limits, explicit fit/clearance relationships, simple pin/socket interval checks, visible assumptions. |
| Sketches | Lines, polylines, rectangles, circles, circular arcs, construction geometry, profile regions, bounded reliable constraints. |
| Constraints | Coincidence, axis alignment, parallel/perpendicular, equality, dimensions, radius/diameter, angles, anchoring; evaluate tangency in the solver gate. |
| Solids | Box/cylinder constructors, extrusion/cut, revolve, holes, Booleans, basic fillets/chamfers, supported direct planar edits. |
| Repetition | Feature and component patterns, mirror with documented semantics, exact duplication. |
| Mold workflow | Shared cavity/tool dimensions, separately owned mold pieces, alignment pins/sockets, defined clearances, inspection, independent STL export. |
| History | Feature and action history, actor attribution, safe rollback, suppression/editing, cost-aware navigation, cancellation and recovery. |
| Inspection | Dimensions, bounds, volume/area, counts, selected distances, basic section inspection and targeted static clearance/interference checks. |
| AI | External MCP only, visible stepwise edits, live-session routing, pause/revoke, transactions, revision checks, idempotent retries. |
| Cross-platform UI | Same dark web UI and local Python engine on Windows and macOS; no required cloud service. |
| Interchange | Binary STL export per part/selected instances and explicitly separated batch output. Native project serialization is separate. |
| 2D foundation | Planar physical-part components in the shared workspace, dimensions, thickness metadata/preview, ownership and placement. No SVG exporter required yet. |

An early one-part demonstration is a milestone, not a substitute for the multi-component Phase 1 release. Scope changes require discussion.

Defer new interchange adapters, general mesh-to-parametric conversion, moving joints, full materials/cost systems, dynamics, simulation, CAM, cloud collaboration, advanced surfacing, and illustration tools.

## 10. Native data, 3MF, and future formats

Use a RyanCAD-owned parametric document with stable IDs, component definitions/instances, parameter relationships, tolerances, features, authorship, and history. Keep kernel objects and display meshes out of the public schema.

Recommend 3MF later as a manufacturing adapter; do not base the native editable model on it. Format modules should describe import/export capabilities, units, retained semantics, approximation, and unsupported content. An adapter boundary makes integration organized, but rich import and history recovery are not automatically simple.

STL is the only required Phase 1 manufacturing output. Supplied STL files are references, not evidence that their original dimensions or feature history can be recovered. Their handling is specified in the reference-object document.

## 11. Integrated 2D manufacturing

A laser-cut plate and a printed part should share component ownership, parameters, precise placement, dimensions, tolerances, history, selection, and agent commands. Working on a plane is a contextual view, not a separate illustration application.

Distinguish manufacturing boundaries from construction curves and later engraving paths. Store optional stock thickness and explicit inside/outside regions. A thickness preview is not silently a new authoritative solid; converting a planar part to a solid is an explicit operation. Multiple disconnected cut pieces become separate components, while holes remain boundaries of their owning part.

Phase 2 adds SVG and related fabrication interchange as needed, plus kerf-aware output and richer planar operations. Keep nominal design geometry separate from manufacturing compensation. Full graphic illustration is outside the planned product.

## 12. Later phases and completion

**Phase 2:** extend assembly reuse/configurations, material and cost properties, quantity-aware cost comparisons, richer fabrication information, requested import/export adapters, and integrated laser-cutting capabilities.

**Phase 3:** joints and kinematics, motion/clearance studies, specialist analysis integrations, advanced modeling where demanded, and optional collaboration/extensions. Force-based dynamics and structural validation remain distinct investments.

Phase 1 is complete when a user can create and revise the multi-part mold manually or through an observable external agent, trace its parameter dependencies, inspect fit specifications, recover edits, and export the pieces on both Windows and macOS.

## Operation presentation requirements — October 24 follow-up

- Tool Origin, Tool Profile, Tool Path and Tool Effect are persistent vertical sections in one compact scrolling form, with fixed validation and Apply/Cancel controls. Users never need stage buttons to access another aspect. Numeric values retain units and reusable parameters.
- Inspector and tool operation panel share the same responsive width; opening or closing the tool must preserve viewport bounds and camera framing.
- The edited component stays opaque and identifiable in its display color. Inactive components are transparent during preparation (initially 20% surface opacity), remain pickable, and return to normal after the operation closes. Selection uses retained orange styling; hover must be visually distinct in color, weight and vertex shape, and identify the exact click target. Definition ownership determines focus, including linked instances, independently of the selected reference.
- Selecting edges/faces updates overlays without reconstructing the native mesh. Preview replacement is atomic, with the previous solid candidate retained while assets load. Do not fade the target or draw competing source/candidate surfaces. Pending/invalid preview status is explicit and cannot be committed.

- The active component is locked for the lifetime of a tool draft. To change it, cancel the operation, activate the intended component, and restart. Viewport/tree/timeline picks during setup update references only; neither explicit controls nor inference may retarget the draft. New-component drafts do not bind a target when geometry is picked.

## Grouped selections and shared tool motion — October 24

Shift-click adds/removes individual faces/edges before and during a tool operation. Multiple connected edges form a real native sweep path, ordered by connectivity, with branches/gaps rejected. Multiple planar faces or closed sketches on coplanar/parallel planes form a profile group; spacing and plane height survive shared travel. Groups expose counts/removal controls and remain one parametric feature/action. Active-component locking, transparent context and exact preview/commit remain in force. Limits and the connected-result ownership rule are explicit in the unified workflow specification.

- Hover and retained selection must remain distinguishable even on the same entity. Hover uses a cyan/pale target cue and pointer label; selected geometry stays orange. Section-specific selection feedback belongs within Tool Origin/Profile/Path/Effect rather than above the form.


## Dedicated design sketch workspace — October 26 update

Sketch is a first-class toolbar operation (E), using the existing side panel and main viewport. No modal/full-viewport sketch construction editor remains. Start on a world plane or picked planar component face; automatically align an orthographic camera, show a legible adaptive grid/U/V axes, retain component references, and restore the previous camera and display setup on finish/cancel. Plane picking may temporarily orbit the model. The same workspace creates an ad hoc profile while a material operation is suspended; finishing saves a design sketch, attaches it to the pending tool and resumes its preview, while cancelling preserves the original tool configuration.

New sketches belong to the design root, are independent from physical components and appear in a separate Sketches list. Creating a construction sketch must not inflate part counts, material totals or STL exports. Legacy component-owned sketches remain readable/editable; no destructive ownership migration is implicit. Saved design sketches have stable feature/parameter IDs and drive downstream geometry.

The initial drawing set includes connected lines, rectangles, circles, center/start/end counterclockwise arcs, points and copied projections. Support exact U/V entry, editable coordinates/radii, configurable grid snapping, endpoint/midpoint/origin snapping, horizontal/vertical alignment, construction geometry, local undo, explicit Finish/Cancel and native constraint validation. Components remain visible and referenceable during drawing. Initial projections are clearly identified independent construction copies; curved references use sampled line segments. Initial picked planes are explicit frozen world frames, not associative attachments. Native constraints solve at Finish; continuous live solving, associative projection/attachment, direct dimension manipulation and trim/offset are follow-up design work, not implied capabilities.


## Selectable component groups and direct toolbar — October 27 update

Group Components is a direct top-bar operation. Group existing components without joining bodies or moving them; support adding members to existing groups, aggregate selection/highlighting, G movement/rotation, copy and undoable ungrouping. Double-clicking a closed group in the viewport or tree opens its immediate children for normal part/feature editing; outside parts are muted and a clear Done action exits. Group copies have independent container structure/placements with linked physical part definitions. Keep stable component/feature identities and repair occurrence paths transactionally when organization changes.

Remove the All tools dropdown and its shape/motion shortcuts duplicated by the universal Tool. Put remaining distinct workflows directly in the top bar, including component arrays, stock, parameter creation, fits, measurement and checkpoints. Preserve Sketch and universal Tool entry points. Keep full accessible names/tooltips and a compact, usable layout.

## Design collections and history presentation — October 27, 2026

Organize each design into Components (manufactured assembly tree and counts), 2D Sketches (flat design-level list) and 3D Tool Bodies (flat reusable tool library). Tool bodies are built and edited with the same parametric engine in a private workbench within the main viewport. Their editing coordinates are not manufacturing placements; they are excluded from assembly counts and exports and are positioned through Tool Origin when used. Save the reusable tool definitions with the design and protect existing references when removing one.

Feature history must support a unified design timeline or aligned parallel lanes per component definition. Preserve each feature's global horizontal position with gaps in other lanes. Lane hiding merges its events into the top root lane; restoring/unifying must never lose or reorder events. Bound expanded height, provide vertical scrolling and retain component names during horizontal scrolling. Provide Previous/Next feature controls, including the empty origin state, using the existing non-destructive history inspection and expensive-compute safeguards.

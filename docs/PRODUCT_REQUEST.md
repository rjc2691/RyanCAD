# RyanCAD product request

**Revision 2 — October 23, 2026. Implementation authorized by the owner's subsequent request to create this product.**

## 1. Mission and authorization

Build a precise, beautiful, information-centered CAD application for functional 3D-printed parts and multi-component designs. It should be easy to design manually and equally accessible to external AI agents through the same modeling operations. Editable intent, trustworthy information, responsiveness, and recovery matter more than feature count.

The owner has approved implementation. Build Phase 1 in the milestones defined in the roadmap. Do not silently remove essential requirements when a technical choice proves difficult. The [implementation record](IMPLEMENTATION_STATUS.md) tracks evidence and remaining release gates without changing these requirements.

The initial real-world target is a multi-part 3D-printed tool for making a silicone mold that will subsequently form small concrete objects. Close-fitting removable parts, shared dimensions, alignment features, and clearances must therefore work in Phase 1. Windows and the owner's MacBook Pro are equal targets. The project is for personal use now, with future distribution options kept open.

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

Keep component size, volume or planar area, surface area where applicable, count, units, and health easy to see. Assembly statistics distinguish quantities from unique definitions. Hide/show is a display choice and must not silently change the bill of parts or export selection.

Every metric identifies its scope, units, revision, and freshness. Mass and cost require explicit material/process assumptions. Prepare for assembly cost-change analysis, but defer the material/cost library to Phase 2.

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

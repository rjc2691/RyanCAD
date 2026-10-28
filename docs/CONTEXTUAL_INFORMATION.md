# Contextual information and dimension display

## Product direction

RyanCAD should bring the most useful facts to the geometry being inspected. The goal is fewer trips through lists and fewer exploratory clicks, while keeping the model readable. The current direction places measured values directly on object faces near the associated edge or feature. Text follows the face orientation, including skew and foreshortening; rotating the model reveals dimensions that are hard to read from an oblique view. External extension lines and label cards are replaced by these surface labels. A large face-area card should not automatically take precedence over the dimensions that explain the shape.

Build this as an extensible information-selection service. Measurement providers supply trustworthy candidates; a mathematical policy ranks them; a layout stage chooses a small readable set. Neither the list of candidate types nor the scoring weights should be embedded in individual selection-event handlers. This direction applies to solid and planar fabricated parts and, later, assembly fits, manufacturing properties, and change-impact information.

## Implemented foundation

`frontend/src/measurements/MeasurementService.ts` is a pure TypeScript module. It runs without React, Three.js, a browser, a CAD worker, or an AI model. It owns providers, weighted ranking, recent-interaction memory, repeated-information grouping and selection stability. `SurfaceMeasurements.ts` provides the current surface-placement policy, with projection and visibility supplied by the viewport adapter. The earlier external-guide placement method remains available for comparative policy tests; the live viewport uses surface placement. `MeasurementOverlay.tsx` adapts the live view to that contract and draws SVG annotations. Other UIs can implement the projection/visibility adapter without changing the CAD document or the ranking policy.

The service considers all native edges, face areas, and local overall extents of the currently inspected component instances. It scopes candidates to the selected and hovered instances; selected or hovered groups include their physical descendants. It does not enumerate every possible relationship across an entire assembly. This keeps the initial analysis useful and bounded. New relationship providers can expand that scope deliberately.

Initial providers:

| Candidate | Authoritative value | Display |
|---|---|---|
| Straight-edge length | Kernel edge length | Face-aligned text inset near the measured edge |
| Curved-edge length | Kernel curve length | Face-aligned `L` readout on an adjacent planar face when it fits; exact curve length also appears in the hover box |
| Overall local X/Y/Z span | Kernel component bounds | Plain on-face value when its native bounding span lies on a real face; component-local axis details remain in the measurement description |
| Focused face area | Kernel face area | On-face `a=` value when it earns space; always also available in the inspector |

Values remain canonical mm/mm² until display formatting. Screen-space distances only assess visibility and readability. Occurrence transforms and exploded-view offsets position the annotations; they do not change measured values. Native mesh triangles locate and clip surface labels, while kernel metadata supplies the numerical measurements. Overall bounds are not automatically a material thickness, feature dimension, or editable parameter. The current thin-part signal is a relevance heuristic, not a fabrication inference.

## Ranking policy

For candidate `c`, the initial score is a weighted sum:

`S(c) = 62 selection + 43 hover + 14 recency + 16 legibility + 24 information + 19 thinPart + 9 stability - 9 competition - visibilityPenalty`

Each named signal is exposed in diagnostics. Most positive signals lie between 0 and 1. The information signal deliberately assigns face area a negative value when more directly descriptive spans are available. The numbers are initial tunable policy, not learned coefficients or claims of universal optimality.

- **Selection/hover:** direct entity interest outranks part context. Planar-face relevance also considers nearby boundary edges and overall spans. Boundary association uses planar/bounds proximity as an attention hint; it is not a persistent topology reference used for editing.
- **Recency:** selected and dwelled-on entities receive a decaying interest bonus, `strength × exp(-elapsed / 12 seconds)`. Memory holds at most 48 interactions and resets when geometry changes. It is session-local view state.
- **Legibility:** a span that projects to a readable length gains priority; nearly end-on spans are excluded.
- **Information:** lengths generally explain a part more directly than area; curve length is labeled distinctly.
- **Thin-part relevance:** relatively small overall extents receive a bonus, helping surface the thickness-like dimension of a plate.
- **Stability:** a small bonus favors already-visible candidate identities. It reduces attention jumping while allowing stronger new interest to win. Placement itself still needs further smoothing work.
- **Competition:** parallel, equal-length spans in the same instance are grouped; repeated groups incur a bounded logarithmic penalty. Equal lengths along different directions remain distinct. This display grouping never links parameters or changes design intent.
- **Visibility:** the adapter checks a maximum of 64 promising candidates with mesh ray tests. Fully hidden candidates are excluded; partial visibility reduces priority. Clipped and out-of-view geometry is considered. These are rendering heuristics, not exact visibility certificates.

The service exposes a provider registry and a weighted signal registry. `explain()` returns candidate scores and contributions. Current diagnostics are also attached to the SVG for automated verification. A polished user-facing explanation panel and an external read-only inspection protocol are future work.

## Layout and interaction

Hover highlighting is immediate. Hover dimensions wait approximately 180 ms to avoid flashing annotations while crossing the part. Surface placement allows up to five hovered or eight selected dimensions, and at most four per planar face. These are maxima rather than targets; duplicated spans, insufficient surface space and occlusion commonly reduce the count. Group selection shares the same overall budget across its physical descendants.

The surface policy searches adjacent planar faces, positions along the edge and several inset distances. Candidate attention scores remain inspectable. Surface options add camera-facing legibility and focused-face relevance, and favor short insets and central positions. Glyph footprints must fit inside the native face tessellation; bounding boxes alone do not establish containment. Text is clipped to the projected face triangles so it cannot paint across a hole or beyond the face. Screen-space label bounds reject overlap with other labels and protected controls. Cached native triangles reduce repeated allocation during placement.

Labels use the projected face basis, not a billboard or a simple text rotation. In the current orthographic viewport this SVG affine transform exactly matches the face plane, including skew and foreshortening. The largest projected plane scale bounds nominal text size, so an end-on edge compresses text rather than stretching its height. Outlines provide contrast without a separate backing card, dimension line or leader. Nearly edge-on/back faces, labels too small to read, and occluded footprints are omitted. The adapter tests the four corners and center against visible model surfaces; this is bounded sampling, not a per-pixel depth certificate. Exact depth masking and perspective-camera homographies remain future renderer work.

This pass places text on planar faces only. Curved edges can receive an `L` label on an adjacent planar face; a curved surface is not flattened into a false plane. The existing entity/component hover box also shows a hovered edge's exact native length, with current display units and explicit Curve length wording for curves. This remains useful when the face cannot accommodate a readable label. The inspector retains measurements at every orientation.

Camera motion updates projections and surface choices. Selection, hover, group scope, label fitting and unit conversion are local read-only view state; they do not create modeling commands or history entries. Annotation continuity, larger-assembly performance and denser policies still need evaluation with real modeling tasks.

Measured annotations are read-only. They must not imply that a derived overall extent can be edited as a single feature parameter. Direct parameter editing remains an explicit inspector/tool action until unambiguous parameter-to-annotation bindings are implemented.

## Growth path

### Next Phase 1 refinements

- Refine scoring and placement against actual modeling tasks, rotated parts, close fits, and crowded assemblies.
- Add explicit per-view pin, dismiss, and show-more controls so the user can override automation.
- Improve continuity of surface placement, depth masking and large-model frame time; consider wrapping labels on curved surfaces when the geometric meaning remains clear.
- Add exact diameter/radius and angular providers when kernel/feature metadata supports them; preserve the distinction between measured output and controlling input.
- Track annotation latency, candidate/visibility work, frame-time impact, and stability on larger fixtures. Current small-fixture tests do not establish large-model performance or macOS behavior.

### Phase 2

Add fit/clearance, tolerance urgency, hole-pattern summaries, sheet thickness, kerf context, material/mass/cost, and parameter-change impact as providers with explicit scope, revision, units, assumptions, and confidence. Explore compact repeated-feature descriptions such as a hole count plus diameter rather than many identical labels. Extend interaction memory to recently edited parameters/features and task context. Add inspectable user preferences and a read-only contract for other UIs and external agents to request candidate explanations.

### Phase 3

Use motion/joint context, interference risk, manufacturing studies, and broader design tasks to rank information. Consider a learned or personalized ranker only if evaluation demonstrates an improvement over the transparent weighted baseline. Preserve deterministic fallback behavior, manual overrides, and explanations of why information appeared. An AI chat interface is not required for this system.

## Validation and limits

`node --test scripts/measurement_service.test.mjs` covers the plate/thickness case, direct selection versus recency and repetition, recency decay, numerical grouping, area competition, visibility/end-on rejection, collision/budget constraints, unit conversion, curve-versus-chord semantics, and provider/weight extension.

`node --test scripts/surface_measurements.test.mjs` covers skew/foreshortening, bounded glyph scaling, rotation without changing values, holes and off-plane rejection, occlusion/backface/edge-on filtering, surface fit, collisions, the expanded budget, duplicate suppression, grouped selection and inches. The historical external-guide browser helper predates the universal tool workspace and is not the acceptance check for this presentation. Current live evidence uses the owner's existing grouped design without saving changes: six labels on two physical parts, individual edge hover with length, and camera rotation. Screenshots: `artifacts/surface-dimensions-group.png`, `artifacts/surface-dimensions-edge-hover.png`, and `artifacts/surface-dimensions-rotated.png`.

This is a weighted, explainable first version. It does not yet measure arbitrary entity-to-entity distances/angles, infer true wall thickness, display exact hole diameters, learn from behavior, pin dimensions, rank manufacturing warnings, or expose the view policy through MCP. Those capabilities require additional providers and interaction design; the foundation is built to accommodate them.


## Operation workspace integration — October 24

The unified tool workspace temporarily replaces ranked read-only dimensions with Tool Origin/Profile/Path guides and editable size inputs. This keeps controlling inputs distinct from measured bounds. Normal measurement ranking resumes after Apply/Cancel. Native vertex selection now provides exact operation anchors. Inline diameter/radius inputs control recipe parameters; they do not imply a new read-only diameter provider. The edited component stays opaque, inactive components become transparent, and preview roots swap atomically. Face reference highlights use boundaries during setup to avoid competing translucent fills. Selection overlays have their own buffers and lifetime; updating interest or references does not rebuild the part. Inspector and tool panels share a width so their transition does not disturb annotation projection. The earlier measurement browser script's material-creation steps predate this workspace; current creation regression is `scripts/ui_operation_check.mjs`. See [UNIFIED_OPERATIONS.md](UNIFIED_OPERATIONS.md).


## Workspace layout integration

The fixed statistics strip below the viewport was removed. Component counts live in Design structure; material volume and area live in the inspector with explicit part/assembly/design scope. Revision and Undo/Redo live in the bottom timeline. Measurement-label exclusion regions and operation-input bounds now reserve the lower navigation/selection controls, leaving the reclaimed viewport space available for geometry and useful annotations. UI copy is factual; decorative slogans and generic placeholder intent are omitted.

## Click-target visibility

The cyan hover target and its compact pointer label identify what a click will select. They are interaction cues, separate from ranked measured dimensions. Orange records active component/group context; dark blue records the selected face/edge/vertex; vertex shape and stroke weight provide additional differentiation. The target label names entity/component, reflects Shift toggling and explicit pick roles, and disappears during plane-point placement or navigation. Overlay creation/disposal retains independent buffers and releases owned vertex textures.

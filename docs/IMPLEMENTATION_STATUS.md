# RyanCAD 0.1 implementation and acceptance record

**October 24, 2026. Owner-authorized implementation; working development preview. Phase 1 release is not yet declared complete.** The product request and acceptance criteria remain the target. This record separates implemented behavior, demonstrated evidence and remaining validation.

## Delivered application

Toolbar and timeline follow-up: Tool uses the same button styling as the other operations. Move uses M; Group uses G, with Shift+G retained for grid visibility. Lane names are bordered rectangular start nodes connected to their tracks, without full-row label separators. A single Now marker follows the active visible component lane or falls back to the design lane. Browser checks verified both shortcuts, label/track alignment, and selection-driven Now placement; history model tests and TypeScript/Vite passed.

The Python engine, native OCCT evaluator, PlaneGCS adapter, durable project store, local API, external MCP server and production web interface are implemented. The interface runs from bundled files with no cloud/model/chat dependency. A working Windows environment, launchers, locked dependencies, installable wheel, examples, test corpus, documentation and Windows/macOS CI configuration are present.

Available modeling includes primitives, planar regions with holes, general bounded sketches/constraints, extrusion/cuts, revolve, holes/patterns, semantic edge fillets/chamfers, Booleans, mirrors, exact transforms, component arrays and linked/independent parts. Planar stock preview remains non-authoritative. Initial disconnected additive constructors get components; regeneration that splits a part is rejected safely.

Ordinary dimensions are private numeric values; the Parameters window lists only deliberately named values. Explicit named expressions preserve stable identities and reject cycles or incompatible units. Geometric references to other components become operation-owned snapshots, while sketch-local constraints remain. Cross-component fit constraints are disabled. The October 28 simplification supersedes the earlier parameter-navigation and live-reference policies recorded below.

Native work is isolated and cancellable. Commands use revision checks and idempotency keys, previews preserve exact candidate identities, and only durably committed revisions are reported saved. Agents join the visible live session, with authored history, follow/step/pause/revoke controls and inspectable atomic batch steps. Recent failed/cancelled jobs appear as diagnostics rather than successful features.

## Simpler references and named values — October 28

Accepted operations capture external geometry and relative frames as independent snapshots. Source edits, movement and deletion do not change the accepted result. Legacy references are detached before the next accepted edit, preserving the existing visible geometry and history. Optional named values have a simple management window and compatible autocomplete in dimension fields; Tab cycles matches, mouse selection and scrolling are supported. Known named dimensions show `p:` and a full-name tooltip, including saved sketch constraints. The redundant New parameter toolbar button and cross-component fit controls are removed.

Validation: 211 Python tests and 136 frontend tests passed. Native cases cover migration of previously moved world-origin parts, copied-body independence after source deletion and native-worker restart, explicit named-value regeneration, and retained sketch constraints. The isolated browser test covers parameter creation, Tab cycling, scrolling/mouse selection, real component movement, named-value edits, and inline sketch dimensions saved and reopened with provenance. A separate journal copy of the owner's current design verified that Component 2 moves 5 mm while its local geometry remains unchanged; the original design was not edited. See SIMPLE_DESIGN_INTENT.md for storage compatibility and annotation coverage.

## Independent workspaces and designs — October 28

Browser profiles receive persistent workspace identities; each workspace contains separately journaled designs. The sidebar workspace manager creates, selects, renames, deletes and restores designs, and provides a recovery code for another browser. Reference examples and native imports become separate designs. The existing server project remains intact and can be copied with its full history. Each tab, native request, preview, job, geometry response and download remains bound to its chosen design; MCP connectors can pin the same workspace and design. Workspace identity is not an account or access-control feature.

The Python suite passed 202 tests, including simultaneous geometry jobs, isolated STL downloads, durable restart, deletion/restore, legacy copying and native archive history. The frontend suite passed 134 tests. An isolated browser check covered separate profiles, per-tab selection, create/rename/switch, refresh, delete/restore, recovery and independent reference examples. Windows extended-length project paths are used for deeper workspace folders and verified by the STL export test.

## Windows notification icon — October 28

The Windows launcher creates a native notification-area icon with Open and Quit actions and a port-specific tooltip. Quit requests normal server shutdown, removes the icon and connection file, and leaves accepted edits saved. The PowerShell launcher also accepts `-Background` for a hidden process, with an occupied-port check, and `-NoBrowser` to suppress opening a tab. The Windows API implementation has no new runtime dependency and is disabled on other operating systems or with `--no-tray`.

The native tray tests exercised registration and command dispatch; an isolated end-to-end check quit and restarted the server, verified persisted design edits, and checked background launch with spaces in the project path. `scripts/check_windows_tray.py` reproduces the Windows-only integration check.

## Unified operation workspace — October 24 update

### Design collections, tool workbenches and history lanes — October 27

Added Components, 2D Sketches and 3D Tool Bodies collections. Tool-purpose solids use private working frames with parameterized operations and reusable body-profile selection; library geometry is excluded from assembly display/counts/measurements and native STL export. Empty constructive targets accept a first solid. Native role/placement guards keep tools out of the component hierarchy, and consumer-aware deletion protects live references.

Feature history now toggles between unified and parallel owner lanes with stable global columns, sticky names, per-lane merge into root, restore controls and bounded vertical scrolling. Previous/Next feature navigation includes an empty Origin prefix and preserves costly-compute confirmation. Live isolated checks verified workbench construction, library preview, unchanged part counts, exact column alignment, merge/restore, scrolling and Origin/Current stepping. Architecture and limitations: TOOL_BODIES_AND_HISTORY.md. Native regression: 54 tests; frontend regression: 116 tests; TypeScript/Vite passed.

### Tree drag-and-drop and contextual creation — October 27

Components/groups can be dragged by name into groups, to another part's containing level, or to the design root. Pointer drag feedback guards invalid destinations and accidental post-drag clicks. group.reparent preserves source world matrices through inverse destination placement, remaps descendant occurrence references, and rejects cycles, no-op moves and ambiguous shared/patterned membership. group.insert creates an empty part/subgroup under a specific placed container, with unique default names. Existing durable command/history machinery handles both commands. Expanded branches and edit scopes follow occurrence remaps.

Group context menus add a component or subgroup; part menus wrap that part in a new sibling-level group. Design context menus create root items. The old standalone creation button is replaced with an inline tree insertion row at the selection's sibling level (edit scope when unselected). Pending tool/move/sketch/group/history work blocks organization edits.

Validation: ten native group tests and 111 frontend tests passed, with TypeScript/Vite. A separate native project on port 8831 verified drag into a rotated group, drag back to root, empty part/subgroup creation, wrapping an existing part, inline insertion placement, and organization Undo/Redo; the owner's project was not modified by these tests. Evidence: artifacts/tree-organization-workflow.png. Native tests cover transformed nested descendants, occurrence-reference remapping, empty geometry, cycle/shared/no-op rejection and preserved world placements.

### Workspace-rooted component browser — October 27

Removed the top-header workspace/design breadcrumb. The sidebar now contains Local Workspace, an inline-editable current design name, scoped document counts, and an expandable component tree with depth-first ownership order, indentation, branch guides and keyboard navigation. Group expansion is independent of edit scope; entering a nested group preserves all tree rows and opens its ancestors. Tree rows select their exact occurrence while viewport picks retain existing group-scope rules. Workspace management itself is not introduced.

TypeScript/Vite and all 109 frontend tests passed, including new nested-tree order/collapse/nonmutation cases. Live checks on revision 141 verified two-level expansion, full tree preservation during nested group editing, direct nested-part selection, and cancelled inline design rename without saving. Evidence: `artifacts/workspace-component-tree.png`.

### Face-aligned contextual measurements — October 27

Replaced external viewport measurement guides with face-aligned text near the measured boundary. SurfaceMeasurements adds projected face-basis text with skew/foreshortening, native triangle containment/clipping, bounded text sizing, protected-control/label collision checks, backface/edge-on filtering and sampled footprint occlusion. Attention ranking remains in MeasurementService; surface options add focused-face/legibility scores. Budgets expand to eight selected/five hovered labels, capped at four per planar face, and group selection includes physical descendants. Exact edge or curve length also appears in the entity/component hover box. Native numerical values, instance transforms and unit semantics remain independent of text layout.

The initial pass supports planar label surfaces; curved surfaces retain hover/inspector information, and suitable adjacent planar faces can carry curve-length labels. Live checks on revision 141 showed six labels across a grouped pair, a hovered 20 mm edge in its information box, and changing skew during camera rotation without document edits. Six new placement regressions cover geometry fit/holes, projection/rotation/scaling, occlusion, budgets/collisions, grouping and inches. Full frontend suite: 107 passed; TypeScript/Vite passed. See CONTEXTUAL_INFORMATION.md for renderer limitations and growth path.

### World-axis arrow shortcuts — October 27

Added Up/Down → Z, Left → Y and Right → X while the active operation accepts a path/direction reference. The Tool and Move panels expose current eligibility so the global keyboard listener uses current workflow state. Editing controls, composition, modifier chords, non-direction reference picks, native finishes and non-travel tools retain their arrow behavior. Live checks verified all four mappings plus numeric-field and origin-picker guards; the preview was cancelled at revision 133. TypeScript/Vite and all 101 frontend tests passed.

### Main viewport world-axis reference picking — October 27

Main world X/Y/Z lines now share the corner-axis selection handler for Tool Path and movement reference directions. Six-pixel raycast tolerance, origin exclusion and model-surface occlusion preserve point/geometry picking. Hover identifies the axis and highlights it; the chosen operation axis uses Tool Path blue. Explicit non-path tool pick slots and sketch editing retain their existing semantics. Live checks selected X, Y and Z from the main viewport during one pending operation and verified each direction in the panel; cancelled without saving. Evidence: `artifacts/main-world-axis-path.png`.

### Tool Path vertical layout and introduction — October 27

The travel distance/percentage input now appears directly underneath the target-point reference card, rather than beside it. Target-derived projected travel uses the same vertical position. Added the requested explanatory paragraph at the top of the scrolling Tool Operation panel. Path Direction and its adjacent Reverse checkbox remain unchanged.

### Path Direction and target-adjacent distance — October 27

Renamed the direction group to Path Direction and placed Reverse reference direction directly beneath its dropdown. Manual distance/percentage and units now sit beside the travel target-point reference; selected targets show read-only projected travel in that same position. Full-path actions remain with the travel inputs. Native finishing retains its existing whole-edge/target-limit behavior.

All 101 frontend tests and TypeScript/Vite passed. Live checks verified the dropdown/checkbox adjacency, side-by-side reference/distance layout, reverse preview and target projection. Test previews were cancelled. Evidence: `artifacts/path-direction-target-distance.png`.

### Compact path extent units — October 27

Removed the extra Extent label, Distance/Percent segmented controls and the finite-path/signed-travel help paragraphs. The travel value now has an adjacent mm/% dropdown, followed by the existing parameter-reuse control. Percent remains unavailable for implicit infinite paths; finite-length data, full-path and target behavior are preserved. Shared ParameterInput supports an optional inline units control without changing other fields. All 101 frontend tests and TypeScript/Vite passed. Live checks verified a 50% preview on a 5 mm edge and switching back to 2 mm, producing the expected 0.6/0.48 cm³ additions. Previews were cancelled without saving. Evidence: `artifacts/compact-path-extent-units.png`.

### Reference-only Tool Origin controls — October 27

Removed Pick world origin, Origin Type, Reference point/Exact coordinates switches and World X/Y/Z origin fields from the operation panel. Human operations now start from an implicit semantic reference, defaulting to world origin when there is no geometry reference; revolve/helix presets also use world-origin references plus offsets. The existing viewport origin picker and U/V/N offsets provide exact placement. Derived path/body origins remain implicit. Legacy coordinate recipes/API input remain supported without changing saved designs.

All 101 frontend tests and TypeScript/Vite passed. Live checks verified the removed controls are absent and world-origin selection with offsets (4,5,6) produces a valid preview. The preview was cancelled at revision 133. Evidence: `artifacts/reference-only-tool-origin.png`.

### Path selection restricted to one component instance — October 27

Tool Path acquisition locks to the first path body's placed occurrence; native corner finishes lock to the active target. Other components and other linked instances cannot be appended or substituted until a general path is explicitly cleared. The viewport filters their hover/click eligibility while picking a path, and rejected picks leave the draft, reference selection and valid preview unchanged. Face-to-boundary expansion follows the same ownership guard. Origin/profile/travel-target acquisition retains its separate reference semantics. Frontend draft validation and native creation/regeneration reject mixed-component path lists.

Regression coverage includes foreign edge replacement and Shift append, linked copies, face expansion, non-path reference roles, retained same-body multi-selection, external-body sweep acquisition and native saved-recipe validation. **49 targeted backend tests** and **100 frontend tests** passed, plus TypeScript/Vite. Live checks on revision 133 verified a foreign edge/face leaves one selected edge intact and another edge on the original body produces a valid two-edge finish. All test previews were cancelled. Evidence: `artifacts/path-component-selection-guard.png` and `artifacts/path-component-current-project-check.json`.

### Component grouping and direct toolbar — October 27

Group replaces the empty-assembly creation workflow with a fixed-width side panel, member checkboxes/viewport picking, named creation and adding to an existing group. Groups use existing assembly ownership. Selection and hover resolve to the nearest closed group; orange outlines cover its physical descendants. Double-click in the main viewport/tree enters a group, with scoped tree contents, muted outside parts and Done/Escape exit. G moves groups using the existing live preview flow and may use descendant origin points. Copy group clones nested container structure/instance placements while sharing physical part definitions. Ungroup and membership changes preserve world poses, remap native occurrence references and participate in normal history/recovery. The former local-transform Assembly ownership dropdown is removed.

All tools is removed. Redundant shape/motion shortcuts stay within the universal Tool. Remaining distinct actions now have compact direct toolbar buttons, including group, arrays, stock, parameters, fit, measurement and checkpoints; command search remains available. Full labels/tooltips and horizontal overflow keep actions accessible in narrower windows.

Native validation includes unchanged placement bindings and evaluated geometry/references after grouping, moved/rotated group membership and ungroup transforms, nested independent group structure with linked part geometry, descendant-origin movement and guarded mixed-level/shared membership. All **175 backend tests** and **98 frontend tests** passed, with TypeScript/Vite build checks. Isolated browser checks created a plate/pin group, double-clicked into its parts, applied a 12/5 mm group movement, copied it, added the remaining pin to the moved original group, and ungrouped/undid the copy. Documentation: [GROUPS.md](GROUPS.md). Evidence: `artifacts/component-groups-check.json`, `component-group-selected.png`, `component-group-editing.png` and `component-group-current-panel.png`. The live app was restarted/refreshed and the existing Assembly 1 was verified as an available destination; member-selection checks were cancelled without saving. The canonical document hash remains unchanged at revision 131 with six features (`artifacts/component-groups-current-project-check.json`). The refreshed wheel matches final backend sources and bundled frontend.

### Dedicated main-viewport sketch workflow — October 26

Sketch now has a toolbar button and E shortcut. `SketchPanel`, `SketchGuide` and `sketchModel` replace the removed full-screen `SketchEditor`. The main viewport aligns to world or picked planar-face frames, retains muted reference components, shows adaptive grid/U/V axes, snaps endpoints/midpoints/origin and draws provisional measurements. Line chains, rectangles, circles, center arcs, points, selection, copied projection, exact U/V/geometry fields, construction state, local undo and native relationships are available in the side panel. Finish/Cancel restore camera position, target, up, zoom and frustum. Plane acquisition temporarily permits orbit and standard views.

New sketches belong to the design root and appear separately from components. They create no physical count or material/export geometry. Root profiles evaluate independently before bodies; explicit frames, open geometry, nested holes and disconnected closed regions are supported as construction. The unified material tool currently requires one closed region per sketch. Selecting Draw profile or E during a pending tool uses the same workspace, suspends its preview and preserves its mounted draft. Finish attaches the saved sketch; Cancel restores the prior tool unchanged. Existing component-owned sketches retain legacy ownership.

Validation: all 170 backend tests and all 94 frontend tests passed on the final code, with TypeScript/Vite build checks. Isolated interactive checks saved a 20 × 12 mm root rectangle without creating a part, used it to build a 1,200 mm³ extrusion, reopened both saved sketches, and drew a circle in the main viewport from a suspended tool, returning to a validated removal preview. Final browser checks also verified copied construction projection, exact (1.25, 2.75) point entry despite 1 mm grid snap, camera restoration within 1.5e-13 orientation pixels, and cancellation preserving a Circle tool with 7 mm extent. A dedicated regression prevents previous origin offsets from being applied a second time when attaching a newly drawn world profile. Evidence: `artifacts/sketch-workspace-check.json`, `sketch-workspace-projection.png` and `sketch-cancel-preserved-tool.png`. The current saved design at revision 119 with three features remains canonically unchanged after live sketch previews were cancelled (`artifacts/sketch-current-project-check.json`); `artifacts/sketch-workspace-current-design.png` shows the new workspace on its selected planar face. The refreshed wheel matches final engine sources and bundled frontend. See [SKETCH_WORKSPACE.md](SKETCH_WORKSPACE.md) for workflows, boundaries and follow-up decisions.

### Profile switching and drawing acquisition — October 26

Changing Tool Profile Shape now replaces the active acquisition mode: Draw Profile enters drawing, and every other shape exits it immediately without requiring a separate cancel. Incomplete/drawing drafts clear the displayed native candidate and rendered-token readiness. Switching shape also drops the previous shape's solid preview; ordinary dimension edits retain the existing candidate while the replacement builds. Superseded native results remain guarded by draft signatures. Live verification covered Selected face → Draw profile → Circle, confirming restored source geometry while drawing and a valid circle-extrusion preview after switching, followed by cancellation at saved revision 118. All 88 frontend tests and TypeScript/Vite build passed. Evidence: `artifacts/profile-switch-fixed.png`.

### Tool travel targets, full paths, native corner sections and face boundaries — October 26

World origin is now selectable from the center of the corner indicator and from the operation reference controls. Tool Path has an independent Travel target point picker with clearing, world-origin selection, target/endpoint projection guides and evaluated travel distance. New recipe v4 resolves semantic target references into signed straight travel, native sweep arc length, or axial helical rise. Blank distance/percentage plus no target means the full finite selected path; an implicit normal/axis remains incomplete until a distance or target is supplied. Legacy constructors and saved recipe versions retain their former distance behavior.

A face selected while the path/finish-edge picker is armed expands to its exact native edge signatures, preserves profile/component intent and uses existing group/connectivity/64-edge checks. Face holes can supply separate loops; continuous sweep still needs one connected path. Fillet/chamfer profiles now come from actual source/result planar-section differences at an interior station perpendicular to the primary selected edge, with native area and removed/added effect. The former square schematic is gone. A single straight-edge finish can stop at a target, using exact clipped native finish material and a planar end cap; curved/multiple-edge partial requests are explicitly guarded.

Validation includes target-regeneration from changed source dimensions, signed world-origin targets, full native path lengths, curved-path arc-length projection, native fillet/chamfer section area/planarity, straight partial-finish volume, helical target rise, face boundary membership and semantic world-origin references. Interactive tests verified 22 mm face-target extrusion, blank full 10 mm path travel, origin/target picking on the corner center, face-to-four-edge path expansion, actual rounded section display, and exact-token commit of a 5 mm partial fillet (3995.707963 mm³ remaining volume). Evidence: `tool-target-workflow-check.json`, `tool-projected-target.png`, `native-fillet-section.png`, `face-boundary-fillet-path.png`, and `target-limited-fillet.png`.
Final verification: **164 backend tests** and **88 frontend tests** passed, with TypeScript/Vite build checks.

The running application was also checked against the current two-part design: a world-origin target produces signed −5 mm travel, native corner sections remain perpendicular to the edge, and selecting a top face supplies all four boundary edges. All main-project checks were cancelled previews. The canonical document hash remains unchanged at revision 118 with two features (`artifacts/tool-target-current-project-check.json`). Current-design screenshots: `artifacts/tool-target-current-design.png`, `artifacts/native-section-current-design.png` and `artifacts/native-chamfer-face-path-current.png`.

### Midpoint snaps, selectable world axes and reference-card styling — October 26

Move now exposes exact native edge midpoints as point targets with named hover/selection treatment, including curved-edge halfway points. It retains ordinary edge-direction selection away from snap points and converts midpoint hits back to edges for Rotation/explicit direction picks. World X/Y/Z are available in direction/axis cards and on the camera indicator, enlarged from 88×82 to 132×123 pixels. The indicator starts Move when necessary and preserves an axis picked before component acquisition; within material operations it sets world travel direction while leaving native edge finishes guarded.

Movement distance automatically fills from reference displacement/projection and remains separate from exact override inputs. It follows reference and axis edits, preserves signed projection, and can be restored after editing with Use inferred distance. Origin/target/direction cards now share operation-panel pick controls and use amber/blue/violet colors matching viewport roles, role icons, pointer affordances, picking borders and clear controls.

Verification: **151 backend tests** and **85 frontend tests** passed; TypeScript/Vite passed. Interactive browser checks verified corner-axis launch/acquisition, midpoint source/target picks, signed automatic prefill, X→Y/Z updates (40→21/14 mm), explicit 12 mm override and restoration, panel/corner axis synchronization, true world-axis rotation, material-operation path selection, 132×123 sizing, and one exact inferred 14 mm Z move. Evidence: `midpoint-world-axis-preview.png` and the axis/midpoint verification record.
The refreshed live app was visually verified with native midpoint origins/targets, world X direction, matching reference cards/icons, and a signed −52.5 mm inferred field. The preview was cancelled; the canonical document hash, revision 114 and all 23 features remained unchanged (`artifacts/axis-midpoint-current-project-check.json`). Final screenshot: `axis-midpoint-current-design.png`. The packaged wheel matches the verified source/build.

### Inferred reference movement and true axis rotation — October 26

This update supersedes the four-method movement UI below. The selector now contains Reference movement (default), XYZ distances and rotation, and Rotation. Direct point/face picks on the active occurrence set origin; outside point/face picks set target; straight edges set direction. Whole-component picks retarget and reset old inputs. Explicit point/reference pick controls override inference for one successful pick, allowing edge endpoints/midpoints or component origins. Every reference and the active component can be cleared. Optional exact distance overrides alignment; clearing it or any reference re-infers the motion. Result measurements now remain in the fixed footer.

`instance.move` implements the same reference inference for external agents. Rotation uses a straight line at its actual location, with a live angle parameter and a camera-projected rotation arc. The shared placement evaluator supports a parameter-backed axis-angle delta; subsequent placement edits snapshot the evaluated pose through a gimbal-safe conversion. Existing native files without a rotation delta retain their exact behavior. Legacy explicit point/direction/projected commands remain accepted.

Verification: the **full backend suite passed (145 tests)**, including 24 movement tests, native preview/commit/undo, live angle regeneration, nested/repeated rotation, ±90° placement follow-up, exports and native storage. **81 frontend tests** and TypeScript/Vite passed. Interactive browser checks verified default reference mode, source vertex/target vertex/edge inference, exact-distance override and clearing, projected-to-point fallback, incomplete-preview clearing, component retarget/clear, actual-line rotation, angle arc, Apply/Enter and reload. Artifacts: `unified-reference-movement.png` and `component-axis-rotation.png`.
The live app was refreshed, and both unified reference and actual-edge rotation previews were verified against the current design, then cancelled. Canonical document hash, revision 114 and all 23 features stayed unchanged (`artifacts/unified-reference-current-project-check.json`). Current-design screenshots: `unified-movement-current-reference.png` and `unified-movement-current-rotation.png`. The packaged wheel matches the verified engine and frontend.

### Four movement methods — October 26

Move Component now launches on **G** (grid toggle moves to **Shift+G**). A selector at the top of the dock offers XYZ translation distances/rotation increments, exact point-to-point alignment, signed distance along a straight reference edge, and point displacement projected only along a reference direction. Inputs describe changes from the saved starting placement. Viewport/tree picks fill source, target and direction roles while the active component stays locked; method switching preserves useful references and chooses the next missing role. Picking fields re-arm specific roles. References use exact vertices, straight-edge midpoints/endpoints, curved-edge endpoints, face centers and component origins; curved direction edges are rejected.

The shared native `instance.move` command resolves local snapshot points through saved world occurrence matrices, converts displacement through the parent/pattern frame and creates independent parameter-backed placement results without overwriting unrelated shared placement parameters. Pure zero unused inputs do not add parameters. Absolute `instance.transform` remains available for agents. Movement references apply once; they do not create persistent assembly mates. The viewport uses amber source, blue target, mint travel and violet direction treatments. Projected movement shows actual travel, a dotted remaining gap and a numerical gap readout. Apply/Enter commits the displayed validated token; Cancel/Escape and Reset clear the draft movement.

Verification: **12 movement math tests**, **10 native API tests** (including movement preview preservation, projection, exact-token commit, geometry-feature preservation and undo), **78 frontend tests** and TypeScript/Vite build passed. Browser checks on the isolated movement project verified G launch, real source/target vertex picks, one-panel method switching, reference-direction acquisition on an inactive component, signed distance/reversal, successive nonzero offsets, preview-only preservation, Enter, Escape/reset and reload. A constrained X movement toward target (40,20,10) saved (40,0,0), showing the 22.361 mm perpendicular gap. Evidence: `artifacts/movement-point-to-point.png`, `movement-projected.png`, `movement-edge-distance.png` and `movement-projection-saved-check.json`.
The running app was refreshed and the new constrained movement preview was checked against the owner's design, then cancelled. Its canonical document hash, revision 114 and all 23 geometry features remained unchanged (`artifacts/movement-methods-current-project-check.json`). The packaged wheel matches the current engine and frontend build.

### Move Component and camera-following orientation — October 26

Move Component replaces the former precise-placement popup at all entry points and sits next to Tool in the toolbar. Its fixed-width side panel exposes parent-local position/rotation with expressions/parameter reuse, target acquisition, reset, native live previews and an Apply move/Cancel/status footer. Enter applies the exact current displayed candidate, Escape cancels, and invalid/stale previews cannot apply. It reuses the generic preview client with `instance.transform`; placement previews update retained mesh/picking transforms and also display dependent geometry changes through the existing native pipeline. Only affected instance placement is changed; linked geometry definitions are retained. Shared placement/pattern scope is disclosed. The world XYZ indicator now sits above the upper-right view buttons and follows actual camera orientation, including orbit.

TypeScript/Vite and **73 frontend tests** passed, including inverse-camera projection and retained placement/cancel/committed-matrix tests. The full material-operation browser regression passed after preview-client generalization. `ui_move_component_check.mjs` verifies real WebGL movement (old-location brightness 135.67 → 30, moved-location 135.67), no save during preview, invalid-field rejection, Escape/reset, Enter commit, linked-instance isolation, reload/undo, blank target acquisition, nested parent-frame movement and 1280/1100 layouts. Evidence: `artifacts/move-component-check.json`, `move-component-*.png` and `camera-orientation-orbit.png`.

### Compact operation form hierarchy — October 26

Origin Type (Reference point / Exact coordinates), Tool Profile Shape and Tool Path Type now sit above colored reference boxes. Reference point offset groups the U/V/N fields. Tool Effect Type replaces effect buttons with a dropdown; fixed native finishes expose a disabled Refine edge value. Extent along path has no separate divider. The active-component header strip and generic footer/commit prose are removed. Feature Name is in the fixed footer, followed by a single Apply operation / Cancel / preview-status row. Auto/ownership information stays with Tool Effect; target locking and keyboard behavior are preserved.

TypeScript/Vite passed. The full native operation browser workflow passed through the new selectors. `ui_operation_form_check.mjs` verifies selector placement, offset labeling, removed prose, dropdown eligibility/Auto/Remove, error wrapping/disabled Apply, Enter from Feature Name and horizontal footer alignment at 1600/1280/1100 pixels. Evidence: `artifacts/tool-form-check.json` and `artifacts/tool-form-*.png`. The live app was refreshed and visually verified; its canonical document hash, revision 108 and all 22 features remained unchanged (`artifacts/tool-form-current-project-check.json`). Backend geometry behavior is unchanged in this layout update.

### Panel extents, percentage travel and reference-name hover — October 26

Travel inputs now stay in **Tool Path → Extent along path**, directly below its reference group. Distance and Percent are peer choices. Native percentage resolves against the full reference edge/chain length during evaluation; sweeps support exact partial distance/percent, including curved and reversed chains. Percentage intent remains a parameter and follows source-length edits. Implicit normals offer measured distance because no finite total exists. Native rounding/beveling remain full-edge and say so. The floating editor and collision/docking machinery from the preceding iteration are removed; radius/diameter stay in Tool Profile.

Reference names/cards highlight exact entities using the shared cyan viewport-hover renderer. Numbered Face/Edge/Vertex labels are per component/current geometry revision and appear in lists, pointer labels and selection information. Same-revision IDs resolve display buffers directly; cross-revision references must match uniquely. Hover/focus does not change active selection, regenerate a preview or write history. Single selected references are listed too, with removal controls. Transient whole-component hover owns its outline buffers and does not dispose native assets.

Evidence: **119 Python tests passed in 62.57 s**, **69 frontend tests passed**, TypeScript/Vite build passed. `ui_path_extent_check.mjs` verifies the combined workflow, including **137 matching cyan pixels** for direct/list edge hover, no hover preview/edit requests, exact 35 mm travel on a 70 mm chain at 50%, native 12 mm sweep, invalid 71 mm rejection, Enter commit, parameter-driven 90 mm chain/45 mm travel after reload, and 1280/1100 layouts. Evidence: `artifacts/path-extent-check.json` and `artifacts/path-extent-*.png`. The full operation browser regression also passed. The refreshed live design retained the same canonical document hash, revision 108 and 22 features (`artifacts/path-extent-current-project-check.json`). The preceding floating-editor evidence below describes the superseded iteration.

### Tool-reference clarity and section layout — October 26

The size editor now searches clear viewport space around projected geometry and controls, retaining a safe location until it becomes blocked. Crowded/zoomed views dock the same field in a reserved panel-footer row, preserving typing and Enter/Escape. Coral crosshairs mark the origin, violet native loops/hatching identify face/sketch profiles (including holes), and violet body overlays identify placed solid tools. Native finishing uses a schematic perpendicular section plane. Blue paths distinguish direct/implicit/parallel relationships by line style; disconnected finishing edges remain separate curves. The active target remains solid and ordinary selections/hover keep their orange/cyan roles.

Origin/Profile/Path share source-controls → named-reference → count/status grouping. Header presets and Use world origin are removed. Profile shapes, Hole setup, and path motions expose the same capabilities in their relevant sections. Explicit zero coordinates remain supported. Selecting a closed profile updates its reference/card/count together and follows its origin unless pinned.

Evidence: **105 Python tests passed in 69.51 s**, **65 frontend tests passed**, production TypeScript/Vite build passed. The targeted browser suite verifies role colors, native outlines, actual violet body pixels, crowded-view docking with the same DOM input, keyboard cut/confirm/cancel, and 1280/1100 layouts. Full operation and grouped-selection browser suites also passed through the new controls, including custom sweep, helix, placed Boolean, undo/reload and Shift groups. See `artifacts/tool-roles-check.json` and `artifacts/tool-roles-*.png`. The live app was refreshed and visually checked on the existing design; the canonical document hash, revision 108 and all 22 features stayed unchanged (`artifacts/tool-roles-current-project-check.json`). These Windows/Edge development checks do not establish macOS or comparative-performance results.

### Distinct click targets and section-local feedback

Retained geometry stays orange; hover is cyan/pale with a dark halo, heavier edge/face boundaries and a larger vertex ring. Selected vertices use a smaller filled diamond. A pointer label names the entity/component and its click/Shift action; explicit pick requirements are reflected, and inline plane placement suppresses misleading object targets. Path-guide emphasis yields to hovered edges. Counts/instructions remain in Tool Path/Profile; the duplicate message at the top of the form is gone. Origin/support feedback stays in its own section.

`viewportHighlights.ts` owns role styling and safe overlay/vertex-map disposal. Five new unit cases cover contrast, draw order, native-buffer independence, marker resources and click-role intent. The browser regression `scripts/ui_hover_distinction_check.mjs` passed five checks with rendered pixel comparisons for selected/hovered/restored edges and vertices, exact click identity, Shift wording, section-local feedback and placement suppression. No browser errors or saved-design edits occurred. Evidence: `artifacts/hover-distinction-check.json` and `artifacts/hover-distinction-*.png`. Backend code is unchanged in this follow-up.

### Shift-click selections and grouped native motion

Shift-click now toggles actual faces/edges, including several entities on one component. Selections can precede T or update a draft. Connected paths are ordered/reversed by endpoint connectivity; native sweeps use the whole wire and reject gaps/branches. Native finishing supports edge sets. Coplanar/parallel face/sketch groups preserve relative position, holes and different plane heights under shared motion, with one feature and shared parameters. Incompatible groups block Apply and show removal controls. Active ownership remains locked.

Native recipe version 2 stores bounded group references while retaining version-1 compatibility. Additional coplanar faces on the same part receive distinct guarded signatures. Nested sources participate in evaluation/cache stamps and deletion protection. The connected-component ownership rule remains unchanged; splitting disconnected New results into separate components remains future work.

Evidence: full Python suite **102 passed in 72.37 s**; the subsequently expanded grouped-native suite **14 passed** (including multiple profiles sweeping together); frontend **50 passed**. The real Shift-click browser suite passed face toggles/removal, incompatible-plane recovery, a two-boss cut, grouped finishing, connected L-sweep, branch rejection/removal, native reload and multi-sketch extrusion preview. `artifacts/grouped-selection-check.json` and `artifacts/grouped-*-preview.png`. The existing full operation browser regression also passed against an isolated project. Inspector group counts, combined face area/edge length and plural finishing shortcuts are included. These are development checks, not a macOS or comparative-performance claim.

### Transparent context and locked editing target

Inactive components now use 20% surface opacity with depth writes disabled, keeping the edited part visible through surrounding geometry. The edited definition and linked instances remain solid; cancellation restores context opacity. Component/face/edge selection uses a stronger orange, with lighter amber for hover; tree accents and the viewport legend match. Atomic preview replacement and native reference picking are preserved.

The active selection and transient tool reference selection have separate client state. Tree, viewport, empty-space and timeline picks cannot switch the active component while a draft is open. The dock shows a static lock label and no target-switch picker. Implicit reference inference never binds/replaces the target, including a blank launch. External activity follow-selection is suspended during a draft. Changing active component requires Cancel and a new launch. Wire/API operation keys remain compatible.

Unit regressions: **39 passed**, including transparent-context restoration, orange reference styling, new-component focus and target preservation across reference types/presets. Two browser suites passed: the full native operation workflow and the rendering suite. The rendering suite additionally checks cross-component paths, locked tree/timeline selection, cancellation unlock and solid preview continuity.


### Earlier iteration: solid previews and continuous tool form

Tool Origin, Tool Profile, Tool Path and Tool Effect are persistent sections in one scrolling form. The shape selector and compact quantity fields replace the previous stage navigation. Validation and Apply/Cancel remain fixed. Inspector and tool panel share responsive width variables, including the structure-column width, so switching does not shift or resize the viewport.

Source meshes stay mounted across reference selections. Dedicated overlays own their buffers; tool face highlights use boundaries. Candidates load off-scene and replace the displayed root atomically, with only one filled surface drawn per occurrence. The edited definition and linked instances stay opaque in their component colors. Other parts are darkened. Stale candidates stay opaque and explicitly marked; confirmation still requires the latest validated, displayed token.

| Follow-up verification | Observed result |
|---|---|
| Frontend unit regressions | **36 passed**, including five new presentation/resource-lifetime cases. |
| `scripts/ui_solid_tools_check.mjs` | Pass: repeated native edge picks, 260/800 ms delayed mesh responses, **240 sampled WebGL frames** with no target brightness drop at the test points; inactive context stays dim and restores on cancellation. Reverting to a retained draft while another mesh loads restores Apply and prevents the obsolete response from replacing it. |
| Responsive panel bounds | Exact inspector/tool viewport-bound equality at **1800, 1280 and 1100 px**; all four sections retain values and Apply remains accessible. |
| Existing browser suites | Full operation workflow (8 checks), keyboard/path controls (7 checks), implicit selection/Auto (7 checks) passed. The implicit suite includes its deliberate expired-preview HTTP failure and no unexpected browser errors. |
| Production build | TypeScript and Vite passed. |

Evidence: `artifacts/solid-tools-check.json`, `artifacts/solid-tools-current-design.png`, and the existing operation-suite reports. This validates the exercised Windows/Edge workflows; it does not establish universal frame-time guarantees or macOS rendering results.

Material creation now opens a nonmodal **Tool / T** dock with Tool Origin, Tool Profile, Tool Path and Tool Effect in one scrolling form. Defaults cover face, edge, vertex, solid component, planar profile and empty selection. Target and reference roles stay separate. Hole placement uses a snapped plane and refinable offsets; inline polygons use a perpendicular/support plane. Native candidates and contextual size inputs stay visible during setup. Configuration switching stays within the same workspace.

`operation.create` creates parameter-backed recipes for straight travel, full-edge sweep, revolution, helix, no-motion planar/body operations, native fillet/chamfer, mirror and connected repeat. Rotated-instance references and implicit sketch planes participate in evaluation/cache keys. API/MCP capabilities publish the strict recipe schema. Exact preview commit retains IDs, attribution, undo and autosave. Invalid, stale, ambiguous or disconnected candidates cannot apply. Native intersection collections are normalized for unified and legacy operations/measurements.

Current limits include complete edge/chain sweeps without partial extents, constant-size multi-edge finishing, simple inline polygons, existing-component body tools and planar raised detail. General trajectories, curved wrapping, body sweeps, libraries, richer inline constraints, split-to-components repair and saved-recipe reopening remain work. [UNIFIED_OPERATIONS.md](UNIFIED_OPERATIONS.md) records launch flows, contracts, limits and extension points.

| Current verification | Result |
|---|---|
| Full Python/native/API/storage suite | **89 passed in 71.16 s** on Windows, including 21 unified-operation cases and exact-preview API coverage. |
| Node draft + measurement tests | **31 passed**, covering entry defaults, endpoint references, stale reference pruning, stock previews, frame math and information ranking. |
| Production TypeScript / Vite build | Passed. |
| `scripts/ui_operation_check.mjs` | Passed in headless Edge at 1600 × 1000: plate, face-placed hole, inline size, round↔bevel, invalid size rejection, inline polygon swept cut, helix, body intersection, disconnected-cut rejection, undo/reload, 1280/1100 px layout, guarded export/exploded display, and cancel without a revision; no browser errors. `artifacts/operation-ui-check.json`. |

The keyboard/path follow-up makes Enter confirm from any operation focus and wait for the current preview, while one Escape cancels the whole draft, including picking/drawing. Editing clears a queued confirmation. Boolean result selection no longer reverses signed travel; a negative normal extrusion cuts inward unless the user explicitly reverses the reference. Implicit normals, selected edges and translated paths use labeled blue dash-dot, amber solid and purple dashed guides; curves retain sampled native shapes.

`scripts/ui_operation_controls_check.mjs` passed seven checks in headless Edge: pending Enter from dock/inline inputs, negative face subtraction, invalid-result rejection, one-step Escape from fields/picking/drawing, queued-confirm cancellation, stale-confirm invalidation, duplicate prevention and all three guide styles. No browser errors. `artifacts/operation-controls-check.json`. It requires an empty isolated project (default port 8794).

The implicit-tool follow-up adds geometry-type-driven selection from any scroll position, an origin lock, exact native overlap-based Auto Add/Remove with explicit overrides, and fixed accepted Boolean intent. Initial disconnected additions retain the component-ownership policy; unsupported choices invalidate a draft. The seven-check implicit browser suite passed, including candidate reuse, stale-mesh safety, replacement faces/paths, vertex anchoring and simulated expiry recovery. One deliberate HTTP 400 is recorded separately from unexpected errors in `artifacts/implicit-operations-check.json`.

Warm input-to-visible-preview median on the same small plate fixture improved from **832.97 ms to 201.71 ms**, about **76% less latency**. The UI uses 120 ms quiet time, 35 ms preview polling, an immediate Enter flush, a six-candidate/60-second reuse window, stale-result display and concurrent changed-mesh fetches. Reference picks avoid unnecessary native-preview reloads. Native geometry and tessellation precision were retained. Raw fixtures/samples are in `artifacts/preview-latency-before.json` and `artifacts/preview-latency-after.json`; this is not large-model or Mac performance evidence.

Earlier per-tool-dialog scripts (`ui_modeling_check.mjs`, material-creation portions of `ui_measurement_check.mjs`) predate this workflow. Their historical results below are retained as earlier evidence; use `ui_operation_check.mjs` against an **empty isolated project** for current material creation. The running project was refreshed and its document ID, revision 84 and 13 saved features were verified unchanged. `artifacts/operation-current-project-check.json`. The wheel was rebuilt with the new backend and bundled UI. These tests do not establish novice learnability or macOS interaction quality.

## Functional workspace layout — October 24

The viewport statistics strip and decorative default copy were removed. Physical-instance/unique-definition counts are in Design structure. Undo/Redo and the saved revision are in the bottom timeline; the redundant engine/status footer was removed. The inspector shows one selected part's measurements, one placed assembly's descendant totals, or quantity-aware whole-design totals with no selection. Hidden parts count; suppressed instances do not. Planar area, incomplete geometry, display-unit conversion and inspected build-stage data are handled explicitly. Existing document notes are preserved; generic fallback prose is omitted. Dialog and browser titles use factual names.

`node --test scripts/inspector_measurements.test.mjs scripts/measurement_service.test.mjs scripts/operation_model.test.mjs` passed **31 checks**. The five new scope cases cover linked/hidden/suppressed quantities, selected parts, assembly subtrees, planar stock, unfinished geometry and historical sources. The production TypeScript/Vite build passed. `scripts/ui_layout_check.mjs` passed seven checks in headless Edge on a separate plate/two-linked-pin fixture: whole-design vs one-part metrics, hidden-part totals, relocated Undo/Redo and revision, inch conversion, history scope, 1280/1100 px layouts and empty-design recovery. `artifacts/layout-ui-check.json`. No browser errors were observed. The full unified-operation browser regression also verifies the relocated controls and tool layouts.

## Executed verification

The viewport readability update adds distinct active/selected/hover states, screen-width edge highlights, outlined face selections, direct tree appearance editing with transient previews, and keyboard-accessible context menus. Material-only color previews reuse the loaded mesh. Existing saved part colors are preserved.

The owner's subsequent contextual-information request replaces large measurement cards with dimension lines and compact fallback readouts. A renderer-independent weighted service considers edge lengths, overall extents, and face area, with selection/hover, decaying recent interest, legibility, thin-part relevance, repeated-information competition, stability, and visibility signals. It selects up to two hover or three selected annotations and searches label placements around geometry and protected controls. Values remain kernel measurements. [The design record](CONTEXTUAL_INFORMATION.md) details current behavior, approximation limits, and Phase 2/3 providers. Native vertex picking now supports operation anchors. Pin/dismiss controls, read-only diameter/angle providers, learned ranking, and an MCP view-policy interface are future work.

`scripts/ui_viewport_check.mjs` exercises these interactions on a separate mold reference project, including preview-versus-commit behavior, slider gesture grouping, undo, rename dismissal, unit conversion, reload, menu bounds, and right-drag navigation. Run it with `RYANCAD_UI_URL` pointing to an isolated `--demo mold` project; it makes durable test edits. Screenshots and its machine-readable result are written under `artifacts/`.

| Evidence | Observed result |
|---|---|
| Earlier viewport backend run | **64 passed in 50.50 seconds** after the viewport update, including real geometry/constraints, storage, HTTP boundaries, independent multi-project browser sessions, worker recovery, ownership, branching dependency graphs, parameters, fits, native archive round trips and mesh validation. |
| Production TypeScript + Vite build | Pass; locally bundled assets, split client/rendering chunks, no type/build errors. |
| `node --test scripts/measurement_service.test.mjs` | **11 passed**: thickness/spans, direct interest vs recency/repetition, score explanations, numerical grouping without losing fine dimensional differences, area competition, visibility/end-on rejection, layout budgets/collisions, units, curve semantics, and provider/signal extension. |
| `scripts/ui_measurement_check.mjs` | Pass in headless Edge: 6 × 47 × 47 mm plate, hover/selection budgets, camera tracking, no measurement history edits, units, a real height edit, and compact-window label bounds/collisions. `artifacts/smart-measurement-ui-check.json`. |
| `scripts/ui_viewport_check.mjs` | Pass in headless Edge: face/edge hover and selection, attached measurements, zoom tracking, context menu/keyboard/right-drag behavior, noncommitting color previews, one action per color gesture, undo, direct rename, unit conversion, reload, and compact-window menu bounds; no JavaScript errors. `artifacts/viewport-ui-check.json`. |
| `scripts/ui_modeling_check.mjs` | Pass in headless Edge at 1600 × 1000: manual box/holes/fillet/pin/linked repeat, then planar cutout and stock preview; 4 instances, 3 definitions, no JavaScript errors. |
| `scripts/ui_check.mjs` | Pass on final UI: candidate preview does not commit; root diameter edit, undo, selected-part validated STL export and read-only feature rollback/return; no JavaScript errors. |
| Official MCP stdio client | Nine tools discovered; five separate authored modeling commands build a plate/two linked pins and export three separately validated STL files. `artifacts/mcp-workflow.json`. |
| Installed-wheel proof | Imported installed package ahead of source, served its bundled HTML/assets/license notices, executed a native-worker box operation and returned durable success and binary mesh. `artifacts/package-proof.json`. |
| Generated native examples | Four-piece mold tooling and plate/two-pin archives, with separate STL batches and receipts, rebuilt from the same engine. |
| Original meshes | All three SHA-256 hashes still match the planning inventory. |

Storage tests include a subprocess terminating with `os._exit` after a durable acknowledgment, stale/missing YAML recovery, injected SQLite failure, single-writer protection, externally changed snapshot protection, malformed YAML and consistent archive/history restore. They do not establish guarantees for every OS/power-loss/storage-controller failure.

Mesh tests include interpenetrating individually manifold shells, coplanar/noncoplanar intersections, disjoint triangles, actual generated STL readback and legitimate internal cavity shells. Validation runs on binary STL's float32 coordinates. BVH/separating-axis testing excludes welded vertex-adjacent pairs and uses a numerical tolerance of 1e-7 mm; it is not an exact-arithmetic certificate or physical printability test.

## Measured small-fixture performance

Reproduce with `python scripts/benchmark.py`; raw results are in `artifacts/benchmark.json`. Hardware inventory: Ryzen 7 7800X3D (8 cores/16 threads), approximately 63.1 GiB physical RAM reported by Windows, Radeon integrated graphics and RTX 4070 Ti present. Python 3.12.14, Windows 11 build 26200. GPU selection/power mode/viewport frame timing are not established by this CPU benchmark. Projects were on the workspace filesystem; storage media/sync overhead were not independently isolated.

Fixture: 14 features, 72 parameters, four physical instances and 4,088 unique displayed triangles. Twenty samples per edit class, persistent worker; p95 uses the nearest-rank sample. These measurements include durable acknowledgment, not just kernel construction.

| Measurement | Median | p95 |
|---|---:|---:|
| Root size edit, rebuild and durable commit | 195.3 ms | 236.6 ms |
| Metadata edit, cached geometry and durable commit | 18.3 ms | 20.2 ms |
| State query | 1.84 ms | 2.25 ms |

Cold worker start plus first complete mold creation: 3.49 s. Separate four-STL batch with mesh intersection checks: 1.95 s. Cold kernel startup stays outside the UI process. See raw maxima/conditions in the JSON.

These are small-fixture results. They do **not** validate the roadmap's 100/500-feature, 20/100-instance, 250k/1M-triangle corpora, selection latency, trackpad ergonomics or sustained navigation targets. No matched Fusion/SketchUp/SolidWorks comparison has been run.

## Acceptance tracking

“Demonstrated” below refers to this Windows build and bounded corpus, not a cross-platform release certification.

| ID | State and evidence / outstanding validation |
|---|---|
| A01 | Demonstrated manual plate/pin creation through real UI controls. Representative novice learnability remains untested. |
| A02 | Demonstrated official MCP stepwise creation, linked instances and STL export; same commands as manual UI. |
| A03 | Demonstrated retained creator + changed modifier after human edits to agent-authored shared dimensions; client-supplied identity labeled. |
| A04 | Pause/revoke, queued step mode and worker cancellation implemented/tested at command boundaries. Broader sustained contention testing remains. |
| A05 | Stale proposals and idempotent retries tested; a queued agent proposal cannot overwrite an intervening human change. |
| A06 | Automatic fillet parameter, explicit reuse/linking, favorite/promotion and consumer impact implemented. Additional novice workflow observation remains. |
| A07 | Independent same-value inputs tested; no value-based auto-linking. |
| A08 | Stable scoped expressions, root/dependency/consumer navigation, ambiguity and rename preservation tested. |
| A09 | New-part default and initial disconnected-addition component ownership tested; later splitting regeneration rejected without a partial commit. |
| A10 | Linked repetition, independent clones and extracting a pattern member at its pose tested. |
| A11 | Mold root-size rebuilds, shared dimensions, four separately owned printed pieces and export demonstrated. Example dimensions are test inputs, not an agreed production mold specification. |
| A12 | Explicit tolerance intervals and radial/diametral conventions tested. Physical process calibration remains external. |
| A13 | Every accepted action commits immediately with FULL synchronous SQLite; YAML debounce meets the implemented 0.5/2 s policy. No journal group delay is introduced; action records are not dropped. Long burst/stress measurements remain. |
| A14 | Injected storage failure produces no false durable success and preserves prior state. Real disk-full/removable-drive failure UX remains to validate. |
| A15 | Acknowledged edit survives process exit, stale snapshot and archive restore. Exhaustive mid-write/power-loss scenarios, compaction and long-journal testing remain. |
| A16 | Undo/redo/checkpoint and portable full-history restore tested. No external asset format is present yet. |
| A17 | Measured feature costs, explicit costly/unknown computation, cached read-only rollback and return to present tested. Large pathological paths/GPU stall measurements remain. |
| A18 | Cancel during worker startup and successful restart tested; saved intent preserved. Platform-specific pathological native-job cases remain. |
| A19 | Cycles, selection count changes/missing semantic references and failed geometry preserve the last valid state. General topology naming is not solved; ambiguous cases require explicit repair. |
| A20 | Separate selected-instance STL batches, frames, units/revision, staged completion and no implicit union demonstrated. |
| A21 | Closure/winding/manifold/degeneracy/float32/intersection checks and internal cavities tested; numerical coverage limits recorded in receipts. |
| A22 | Invalid/empty/stale export selection rejected; planar profiles require deliberate conversion/selection. No silent omission. |
| A23 | Manual planar cutout + stock preview beside solid linked parts tested; shared ownership/parameters/history and no extra volume/count. |
| A24 | **Open release gate:** actual Mac build, reopen, geometry agreement, input and file-recovery testing. |
| A25 | Manual code paths have no remote dependency; bundled assets and disconnected-agent operation demonstrated. A real air-gapped fresh-runtime installation test remains. |
| A26 | Unsafe tags/aliases, duplicate keys, malformed/unknown schemas and unsafe native archives rejected; restore never overwrites an existing destination. There is no prior released schema migration yet. |
| A27 | Hidden linked instances remain in quantities; suppression and independent/pattern counts tested. |
| A28 | Canonical geometry is independent of mm/in display preference; expression conversion and dimensional consistency tested. |

## Concrete implementation choices and limits

- Native schema is 0.2. Kernel shapes/display buffers are caches; supported intent is inspectable YAML. The current journal stores full validated intent per revision. Large-journal compaction is not implemented.
- SQLite DELETE journal + synchronous FULL was chosen for a simple single-writer lifecycle. Each edit flushes immediately; only YAML refresh is coalesced. Portable archives use consistent backup, not a copy of a live database.
- HTTP polling (650 ms UI refresh) and a sequenced diagnostic event ring provide live observation. Durable actions remain paginated independently. Polling is not a demonstrated sub-100 ms live-agent display guarantee.
- Semantic edge signatures and selection counts deliberately stop on ambiguity. Exact direct face editing is bounded to unambiguous generating top dimensions; arbitrary surface editing/advanced surfacing is not claimed.
- Definitions are limited to 250, features to 2,000, sketches to 200 entities, atomic batches to 100 steps, component patterns to 200 members and flattened occurrences to 5,000. Parts have a 10,000 mm local span/coordinate envelope. Expressions/queues/caches/uploads are bounded and reject excess rather than silently truncate design intent.
- Planar stock preview is separate from authoritative physical geometry. SVG/kerf, general mesh import, materials/cost systems, joints and simulation remain future phases.
- The wheel and launchers are developer installation artifacts, not a polished bundled-runtime installer. Actual Mac PlaneGCS source-build feasibility and final runtime packaging still need proof. The CI matrix is configured, not remotely executed here.
- Formal accessibility/high-DPI/trackpad evaluation, sustained stress tests, novice usability, broad adversarial geometry sweeps and comparative CAD benchmarks remain release work.

## Next release work

1. Run the locked build and corpus on the actual MacBook architecture/OS; resolve source-build/runtime packaging using measured failures, then compare reopened geometry and recovery.
2. Exercise the standard/stress corpora, long journals, disk-failure variants, input latency and actual navigation frame times on both reference machines.
3. Observe the owner/representative users completing the manual mold/fit workflow; refine interaction and dimensional organization from those results.
4. Produce self-contained installation packages and execute offline install/recovery checks before declaring Phase 1 release complete.

These are validation and release obligations, not silently removed requirements. Phase 2/3 remain the roadmap in ROADMAP_AND_ACCEPTANCE.md.


The implicit-tool update was loaded into the running app with the saved document hash, revision 89 and 16 features verified unchanged. `artifacts/implicit-tools-current-project-check.json` records this check. A valid unapplied Auto removal preview is open for review; the application has not committed a test edit to the user project. The wheel contains the final backend and bundled UI.


The functional layout was loaded into the running app and the entire saved document hash was verified unchanged at revision 90 (17 features). `artifacts/layout-current-project-check.json`. The live app was left on the whole-design inspector, with selected-component and design-overview screenshots under `artifacts/layout-current-*.png`. No design edit was applied during the live review.


## Sidebar and sketch workflow refinement — October 28

The design has a floor-plan blueprint icon; Fit uses interlocking pieces, distinct from Measure. The planar-stock-thickness tool and inspector controls have been removed. Existing stock metadata and engine commands remain readable for compatibility.

Components, 2D Sketches and 3D Tool Bodies use aligned headings and full-width separators. Group editing is indicated inside the selected group row, with italic Editing and Done controls. Double-click empty viewport space to leave the current group edit. Individual parts no longer have tree color swatches; a containing group's color is inherited by its members in the viewport, with the nearest nested group taking precedence.

Component definitions, including groups and tool bodies, use unique names (case-insensitive, with surrounding whitespace ignored). Creation and independent copies receive numeric suffixes when needed; duplicate manual renames are rejected. Linked instances keep their shared definition name. The `document.normalize_names` command repairs legacy duplicate definition names in one undoable action without changing reference IDs.

Starting Sketch without a selected planar face first opens the sketch panel in plane-selection state. Pick a planar face in the viewport or choose World XY/XZ/YZ; drawing controls remain inactive until the plane is chosen. The plane reference uses the same colored reference-box styling as tool operations. Selecting a face before starting Sketch or drawing a profile inside a pending operation retains the inferred plane. Escape cancels a sketch that is waiting for its plane.

Validation: TypeScript and production UI build passed; 116 frontend model tests and 18 focused component/group/sketch backend tests passed. Live UI checks covered inline group-edit status, empty-viewport double-click exit, aligned collection dividers, viewport face picking and world-plane sketch starts. The running default project was advanced from revision 157 to 158 only to rename one duplicate Boxy definition to Boxy 2; geometry/placement/feature/parameter intent was verified unchanged against both journal revisions. Evidence: artifacts/sidebar-polish-current-project-check.json, artifacts/sidebar-group-edit-polish.png, artifacts/sketch-plane-first.png.

## Feature history chronology — October 28

Split component timelines now have a muted teal chronological connection between consecutive global feature events. Lane changes curve quickly into steep diagonals through the column gutters and curve back onto the destination track; consecutive events in one lane remain horizontal. Feature captions stay clear of the transitions. Both split and unified layouts use 112-pixel columns. Connections reroute after merging/restoring lanes, scroll with their features, and ignore pointer events. Boxed lane labels and the single active-component/design Now cursor are retained. This is a display of creation order, without adding model dependencies or constraints.

Validation: TypeScript and the production UI build passed; all 141 frontend tests passed, including four new chronology cases. An isolated headless Edge check created 12 real feature events across four components and a design sketch. It verified SVG endpoints against rendered tiles at two responsive widths, horizontal/vertical scrolling, sticky labels, lane merge/restore, feature selection, the active Now cursor and unified cleanup, with no JavaScript errors. The user's project was not edited. Reproducible check: `scripts/ui_history_flow_check.mjs`; visual evidence: `artifacts/history-lane-chronology.png`. Behavior is documented in `docs/TOOL_BODIES_AND_HISTORY.md`.

## Initial mobile layout — October 28

LAN follow-up: `--lan` / Windows `-Lan` binds the server to `0.0.0.0` and adds detected private IPv4 interface URLs to the existing Host/Origin allowlist. Local browser/tray/MCP URLs remain on loopback. Startup performs no firewall configuration. LAN addresses are printed and recorded in connection metadata. Windows port probes now use exclusive binding to reject an existing loopback listener before a LAN launch opens a project. Normal startup remains localhost-only.

The running port-8790 instance was cleanly restarted in LAN mode and serves UI, health and state at `http://192.168.1.11:8790`. Nineteen networking, public-proxy and tray/launcher tests passed, plus the full mobile workflow against an isolated real LAN URL. A one-time administrator action had completed a firewall exception for TCP 8790 and LocalSubnet; no PowerShell service was enabled. Five existing workspace manifests stayed byte-identical. The legacy document remains revision 165 with geometry, features and placements matching its journal; startup serialized the already-implemented migration of 115 previously-null parameter `named` flags. Evidence: `artifacts/lan-access-check.json`.

Browsers below 1000 pixels now use a bottom bar for View, Design, Inspector and History. Portrait stacks the selected panel below the viewport; landscape places it alongside the viewport. Toolbars and history controls scroll horizontally, dialogs fit the screen, and inputs/touch targets are enlarged. Starting a workflow reveals its existing operation panel. Switching panels preserves drafts and previews. Modeling commands, saved document structures and dependencies are unchanged. Responsive styles are isolated in `frontend/src/mobile.css`, with a small navigation/media-query component. See `docs/MOBILE_LAYOUT.md` and the phone instructions in `docs/USER_GUIDE.md`.

Existing touch orbit/pan/zoom are retained; pinch release no longer places an accidental sketch point or selection. Resize handling guards a temporarily zero-size viewport. Redundant phone-sized viewport legends are hidden to leave room for the model and its actual reference markers.

Validation: TypeScript, the production UI build and all 141 frontend tests passed. `scripts/ui_mobile_check.mjs` used a disposable workspace in mobile-emulated Edge at 320/390 pixels in portrait and 844 pixels in landscape, then restored desktop layout at 1440 pixels. It checked panel/dialog access, horizontal page bounds, operation auto-opening and draft retention, an applied 3 mm movement, a validated material-operation preview, touch sketch drawing, two-finger release safety, and component history with no JavaScript errors. Screenshots: `artifacts/mobile-tool-operation.png`, `artifacts/mobile-sketch.png` and `artifacts/mobile-landscape.png`. No user design was changed. Physical iPhone Safari, keyboard and hardware safe-area checks remain open.


## Import and export menus — October 28

Removed the duplicate Reference designs link from the sidebar while retaining logo-menu examples. Adjacent Import and Export dropdowns now offer native RyanCAD files, STL components and SVG sketches. Native import keeps the existing separate-design behavior. STL import is an undoable faceted solid feature with embedded triangles; SVG import creates an independent design sketch. Export retains validated per-component STL output and adds selectable sketch SVG output, with ZIP download for multiple sketches. File transfers use the app busy guard and bind their jobs to the originating design.

Coverage and limits are in `docs/FILE_IMPORT_EXPORT.md`: millimeter STL imports up to 5,000 triangles, 8 MB uploads, 200-entity SVG sketches, analytic circles and adaptive line approximation for other curved SVG paths. The existing SVG parser dependency is now explicitly pinned; the lockfile validates offline with unchanged resolved packages.

Validation: 30 related backend tests, all 141 frontend tests, TypeScript and the production build passed. Isolated browser checks exercised SVG upload, sketch creation, actual SVG download, STL upload/component creation and export selection, retained logo examples, removed sidebar duplication, mobile menus/bounds, and the existing mobile workflow. The running LAN server was restarted to load the new endpoints; no test geometry was added to user designs.


## Reference-design error audit — October 28

The current loader successfully opens both Silicone mold tooling and Mounting plate & pins through the logo menu. Reproducing the older parameter-creation behavior produces `named_parameter_required` for both examples: recipe inputs were private while reused feature dimensions now require deliberate named inputs. The existing `named=True` recipe-input correction is already present in the running build. This is a likely explanation for the historical report; the user's exact prior error text was unavailable.

Added `tests/test_reference_designs.py` to guard the named-input requirement for both recipes, and `scripts/ui_reference_designs_check.mjs` to exercise menu loading, real geometry, separate-design preservation and refresh persistence. Both new model cases, both browser cases, and the existing 15 native workflow tests passed. All reproduction used disposable projects/workspaces; no user design was changed and no additional production-code fix was needed during this audit.


## Movable section view — October 28

The viewport section control now offers world XY/XZ/YZ planes, a live bounds-scaled slider, exact millimeter position, Center and Flip cut side. It centers on first opening, retains settings when toggled and is suspended while sketching. Render materials and in-progress operation previews share a mutable plane, so moving the cut requires no native rebuild or mesh reload. Ray picking and contextual measurement visibility use that same plane rather than hardcoded world Y checks. Measurements invalidate on plane changes. World axes/grid remain available for orientation. This is display-only surface clipping, without filled caps or arbitrary-angle planes.

Validation: TypeScript, production build and all 143 frontend tests passed. `scripts/section_view.test.mjs` covers signed positions, flipping, axis choices and transformed bounds. `scripts/ui_section_view_check.mjs` verifies actual canvas output changes at exact positions on all axes, flip, Center, retained settings, mobile control bounds, no JavaScript errors and unchanged document intent in a disposable project. Evidence: `artifacts/movable-section-view.png`.


## Section references and account-menu mockup — October 28

Section view can copy a planar face or sketch plane, including arbitrary orientations. A preselected face/sketch can be used immediately; otherwise a colored reference box starts viewport/tree picking. Clipping is temporarily suspended during picking. Successful picks keep the active component unchanged and position the cut at the reference, with subsequent offset along its normal. Exploded face placement is accounted for. Escape/Cancel preserves the old cut; clearing the reference or selecting a world plane restores axis mode. These references are view-only snapshots without model dependencies. World-axis picks during acquisition select a world section plane rather than opening another operation.

The R avatar opens a corner account dropdown with Profile, Account settings, Sign in and Create account mockups. Their forms/actions are disabled and labeled as previews; no credentials or account requests are sent. Mobile uses the avatar in place of the header Agents button, with functional External agents access inside the dropdown. Header menus render above viewport popovers.

Validation: TypeScript, production build and all 144 frontend tests passed. The section reference browser check selected an actual body face, copied a tilted sketch plane, adjusted offset, canceled/cleared references, and exercised the account mockup and mobile agent access without JavaScript errors. The full mobile workflow also passed. All fixtures used disposable projects. Evidence: `artifacts/section-plane-reference.png`, `artifacts/account-menu-mobile.png`; reproducible check: `scripts/ui_section_reference_check.mjs`.


## Resizable history panel — October 28

A pointer-captured top divider resizes Feature history and Activity without changing document intent. Height is retained across unified/split timeline changes during the session, constrained to preserve the viewport, and reset by double-click or Enter. Arrow keys support keyboard resizing. Portrait mobile history supports dragging; landscape keeps the existing full-height side pane. Panel contents have bounded flex sizing and explicit horizontal/vertical overflow styling with standard-width scrollbars.

TypeScript and production build passed. `scripts/ui_history_resize_check.mjs` built a disposable 12-component fixture and verified dragging up/down, split-mode height retention, actual two-axis overflow and scroll offsets, standard-width scrollbars, keyboard resizing, reset and phone portrait sizing with no JavaScript errors. Evidence: `artifacts/resizable-history.png`.


## Explicit Codex setup and section-reference guides — October 28

The Agents panel generates read-only, copyable Codex TOML with absolute launch paths and the selected browser workspace/design. It includes setup steps, target identity, a missing-connection-file notice and Clipboard API/HTTP copy fallback. The generated block contains no service token. Format/options were checked against official OpenAI MCP documentation. TOML is used because Codex does not use YAML for this configuration. The copied block successfully initialized the real stdio connector and inspected the scoped design. Unit tests parse TOML (including quoted Windows paths) and verify request/design routing and token omission.

The main-menu button now follows the logo. Standard view buttons are 5 px closer to the axis indicator. The section reference picker shares Tool/Move card classes, color, role icon, pointer icon, active-picking treatment and clear icon. A projected violet reference plane, offset cut outline, normal travel path, endpoint markers and signed offset label update with the camera and section offset.

TypeScript/build and all 144 frontend tests passed. Isolated browser checks verified menu order, copy fallback, styled face/sketch picking and account/mobile controls; the generated config was exercised through the official MCP client. Evidence: `artifacts/section-offset-guide.png`. Sixteen backend/API regression tests passed. No test geometry or agent edits were applied to user projects.

## Experimental active-component appearance — October 28

A beaker dropdown directly after Parameters hosts persistent, default-off experiments with explicit stable identifiers. The first, `active-component-appearance`, offers Soft glow, Rim glow and Height gradient, adjustable strength/tint and reset. Enabling it replaces amber whole-component edge highlighting with surface shading; blue face/edge/vertex selection and hover remain intact. Preview materials share the effect and retain normal depth/clipping behavior. Live settings update uniforms without reloading geometry. Settings are browser-local and never enter the document or history.

TypeScript, production build and all 148 frontend tests passed. An isolated Edge browser check rendered three distinct modes, verified exact baseline pixel restoration when disabled, refresh persistence, valid tool previews, unchanged document intent, reset and phone dropdown bounds without shader or JavaScript errors. Evidence: `artifacts/experimental-soft-glow.png`, `artifacts/experimental-rim-glow.png`, `artifacts/experimental-height-gradient.png`. See `docs/EXPERIMENTAL_FEATURES.md` for the experiment lifecycle.

## Point-to-point Measure sidebar — October 28

Removed the whole-component Measure modal and replaced it with a right-side operation panel. Two sequential viewport picks measure design-coordinate distance, signed XYZ components and unit direction. Native vertices/midpoints are exact; edge/face hits carry the clicked local position through the occurrence transform. World origin is available. Shift-click builds/toggles a point chain with consecutive distances and total length. Reference cards support replacement, removal and source hover; a projected viewport guide follows the camera. Edge length/face area remain small contextual details. Done/Escape restores the inspector and prior selection. Samples are transient, reset after document revisions, and never create dependencies or history events. Existing backend component-separation endpoints remain available to agents; the new panel focuses on point measurements.

TypeScript, production build and all 152 frontend tests passed. The isolated browser check exercised exact vertices/midpoints, clicked edge/face coordinates, zero distance, shift chains/toggle, reference replacement/hover, world origin, Done/Escape, unchanged document/history and mobile layout without JavaScript errors. Evidence: `artifacts/point-measure-sidebar.png`, `artifacts/point-measure-mobile.png`; reproducible check: `scripts/ui_point_measure_check.mjs`.

## WebGL startup failure containment — October 28

Viewport initialization catches renderer-construction failure rather than letting it propagate through React and remove the whole interface. A viewport-local recovery message explains the WebGL 2 requirement, Chrome graphics settings/GPU diagnostics and reload action. Workspace and file menus remain usable. This does not enable browser-disabled graphics or claim to fix a remote Mac's GPU configuration; runtime context loss is outside this startup guard.

TypeScript/build passed. `scripts/ui_webgl_unavailable_check.mjs` simulates canvas WebGL denial before app startup, verifies recovery guidance, initialized workspace and working project menu without an uncaught error, and separately confirms normal renderer startup. Evidence: `artifacts/webgl-unavailable.png`. The user's exact Chrome/macOS configuration remains unverified.

## Shared bug reports and feature requests — October 28

A bug-glyph dropdown after Experimental features provides searchable, expandable reports with create/read/edit/delete, Bug/Feature request type, title, date, separate steps/error/notes fields and editable automatic browser/device context. Screenshots support file selection, paste and drag-and-drop, preview/removal and full-image viewing. Saved reports live in the initial server project's `feedback/reports.yaml` with separate screenshot files and are shared across workspaces. Atomic YAML writes, per-report conflict checks and attachment validation preserve existing reports; all edits are independent of CAD intent/history. Drafts survive menu closing in memory. List polling picks up other users' changes while open.

TypeScript/build, all 152 frontend tests, and 21 backend tests covering reports plus workspace/network regressions passed. The isolated browser check exercised the full CRUD flow, a second independent workspace reading the same report, all screenshot input methods, attachment retrieval/removal, persisted edits after refresh, browser context, retained drafts, shortcut isolation and mobile layout without JavaScript errors or CAD document edits. Evidence: `artifacts/bug-reports-desktop.png`, `artifacts/bug-reports-mobile.png`. Details and API: `docs/BUG_REPORTS.md`.

## Toolbar customization and inset layout — October 29

Toolbar actions have centralized default shortcuts, live key labels/tooltips and accessible bindings. Settings supports key capture, scoped conflict detection, explicit replacement that unassigns conflicting actions, and reset. Modeling and sketch bindings are scoped separately. Existing Enter/Escape, text editing and navigation retain their workflow behavior. Shortcuts dispatch the actual button and respect disabled state. Modeling buttons support native drag reordering, with DOM/tab order matching the visual order, independent reset and accessible earlier/later settings controls. The Parameters divider is removed. Preferences are validated and stored in browser local storage, never in CAD intent.

The sidebar-toolbar experiment now has `between` and `inset-buttons` modes. The latter keeps the toolbar background full width with an inset, independently scrolling button row aligned to the viewport; sidebars start below it. Both modes preserve operation-panel sizing and mobile fallback.

TypeScript/build and all 155 frontend tests passed. Browser checks exercised default shortcuts, sketch/text-entry isolation, custom key capture, confirmed conflict replacement, removed old bindings, live labels/dispatch, refresh persistence, real drag reorder without invocation, resets and both layout geometries. Evidence: `artifacts/toolbar-inset-buttons.png`. See `docs/TOOLBAR_CUSTOMIZATION.md`.

## Saved sketch hover visibility — October 28

Replaced the subtle yellow/orange saved-sketch hover change with a cyan 4 px stroke and dark backing, using the same wide-line rendering as geometry hover. A tooltip identifies the sketch and its click action. The transient overlay preserves normal construction colors and blue selection, and is disposed on pointer leave, camera changes, geometry refresh/hiding and viewport teardown. Picking remains on original sketch geometry.

TypeScript/build passed. `scripts/ui_sketch_hover_check.mjs` verifies actual changed viewport pixels, named tooltip/pointer, exact normal/selected pixel restoration and hidden-sketch cleanup without JavaScript errors. Evidence: `artifacts/sketch-hover.png`.


## Direct world-plane picking — October 29

Added finite, screen-scaled visual patches for infinite world XY/XZ/YZ planes, with cyan hover, blue selection and named click feedback. Picking compares model surface/edge distances, respects section clipping and gives saved sketch picks priority. Plane references seed sketches or complete pending sketch-plane selection; the purple viewport chooser and its styles are removed. Sidebar fallback controls remain. Active drawing, movement, measurement and tool setup preserve their specialized picking behavior. Plane materials/geometry are disposed at viewport teardown.

TypeScript/build and all 155 frontend tests passed. The isolated browser check found and selected all three planes, opened sketches from preselection, directly completed pending sketch-plane selection, confirmed the overlay is absent and verified model geometry blocks plane hover without JavaScript errors. Evidence: `artifacts/selectable-world-planes.png`; reproducible check: `scripts/ui_world_planes_check.mjs`.


## Positive-quadrant plane picking revision — October 29

Replaced centered overlapping plane patches with small offset square markers wholly inside positive world-plane quadrants. Ordinary viewport picking is limited to those markers. While Sketch waits for a plane, ray intersections also accept empty positive-quadrant space and display only the hovered quadrant as a faint tint. Existing model geometry takes priority during acquisition; negative quadrants are not candidates. Overlapping candidates use balanced in-plane coordinates and distance tie-breaking, with explicit markers taking precedence. Plane basis orientation now consistently maps local coordinates into positive X/Y/Z. Screenshot evidence: `artifacts/selectable-world-planes.png`, `artifacts/world-plane-quadrant-hover.png`. The browser check covers all markers, matching sketches, far-quadrant acquisition, normal-view pick limits and geometry occlusion.


## Stable Tool Profile labels and reversed selection treatment — October 29

The supplied recording shows Tool Profile alternating between opposite corners while the profile is visually still. OperationGuide previously recomputed the strictly farthest projected vertex on every frame, allowing near-equal corners to swap due to floating-point/camera changes. ProfileLabelPlacement now retains a relative geometric anchor through a 12 px advantage band, deterministically resolves initial ties, resets on profile-reference changes, and uses separate show/hide size thresholds. Geometry, previews and camera updates remain live.

Reversed the click-target and selected-object styles: hover uses the restrained blue stroke/diamond treatment, while selection uses cyan halos/rings and fill. Matching saved-sketch strokes, world-plane markers and legend/tooltip indicators follow the new roles. Active component orange is unchanged. All 160 frontend tests passed, including 1,000 alternating near-tie/order variations, significant-placement changes, visibility thresholds and updated highlight ownership/style tests. Browser verification monitored slight orbit, camera damping and 120 rendered frames without label jumps or JavaScript errors. Evidence: `artifacts/stable-tool-profile-label.png`.


## Synchronized active-component edge pulses — October 29

Replaced the three surface-emissive appearance styles with one configurable electrical edge animation under the same `active-component-appearance` experiment. Controls are color, speed, pulses per edge and glow strength; defaults are ice blue, 0.16 traversals/s, three pulses and 80%. Core/halo wide-line shaders interpolate normalized arclength across each complete native edge, with shared time uniforms updated by the existing render loop. Geometry and base materials remain native and pickable; overlays own/dispose their buffers and do not raycast. Inactive components are unaffected, edited/new geometry previews share the effect, section clipping applies, and disabling restores original pixels exactly. Existing enabled/tint/strength preferences migrate, obsolete style names are dropped, and speed/count default safely.

TypeScript/build and all 163 frontend tests passed. The isolated browser check verified actual animation on a stationary camera, editable/persisted color/speed/count, collapsed controls, exact baseline restoration, valid native and section previews, unchanged document intent, reset and phone bounds without shader/JavaScript errors. Tests also cover per-edge arclength, shared clocks, live uniform updates, depth/clipping, active-only behavior and preview-owned-buffer cleanup. Evidence: `artifacts/active-edge-pulses.png`, `artifacts/active-edge-pulses-section-preview.png`.

## Edit existing timeline features — October 29

Timeline double-click (or Enter on a focused feature) opens a fixed-width right-panel editor; the inspector also exposes Edit feature. Sketch events reopen the normal sketch editor. Existing geometry features expose their saved dimensions, deliberate named bindings, name, suppression and safe material/direction settings. Origin/Profile/Path terminology is retained, with the original profile and frozen reference geometry preserved. Profile replacement/reference repicking are outside this initial historical editor.

The shared `feature.update` command edits the original feature in place and retains ID, component ownership, order, creation author and private dimension identity/tolerance. It never overwrites a named parameter when the user gives one operation a numeric replacement. Native previews rebuild the entire design and render the final downstream result; empty candidates correctly hide suppressed source solids. Apply commits the exact validated candidate as one undoable activity transaction, without adding a duplicate timeline feature. Cancel/Escape changes no saved data, Enter can wait for the latest preview, and concurrent revision changes or downstream failures disable Apply. Candidate jobs no longer briefly block tool launches after cancellation. History arrows and View build stage remain read-only inspection controls.

Validation: 11 historical-edit backend tests and 61 affected API/geometry/sketch/design-intent regression tests passed; all 168 frontend tests passed; TypeScript, production build and distributable wheel passed. The isolated desktop/phone browser check verified changing an earlier plate while rebuilding its later hole, original feature IDs/order/count, preview/cancel/Enter/Escape, invalid geometry, concurrent edits, stage stepping and sketch reopening, without JavaScript errors. No test operations were made in user designs. Evidence: `artifacts/edit-history-feature.png`.

Historical reference-card follow-up: saved profiles, paths, origins and travel targets now use the main form's colored cards and icons, with locks in place of pick controls. Grouped references retain order, implicit paths/planes stay explicit, and copied external geometry does not borrow current topology names. Both forms now use Effect → Profile → Path → Origin. Offset inputs are removed from the basic UI while preserving saved placement values. Four additional model tests and the expanded isolated browser workflow check reference labels, section order, read-only selectors, removed inputs and unchanged nonzero offsets after a real edit.

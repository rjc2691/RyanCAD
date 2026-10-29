# Design collections, tool workbenches and history lanes

## Three design collections

Components holds the manufactured assembly tree and its part/unique counts. 2D Sketches is a flat list of design-owned sketches. 3D Tool Bodies is a flat list of reusable solid tools, with create, rename and guarded removal actions. The three collection headings share typography; design input, tolerance and checkpoint links remain separate utilities.

## Reusable tool bodies

Create a tool body with the + in its section, then choose Build / edit in its workbench. Existing universal Tool operations build or refine the solid, with parameters, previews and authored history. An empty component/tool can receive its first constructive Add/Auto operation; Cut/Intersect still require existing geometry. New solids created from a tool target stay tool bodies. Tool workbenches do not create planar outputs; use the shared 2D sketch collection for those.

The workbench shows one tool in its own local coordinate space and hides assembly parts. Return to design restores the prior selection and group edit scope. Entering a workbench fits its geometry in the main viewport; returning refits the assembly. Camera pose retention across workbenches is a future refinement. Finish or cancel a pending operation before changing workbenches.

In an assembly operation, choose 3D body for Tool Profile Shape, then a valid body from the 3D Tool Body library selector. It is centered at Tool Origin rather than retaining a manufacturing placement; its working orientation is retained. The violet profile preview uses the stored mesh even though the library body has no displayed assembly instance. Existing body Boolean, mirror and connected-repeat capability is retained; sweeping/revolving arbitrary solid bodies is not added by this change.

Tool definitions have a purpose field (`part` by default, `tool` for library geometry). Native files retain a single root reference instance per tool solely to identify its private working frame and maintain exact geometry references. That instance is excluded from assembly rendering, part counts, design/assembly measurements and STL selection/export. It is not an assembly placement. Native APIs return purpose metadata so other UIs can make the same distinction. Tools cannot be grouped, patterned as manufactured instances, or copied as linked placed occurrences. Older documents default to purpose=part. Older software that rejects the new field needs updating; this is not a claim of forward compatibility.

Saved tools and their feature/parameter histories persist with the design, including autosave and native archives. They can be temporary in the workflow but are not silently discarded. Removal uses ordinary undoable component deletion and refuses to remove tools with live geometry/parameter dependents. Parameterized library references regenerate when a tool is edited. Dependency cycles remain errors, rather than being converted into geometry snapshots.

## Parallel feature history

Component lanes toggles between one unified design timeline and a root lane plus nonempty owner lanes. A component definition owns its features, so linked instances share a lane. Tool bodies receive their own owner lanes as well; root sketches stay in the design lane.

Every feature retains its global creation column. Rows do not compact their events: columns belonging to other owners remain blank. The same 112-pixel column grid is used in both modes. Lane labels stay visible while scrolling horizontally. Hide/merge on a lane moves its events into the top Design / merged lane without changing their columns; Restore lanes brings hidden lanes back. The main toggle always returns to unified history.

In split view, a muted teal path connects consecutive feature events in global creation order. Events on the same lane have a straight connection. When the next event belongs to a different lane, the line turns smoothly into a steep diagonal through the gap between columns, then curves back onto the destination track. The transition stays beyond feature captions; background clearance keeps it distinguishable where it crosses other lane tracks. The path follows the timeline when scrolling and reroutes immediately when lanes are merged or restored. Unified history retains its ordinary horizontal track.

These connections show chronology, not geometric dependencies, cross-component constraints or branches in the design. They do not change document data or introduce linked references. The overlay ignores pointer events, preserving feature selection and double-click history inspection. Lane names remain boxed and connected to their tracks; only the active visible component lane has a Now cursor, falling back to the design lane when there is no visible active component lane.

The timeline grows upward to fit useful rows, capped at 42% of viewport height and constrained to preserve a usable modeling area. Its body scrolls vertically and horizontally. This is view state, not a document edit; hiding a lane does not hide components, suppress features or change history.

## History stepping

Previous feature removes the last visible feature from the inspected build prefix. Next feature advances one global feature, returning to the live design at the final feature. Stepping backwards from the first feature reaches Origin, before any geometry feature. A single-feature design can therefore step directly between Origin and Current. Previous is disabled at Origin; Next is disabled at Current. Existing double-click stage inspection and Return to present remain available.

Stepping inspects geometry with current parameter values, as before; it does not restore a historical document revision or change the durable revision. Feature order remains global across all lanes. Expensive/uncached prefix evaluations retain the existing cost confirmation and cache policy. Pending modeling operations disable history navigation.

## Verification

Native coverage builds a parametric cutter, uses it in a real Boolean operation, excludes it from manufactured counts/export, protects live references on deletion, validates flat working-frame ownership and inheritance, and evaluates Origin without affecting subsequent live geometry. API/store regression covers normal durable commands and history behavior. Frontend tests cover stable lane columns, merging/unification without dropped events, stepping boundaries, empty-tool launch and tool/statistic scope.

Chronology coverage in `scripts/history_model.test.mjs` verifies global event ordering, upward/downward rounded transitions outside captions, straight same-lane links, rerouting after lane merging, and empty/single-event timelines. `scripts/ui_history_flow_check.mjs` creates an isolated 12-feature/four-component fixture with a root sketch. It checks actual SVG-to-tile alignment at 1500 and 1800 pixels, horizontal/vertical scrolling, sticky labels, lane merge/restore, clickable feature cards, a single active Now cursor and unified-mode cleanup. No test edits are made to the user's design.

Live checks used an isolated project on port 8832: a 6 x 6 x 8 mm workbench body was built and saved while assembly counts remained four; a stored cutter was selected for a validated assembly preview; global X positions matched exactly before/after splitting lanes; a merged lane retained its original columns; the bounded panel scrolled; and stepping reached Origin and returned to Current. Screenshots: artifacts/tool-body-workbench.png, artifacts/library-body-operation.png and artifacts/component-history-lanes.png.

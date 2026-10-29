# Using RyanCAD 0.1

The current rules for references, dimensions and named values are described in [Simple design intent](SIMPLE_DESIGN_INTENT.md). Cross-component picks are copied into accepted operations. Numeric dimensions stay local; the Parameters window lists only deliberately named values. Type letters in a numeric field for matching parameters, use Tab repeatedly to cycle matches, or click a name. Parameter-driven viewport dimensions use a subtle `p:` prefix and a full-name tooltip where the generating dimension is known.

## Phones and narrow screens

To connect a phone to a locally running server, start Windows RyanCAD with `Start-RyanCAD.ps1 -Lan`, or add `--lan` to the Python/macOS launcher, and open the printed Wi-Fi/Ethernet URL from the same network. A phone browser gets its own workspace; use Workspace recovery and switching to reopen the desktop workspace when desired.

Below 1000 pixels wide, the bottom bar opens **View**, **Design**, **Inspector** or **History**. View uses the full modeling area; the other choices share the screen with the viewport. In landscape, the viewport and selected panel sit side by side. Panels scroll independently. Swipe the top tool row sideways to reach additional tools, and swipe the history header to reach its remaining controls. The compact header keeps project, search, agent and STL export actions accessible; tap the three-line button beside RyanCAD for the project menu.

Starting Tool, Move, Group or Sketch opens its existing operation panel. The Inspector tab takes the operation's name while it is active. Switch to View for more drawing space, then return to that tab to continue configuring or apply/cancel. Switching panels preserves the pending operation. Use Design to reach components, sketches, tool bodies and workspace management.

Tap geometry to select it. Outside sketch drawing, drag one finger to orbit; use two fingers to pan and pinch to zoom. In the sketch editor, taps draw or select with the current sketch tool, and two fingers pan/zoom without placing geometry. Standard view buttons and Fit remain available. This first mobile pass reuses existing tools and data; mouse-oriented features such as Shift multi-selection, tree drag reorganization and bounded sketch orbit do not have new touch gestures.

## The workspace

The **Section view** button in the viewport controls opens a movable display cut. Choose XY, XZ or YZ, drag the slider or enter an exact world-coordinate position in millimeters, and use **Flip cut side** to retain the other half. **Center** places the plane halfway through the displayed collection's bounds along the chosen axis, accounting for component placements and exploded display. The first opening centers automatically. Closing and reopening preserves the last settings during that app session. Sectioning does not edit geometry, exports, history or material statistics; sketch drawing temporarily shows its normal unsectioned view. This is surface clipping, without filled section caps. Use **Plane reference** to copy the plane of a selected planar face or sketch, or click the reference picker and choose one from the viewport/tree. Tilted planes are supported. With a reference, Position becomes an offset along its normal, starting at zero. Escape or Cancel picking leaves the previous cut intact. Clear reference or choose a world plane to return to axis-aligned sectioning. References are snapshots for this view and do not bind the component or sketch. While picking, clipping is temporarily lifted so the source geometry is visible. Finish pending modeling operations before acquiring a section reference.

Use the adjacent **Import** and **Export** dropdowns in the header. Import opens a RyanCAD design, adds an STL component, or creates an SVG sketch. Export offers selected components as STL, selected sketches as SVG, and a native RyanCAD snapshot. Multiple selected sketches download as a ZIP. SVGs use sketch-plane millimeter coordinates; imported curves may be approximated and STL imports are limited to 5,000 facets. See [file import/export](FILE_IMPORT_EXPORT.md) for format coverage and limits. Reference designs remain in the three-line main menu.

On Windows, RyanCAD has a notification-area icon while its local server is running. Right-click it and choose **Open RyanCAD** or **Quit RyanCAD**; double-click also opens the app. Windows may place it under the **^** hidden-icons arrow. Its tooltip shows the server port when several instances are running. Quit stops that local server and all browsers connected to it, while accepted edits stay saved. A remote server, such as an EC2 instance, is a separate process. `Start-RyanCAD.ps1 -Background` starts a hidden local process controlled by this icon; without `-Background`, Ctrl+C in its terminal also stops it.

Click **Local Workspace** at the top of the left sidebar to manage designs. Create a named or untitled design, switch between designs, rename any design, or delete one. Deleted designs remain under **Deleted designs**, where they can be restored; at least one design stays in the workspace. A design has its own parameters, features, revisions, undo/redo, checkpoints and exports. The current design name can also be renamed directly in the tree.

Separate browser profiles receive separate workspaces. Refresh and server restart preserve the workspace, and each open browser tab retains its selected design independently. Under **Workspace recovery and switching**, save the displayed code to reopen that workspace after clearing browser data or in another browser. The code is also recorded in that workspace's `workspace.json` on the server. You can create another workspace there. Switching workspaces changes the browser profile's workspace cookie; reload its other tabs after switching. These codes are convenience identifiers; RyanCAD does not provide user accounts or access control.

An earlier single-project installation is kept intact. On a fresh workspace, **Copy existing server design and history** makes a separate workspace design with the old journal and checkpoints. The original project is not moved or overwritten. Reference designs and native imports likewise open as separate designs; full native snapshots retain history, while YAML imports contain the current model.

The left tree contains physical instances and assembly groups, with total part and unique-definition counts below its heading. Linked parts share a definition and show a count badge. The inspector shows material volume and surface/profile area for one selected part, or quantity-aware totals for the entire design when selection is cleared. Selecting an assembly measures its placed subtree. Hidden parts remain in totals; suppressed instances are excluded. Planar parts report profile area without inventing solid volume, and incomplete geometry is marked explicitly.

The viewport has no statistics strip. Undo/Redo and the saved revision are in the bottom timeline beside feature history and durable activity. Inspected build-stage measurements are identified in the inspector footer; returning to present restores current measurements. Empty states and dialog titles use factual labels and actions.

Press **T / Tool** to start a material operation from the current selection. All tools / Ctrl/Cmd+K also open starting configurations in this same workspace. Drag to orbit, right-drag to pan, scroll/trackpad to zoom, F to fit, and Top/Front/Right/ISO for standard views. Ctrl/Cmd+Z undoes; Shift+Ctrl/Cmd+Z redoes. Shortcuts leave normal text entry alone.

Select a component in the tree or a face/edge in the viewport; Shift-click adds/removes individual faces or edges; a plain click replaces the current selection. Eligible top faces expose their generating dimension and exact push/pull offset. Selected edges offer semantic fillet/chamfer targeting. Section view is display clipping, without a filled cap. Exploded display moves the picture; authoritative placements and measurements stay unchanged.

### Reading and editing the model

- **Orange outlines** identify the selected component and geometry. Selection stays orange. Hover uses a contrasting cyan outline with a pale core and dark halo; vertices use a cyan ring on hover and a smaller orange diamond when selected. A label beside the pointer names the exact face/edge/vertex and component, and describes the click or Shift-click action. The component retains its display color beneath a restrained warm selection accent. The viewport identifies the active part by name and includes a color legend. Solid parts use a cube icon; planar parts use stacked layers; assembly groups use a folder.
- Hover a part briefly or select an edge, face, or component to see contextual dimensions. Straight spans use offset lines and end ticks like dimensioned CAD drawings. Hover shows up to two annotations; clicking allows up to three, when space permits. A weighted service chooses useful measurements using the selected geometry, recent interest, repetition, readability, visibility, and stability. Fewer can appear when the view is crowded or a dimension is end-on.
- Labels follow the camera and exploded display and respect millimeter/inch preferences. Numerical values come from the engine. Overall bounds use plain value/unit labels, with component-local axis information retained in the measurement description; these are read-only extents, not necessarily single editable feature dimensions. `L` means actual curve length, never its chord. `a=` identifies face area, which can remain secondary to lengths; the inspector retains the complete selected-face area. Native vertices can now be selected for exact operation origins. The read-only measurement service does not yet provide pinned annotations, hole diameters, or entity-to-entity distance/angle measurements. See [contextual information](CONTEXTUAL_INFORMATION.md) for the policy and growth plan.
- Click a component's **color swatch in the left tree** to edit its appearance. Hover a palette color to preview it without saving; click to save. RGB sliders preview continuously and save on release. A valid six-digit hex value previews while typing and saves on Enter or leaving the field. The editor stays open after saving. Every accepted change has normal history/undo; dragging does not create a revision per pixel.
- Use the **pencil**, double-click a component name, or press **F2** on its tree button to rename it. Enter saves; clicking outside the editor saves pending valid edits. Escape discards uncommitted edits and closes the editor. Names and colors belong to the shared definition, so linked instances update together. Existing saved colors are retained; the revised palette applies to newly created parts and reference designs.
- **Right-click** a part or selected geometry for contextual actions: appearance, exact placement, visibility, organization, and eligible edge/face tools. Right-click empty space for workspace actions. Arrow keys/Home/End navigate the menu; Escape dismisses it. Right-drag continues to pan.

## View orientation and Move Component

The world XYZ indicator is in the upper right, above Front/Top/Right/ISO. It follows the actual camera orientation during orbit and named views; it does not change the design. Its units match the design display units.

**Move Component** sits beside Tool. Press **M** to open it; **Shift+G** toggles the grid. The side panel keeps the viewport visible. The selector contains **Reference movement** (default), **XYZ distances and rotation**, and **Rotation**.

**Reference movement** combines point-to-point, distance along an edge, and constrained point alignment in one inferred workflow:

1. Acquire a component by clicking it in the viewport/tree or choosing it in the panel. A preselected component is used at launch. Whole-component tree clicks choose a different component and clear the old draft references/values. The component card also arms Change component, which allows any geometry click to acquire a different part. Clear component removes the active part entirely.
2. Click a vertex or face on the active occurrence to set **Origin point**. Without an explicit origin, its component origin is used. Faces use their geometric center rather than an arbitrary cursor hit.
3. Click a vertex or face outside the active occurrence to set **Target point**. The component is not retargeted by these reference picks.
4. Click a straight edge to set **Reference direction**, on either the active component or another component. Vertices take precedence over their adjacent edges. Curved/zero-length direction edges are rejected. A direction can be selected before or after either point.
5. **Movement distance** fills automatically from the selected points/direction, including signed projected travel. Editing that value sets an exact distance override. Units, expressions, and reusable typed parameters are supported.

The panel describes the inferred effect:

| References / input | Result |
|---|---|
| Target, with optional source origin | Point-to-point translation; orientation unchanged. |
| Origin/target plus direction | Only the point displacement parallel to the direction is applied. Perpendicular coordinates stay fixed. |
| Direction plus exact distance | Signed translation parallel to the line, independent of its location. |
| Target plus exact distance, without an edge | Signed distance along the source-to-target direction. |
| Target, direction and exact distance | Exact distance takes priority; target is retained and its remaining gap is displayed. |

Click a named reference field to explicitly pick that role. This overrides inference for the next valid pick, so an edge can be used for an origin/target endpoint or midpoint instead of a direction. Edges offer endpoints and their native midpoint, including curved edges. Midpoints are native halfway points, not chord centers. Explicit point fields also allow a component origin through a tree pick. Hover a reference name to highlight it in the viewport.

Use the **X beside each reference** to clear it. Clearing direction restores ordinary point-to-point alignment if a target remains. Clearing target retains a direction/distance move if one is defined. Clearing origin restores the default component origin. **Use inferred distance** restores target-based travel without losing references. The automatic value continues to follow reference edits; displaying it does not freeze the movement. An incomplete draft clears its previous preview and disables Apply. Component selection, reference selection, and exact distance are all editable without leaving the operation.

**Midpoints and world axes:** during Move, hover near an edge's halfway point to get a named **Midpoint · Edge N** point target. Hovering an edge also reveals a midpoint marker. In Reference movement it sets origin on the active occurrence or target on another occurrence; pick elsewhere along the edge to use the edge as a direction. In Rotation, selecting its midpoint still selects the underlying straight edge as the axis.

The direction/rotation-axis card offers **World X / Y / Z** controls. The camera-following upper-right XYZ indicator is 50% larger (132 × 123 px) and its lines/labels are clickable reference controls. Within Move they select direction or rotation axis; outside an operation they open Move and keep the chosen axis while a component is acquired. During a material operation they select its world travel direction; fillet/chamfer still require actual model edges. World directions remain global inside rotated assemblies. A world rotation axis passes through the world origin. The active axis is highlighted in both indicator and panel.

Origin, target and direction cards use amber, blue and violet styling matching their viewport markers, with role icons, pointer/pick affordances, active-picking borders and clear controls. Hovering named geometric references highlights the same object in the viewport.

**Rotation:** choose Rotation, select a straight edge as the **Rotation axis**, and enter **Rotation angle**. The axis is the actual line through the edge, including its location; an edge on another part can rotate the active part around that part. Positive angles use the right-hand rule along the edge's start-to-end direction. Negative angles or Reverse direction reverse the rotation. The viewport shows the axis and rotation arc, and the footer shows the angle. Changing the axis, angle, or active component updates the native preview. After Apply, the named angle remains editable through Parameters; later movement starts from the evaluated rotated placement.

**XYZ distances and rotation:** enter parent-frame X/Y/Z translation offsets and Euler angle increments from the saved starting placement. These are changes, not absolute coordinates. The native Euler convention is Rx · Ry · Rz; the separate Rotation method performs a true rotation about the picked axis. The component card identifies the parent frame. Nested parents and circular-pattern member frames are respected.

The viewport uses amber source, blue target, mint travel/rotation, and violet reference direction/axis treatments. The fixed footer keeps travel/angle and remaining target gap visible while scrolling. Point/direction picks are snapshots, not persistent assembly mates. Geometry remains shared between linked instances, while unrelated placements are not overwritten; repeated assembly placements/patterns have shared source scope disclosed in the panel.

**Reset movement** clears inputs and references within the selected method. **Apply move / Enter** saves the exact validated/displayed candidate as one attributed, undoable placement action. **Cancel / Escape** restores the saved design. Invalid/stale/unrendered previews cannot apply, and export/exploded display wait until the draft closes. No movement is saved until Apply.

## One tool workspace

**Tool Origin · Tool Profile · Tool Path · Tool Effect** are persistent sections in one scrolling right dock. Scroll to any section; Apply/Cancel stay visible. Inspector and tool dock use the same width, preserving the viewport when switching. Choose section/body shape in Tool Profile and motion in Tool Path; there is no separate starting-points strip. Origin Type, Tool Profile Shape and Tool Path Type sit above their colored reference boxes. Reference point offset labels the U/V/N fields. Tool Effect Type is a dropdown. The fixed footer places Feature Name above Apply operation, Cancel and preview status in one row. Path Direction stays within Tool Path without a separate divider. Exact coordinates include (0, 0, 0); no separate Use world origin action is needed. Ordinary viewport picks update the tool from any scroll position: face → profile/support, edge → path, vertex → exact locked origin. Hover a selected-reference name or focus it with the keyboard to highlight that entity in cyan, without changing selection. Names include the component and numbered geometry label, such as Edge 13 or Face 4; the numbers describe the current topology and can change after rebuilding. Explicit reference slots override that inference. The target stays locked; source picks do not silently retarget. During tool setup the tree keeps the active component highlighted; other picks update references only. Cancel before changing active component. The origin normally follows replacement references; the origin lock preserves an anchor you chose deliberately.

- Edge + T suggests Round with its radius in Tool Profile. Shift-click adds/removes edges; connected chains can drive a custom sweep. Switch to Bevel or Draw profile on the perpendicular plane and sweep a custom section.
- Planar face + T suggests whole-face extrusion. Shift-click selects additional coplanar/parallel faces; their spacing and plane heights are preserved under shared travel. Multiple closed planar parts can be selected as sketch profiles from the tree. Circle → Hole setup in Tool Profile asks for a snapped point on the face plane, then shows its diameter in Tool Profile. Refine its U/V offsets under Tool Origin.
- Component + T retains the target and asks for a face/profile; a planar component supplies its existing profile. Vertex + T uses the exact vertex as origin. Empty selection starts a rectangular solid at world origin.
- Tool Path includes straight/symmetric/through-all, distance/percent sweep, revolution, helix, none, mirror and connected repeat. No motion creates/cuts planar parts with the same interaction.
- Align view in Tool Profile helps place inline polygon vertices. Clicks snap to 1 mm; numeric coordinates permit finer values. Close the profile before previewing.

Auto chooses Add/Remove from actual overlap with the current target and displays its decision. Mostly inside suggests Remove, mostly outside suggests Add. An explicit Tool Effect Type choice locks the result; New component and Hole preserve their preset intent. Accepted Auto operations retain a fixed Add/Remove result during later edits.

The edited component stays solid in its own color; inactive components become transparent during tool setup. Previous valid previews remain opaque until their replacements are ready, with no overlapping source fill. Coral marks Tool Origin; violet outlines/hatching identify the actual Tool Profile, and a violet mesh identifies a body tool. Blue marks Tool Path independently of selected orange edges: dash-dot for implicit normals, solid for direct edges, dashed travel and a dotted connector for parallel offsets. Travel inputs sit directly below the target-point reference under Tool Path. Use the adjacent **mm / %** selector for distance or percentage. A picked target shows projected travel in that same position. **Path Direction** labels the direction dropdown, with Reverse reference direction immediately below it. Percent uses the total native edge/chain length and updates when that reference changes; implicit normals require a distance. Sweeps default to 100% and support shorter travel; Reverse starts from the opposite end. Radius/diameter remain in Tool Profile. No operation input floats over the viewport. The viewport key names the reference. Material result does not flip direction: with an outward face normal, negative distance travels inward. Reverse reference direction is a separate explicit choice. Previewing changes no saved intent. During an update the previous mesh stays visible with a stale warning; only the newly validated current result can apply. Recent exact drafts are reused, and Enter starts pending computation immediately. Apply requires the current validated candidate to appear. Cancel discards the draft. Enter applies the current valid preview, waiting for computation/display if necessary. One Escape cancels the whole operation, even during picking/drawing or text entry. Editing after a queued Enter requires confirming again. Orbit/zoom/views remain available; export and exploded display wait until the operation closes.

[UNIFIED_OPERATIONS.md](UNIFIED_OPERATIONS.md) explains every launch point and supported combination. Wrapped emboss, arbitrary equations, nonzero-start/symmetric sweeps and branched path networks, tool libraries, and reopening existing recipe options in this dock are future work. Existing dimensions remain editable through their parameters.

## First precise part

1. Clear selection and press T. Set rectangle width 80, height 40 in Profile; distance 6 in Travel. In Result choose New component and name Mounting plate. Inspect the preview, then Apply.
2. In Top view, select the top face. T → Tool Profile: Circle → Hole setup. Click the desired position on the plane and set diameter 6 in Tool Profile. Under Origin refine U/V offsets, for example −32/−12 relative to face center. Through-all is the default. Apply; repeat at the other intended offsets.
3. Select an outer edge. T → Round, radius 2. Inspect the native preview; Apply affects this one selected edge. Bevel is available in the same workspace.
4. Clear selection, Tool → Tool Profile: Circle, then Tool Path: Straight travel / extrusion. Choose New component, name Alignment pin, diameter 5.7 and travel 10. Under Origin choose exact coordinates X −32, Y −12, Z 0. Apply.
5. Select the pin and Repeat part with X placement 64 for a second linked instance. Use this for separate parts; Connected repeat joins repeated geometry within one physical part.

Independent constructors create components. Initially disconnected additions disclose separate ownership in preview; later regeneration or a cut that splits one part fails safely. Body tools preserve source parts. Linked-definition edits affect every linked instance. Exact world inputs and reference positions resolve through the chosen target occurrence's placement.

## Named parameters and local dimensions

Open **Parameters** to create a deliberate named value, choose its dimensional type, edit it, or delete an unused one. Ordinary numeric entries remain local dimensions and do not appear in that list. Click a feature dimension in the inspector to change its value or type a named parameter instead. Cross-component fit constraints are disabled.

Typing letters in a numeric field shows matching compatible names. Tab completes the first suggestion; further Tabs cycle that matching list. Up/Down navigate, and Enter or clicking chooses a name. Enter used to accept a suggestion does not also apply the operation. Long lists scroll. Names containing spaces can be entered in brackets, such as `[Wall thickness]`. Expressions support units and arithmetic, for example `12 mm`, `0.5 in`, or `[Plate width] - 2 * [Edge offset]`. Renaming a named parameter preserves its explicit consumers.

Known parameter-driven viewport dimensions show `p:` beside the evaluated number. Hover reveals the full name. Sketch constraints retain their names after saving and reopening. Measurements whose provenance is unknown remain plain read-only values.

Tolerance fields remain available when editing a local length. They are nonnegative deviations below/above the nominal value; unspecified does not mean zero. See [Simple design intent](SIMPLE_DESIGN_INTENT.md) for the current reference and migration rules.

## Sketches and planar parts

Sketch uses the same ownership/parameter/history system. Use Sketch (E) in the main viewport, with a configurable grid (1 mm snap by default), then edit coordinates, radii and angles numerically. Lines, rectangles, circles, circular arcs, points and construction entities are available. Fixed geometry is the simple default. For solver-driven work, clear Fix new geometry and add constraints. Reopen existing sketches through their construction feature; surviving entity/parameter IDs are preserved.

Actual PlaneGCS reports degrees of freedom and redundant/conflicting constraints. Supported relations include coincidence, horizontal/vertical, parallel/perpendicular lines, equal length/radius, distance, angle, radius/diameter, anchoring, circular tangency and point-on-line/circle. Free coordinates are solver seeds; solved positions are derived outputs. Fixed coordinates and constraint dimensions express controlling intent.

Closed regions can extrude or revolve. Open curves remain visible and must close before solid creation. Nested loops form holes. A design sketch may retain disconnected regions, but separate physical pieces still need separate components and the initial tool integration requires one region per selected sketch. Splines and illustration are outside this build.

Create a rectangle/circle as a new planar fabrication component. Cut another profile from it using Cut from part. Stock thickness adds a named parameter and optional display-only extrusion. That preview adds no solid volume or extra part count and cannot export as STL. Extrude the profile explicitly, optionally reusing Stock thickness, to convert it into a solid. SVG and kerf output are later adapters.

## Assemblies and inspection

Repeat part creates a linked instance. Component pattern repeats with exact linear spacing or circular increments about the owning assembly origin/axis. Component actions → Make independent clones a selected definition and retains provenance; for a pattern member it extracts that member at its current pose.

Assembly group creates a container. Reparenting preserves the local transform, so world position can change if the new assembly is transformed. Use exact coordinates/rotations; geometry does not rely on free-space dragging.

Hide/show is display only; suppression explicitly changes manufactured quantities/export eligibility. Assembly metrics count linked uses. The Measure sidebar measures sampled points at actual placements. Static whole-component minimum separation and intersecting solid volume remain available through the backend API, rather than the point-measurement panel.

Booleans use source definitions in local geometry coordinates and do not implicitly consume/suppress their source instances. Mirror creates a separate dependent component. Connected pattern fuses translated copies and must remain one connected solid; Component pattern is for separate manufactured repeats.

## History and recovery

Saved locally means the edit is durable in the journal. YAML follows automatically. Preview does not change the saved design. Disk-write failure leaves the old document authoritative and reports failure. Snapshot warnings separately identify YAML refresh trouble.

Undo/redo preserves the action audit. Checkpoints name revisions; restoring creates a new revision. Activity records actor, revision and timing; atomic batches expand into inspectable steps committed together.

Double-click a feature to inspect its build stage. Cached views are reused; unknown/expensive paths require explicit computation. Returning to present only changes the view. Use suppression or dimension edits to change the design. Cancel terminates native work and discards stale results; the next operation restarts the worker without changing saved intent.

External agents join the same session and are visible in activity. Pause, step, resume and revoke control command boundaries. Human edits invalidate earlier proposals. Agent names identify local sessions rather than verified people. Manual tools work with agents disconnected. There is no embedded chat.

## Export and native documents

STL export selects exact instances, local-part or assembly coordinates and mesh precision. Each selected instance receives its own STL. Hidden parts remain eligible. Planar, incomplete or suppressed parts are rejected rather than silently omitted; deliberately select solid instances when needed.

Receipts record revision, millimeter units, frame, bounds, volume and validation coverage. STL itself does not store units. Validation checks the actual float32 coordinates, closure/winding/manifold edges/degeneracy and nonadjacent triangle intersections. The numerical intersection test excludes welded vertex-adjacent pairs; it is not an exact-arithmetic proof. Internal cavity shells are permitted.

Native snapshots include full history/checkpoints. UI Open a native design copy imports current intent into this project's undo history. Complete-history restore uses the CLI into a new folder. Unsupported/malformed schemas are rejected. STL import and mesh-to-feature-history reconstruction are not implemented.

### Editing selection groups

Shift-click toggles a face/edge before or during a tool operation. Path/profile counts and Shift-click instructions stay in their matching tool sections; they do not appear above Tool Origin. The viewport shows the selection count; the inspector shows combined face area or edge length and plural finishing actions. Tool Profile and Tool Path show group members with individual removal controls. Plain picks replace that role. Paths must be connected and unbranched for Sweep; finishing can apply one size to multiple target edges. Nonparallel profiles and invalid paths explain the problem and disable Apply. One shared dimension edit changes the entire group. Cancel/Enter and the locked active component behave as before. The limit is 64 references per role. A New-component result still has to be one connected solid; detached results need separate components. See [grouped workflow details](UNIFIED_OPERATIONS.md#shift-click-groups--october-24).


## Tool Origin, travel targets and face paths

The **world origin** is a selectable point. Click the center of the upper-right XYZ indicator while picking a Tool Path travel target to use (0,0,0) as the target; otherwise it sets Tool Origin. Tool Origin also has **Pick world origin**, and the travel-target card has **World origin**. These are actual reference points, retained as world-origin references rather than object or mesh IDs. In Move, the indicator center supplies the armed origin point or, by default, the target point.

Tool Path includes a separate **Travel target point** picker. Choose a vertex, native edge midpoint, edge center/end anchor, face center, or world origin. A target replaces measured distance for continuous travel. For straight travel the target is projected onto the path direction through Tool Origin; off-axis displacement is ignored. For Sweep, it is projected onto the translated finite curve/chain and native arc length sets the endpoint. Symmetric straight travel uses the projection as one end of the symmetric extent. Helical travel projects onto the axis to determine axial rise, while the angle controls rotation.

Clear a distance/percentage field and the target (or use **Use full path**) to traverse the entire finite selected path. An implicit normal or world axis has no finite length, so it requires a distance or target point; blank inputs never invent a length. Through-all and rotation-only modes retain their explicit meanings. Clear the target to enter a distance again. The viewport shows the actual target and a projection connector to the resulting travel endpoint.

When **Tool Path reference** is armed, selecting a face expands its complete native boundary into selected path edges. The profile and active component remain unchanged. This also works from the fillet/chamfer edge picker. Shift adds/toggles boundary members. Edges can be individually removed. A continuous sweep still requires a single connected, unbranched chain/loop: a face with holes may supply separate loops that must be reduced to the desired path. A rotation axis or Move direction still needs one straight line.

Fillet/chamfer Tool Profile now displays the **actual changed corner cross section**, cut from the before/after native geometry on a plane perpendicular to the primary selected edge. It is sampled at an interior path station so the section is well defined; it is not a square placeholder or an invented cutter. The panel reports its native area and whether material is removed or added (a concave fillet can add material). Full selected edges remain the normal finish. A target can limit a **single straight edge**; its endpoint has a planar cap. Curved/multiple-edge finishes currently use their full edges and explain the restriction when a partial target is requested.


## Sketch in the main viewport

Choose **Sketch** in the toolbar or press **E**. With a planar face selected the view aligns to that plane; otherwise it starts on World XY. Before drawing, choose XY/XZ/YZ or **Pick planar face**. While picking a plane, orbit or use the standard view buttons, then click a planar face. Escape stops plane picking. Plane changes are locked after geometry exists.

The side panel provides Line, Rectangle, Circle, Center arc, Point, Select and Project. Click in the viewport, or supply **U/V** in millimetres and choose **Place exact point**. Line continues a connected chain; **End chain / reset points** or Escape stops it. Rectangle uses opposite corners; Circle uses center/radius; Center arc uses center/start/end and runs counterclockwise. Pan with right/middle drag and zoom with the wheel. Fit design fits the current sketch while keeping its plane aligned. U/V axes, an adaptive grid, cursor coordinates and a provisional size remain visible.

Grid snap can be changed or set to zero. Existing sketch endpoints, midpoints, centers and origin snap within a screen-sized tolerance; lines align horizontally/vertically near their first point. Exact point entry bypasses grid rounding. Select geometry in the viewport or entity dropdown to edit coordinates/radius and change construction/fixed state. Undo sketch edit reverses local geometry/relationship edits. Deleting an entity also removes its attached constraints. Geometry is fixed to exact coordinates by default; adding a relationship frees its participating geometry. Relationships/dimensions solve on Finish and native conflicts leave the editor open for correction. There is no continuous solver preview yet.

**Project** picks a visible component edge, vertex or face boundary and copies its projection as construction geometry. Curves are sampled into lines and projected geometry does not follow later source edits. Turn off Construction on individual copies if needed as profile geometry. Show reference components controls their visibility while editing.

**Finish sketch** commits one authored sketch edit and restores the previous camera. Cancel discards local edits; Escape first stops an unfinished drawing action, then cancels. Sketches appear separately in the design tree, with Edit and session-only Show/Hide controls. Select a sketch and choose **Use as tool profile**, or choose Existing sketch in Tool Profile. New sketches belong to the design and do not create a physical component. Open sketches and several separate regions may be saved, but the initial material-tool integration requires one closed region, optionally with holes.

Inside a Tool operation, choose Draw profile or press E to suspend it and use exactly the same sketch workspace. **Finish & use profile** saves a root sketch and resumes the pending tool with it selected. If the sketch is open or has multiple regions, it is saved but remains open for correction before being attached. Cancel resumes the original tool unchanged. Existing component-owned sketches retain their original ownership; no automatic migration occurs.


## Group components

Choose **Group** in the top bar (**G**), name the group and check its members in the side panel or click them in the viewport. Enter applies and Escape cancels. Grouping preserves current positions. To populate an existing/legacy assembly, choose **Add to [group]** as Destination and select sibling parts.

Click a grouped body to select its whole group. **M** moves/rotates it with the standard live movement panel; a descendant body point may be its origin. **Copy group** appears in the toolbar/inspector when a group is selected. Copies have independent membership and placement, but part geometry stays linked. Double-click the group in the viewport or tree to edit its parts, then use **Done** or Escape to exit. Nested groups open one level at a time. **Ungroup** in the inspector preserves part positions and can be undone.

All tools has been removed. Shape edits use Tool; the remaining distinct workflows are available directly in the top bar. Small windows can scroll the toolbar horizontally. See [GROUPS.md](GROUPS.md) for ownership/copy details and current limits.


Tool Origin is reference-only in the operation panel. It follows picked geometry implicitly, or defaults to world origin for a blank start. For exact placement, click the world-origin dot in the viewport indicator and use Reference point offset (U/V/N). There is no separate origin-type or coordinate mode. Existing saved coordinate recipes remain compatible.


Tool Path extent uses a compact value field with an adjacent mm/% unit selector. Percent is available when a finite reference path exists. The field sits directly below the target-point reference. Path Direction labels the one-direction/symmetric/through dropdown, with Reverse reference direction directly beneath it; the redundant Extent label and explanatory paragraphs have been removed. Parameter reuse remains beside the units selector.

The main viewport world X/Y/Z axis lines are selectable reference directions, just like the corner axis controls. Hover a visible axis for its name and highlight, then click to set Tool Path direction or the movement reference axis. Origin/profile/target point picking keeps its own selection semantics; axes do not replace those point references. Model surfaces in front of an axis take precedence. World axes are infinite directions, so travel uses a distance or projected target rather than a finite-path percentage.

When a Tool Path or movement direction can be selected, arrow keys choose world axes: Up/Down = Z, Left = Y, Right = X. These shortcuts preserve arrow navigation in text/numeric fields, dropdowns and editable content, and do not override explicit origin/profile/target picking, sketch editing, or native fillet/chamfer edge paths. No operation is launched by an arrow key.

Contextual dimensions now appear directly on planar object faces beside their edges/features. Text tilts, skews and foreshortens with the face; rotate the model to read it. External dimension guides are replaced by these labels. Up to eight useful dimensions can appear for selection and five for hover (including group members), subject to fit, visibility and duplicate suppression. Tiny, hidden or curved faces do not receive a forced flat label. Hover an edge to see its exact length in the entity/component information box; curved edges report curve length. These are read-only measurements, not parameter-edit fields.

Edge midpoints are selectable in the normal 3D viewport. Hover near the center of a visible edge to identify its midpoint, then click to select the exact midpoint reference. Native endpoints retain their vertex targets; closed groups retain normal group selection until entered for editing. Preselected midpoints can then anchor a tool or movement operation.

The sidebar starts at Local Workspace, then the current design name and its part/unique counts. Rename the design in place using its pencil, double-click or F2; Enter or leaving the field saves, Escape cancels. Component groups expand/collapse with their chevrons and retain their nested structure. Double-click still enters group editing in the viewport while the complete sidebar tree stays visible. Selecting a nested tree row targets that occurrence directly; viewport selection keeps its group-scope behavior. Arrow keys navigate tree rows; Right opens a branch and Left closes it or focuses its parent. Branch expansion is local view state and creates no history action. Workspace switching remains future functionality.

Drag a component or group by its name in the tree to reorganize it. Drop on a group to move inside it; drop on a part to move to that part's containing level, or on the design name to move to the root. Geometry keeps its world position and orientation. Invalid cycle, shared-group and independent-pattern moves are rejected, and pending modeling operations must finish first. Each move is one undoable authored command.

Right-click a group for Add component inside group or Add subgroup. Right-click a part for Create group around component; this creates a group at that part's level and puts the part inside. Right-click the design name to create a root component/group. New parts start empty; use Tool to add geometry. The inline Create component row inserts alongside the selected row, or in the current edit group when nothing is selected. Its indentation shows the actual destination. Branches remain navigable throughout organization changes.

The sidebar has three primary collections: Components, 2D Sketches and 3D Tool Bodies. Use the + in 3D Tool Bodies to create a reusable solid, build it in the isolated tool workbench, and Return to design when done. Select 3D body in Tool Profile Shape to choose a saved tool from the library. Tools are parameterized and saved, but do not appear in assembly counts or STL exports.

Component lanes in the feature-history header separates nonempty component/tool histories while retaining every event's global horizontal column. Each lane's hide button merges its events into the top design lane. Restore lanes reverses that view choice; the main toggle returns to a single timeline. The expanded panel is height-limited and scrolls. Previous feature and Next feature step the global build prefix from Origin to Current without editing the saved document. See TOOL_BODIES_AND_HISTORY.md for working-frame semantics and limits.


## Sidebar and sketch workflow refinement — October 28

The design has a floor-plan blueprint icon; Fit uses interlocking pieces, distinct from Measure. The planar-stock-thickness tool and inspector controls have been removed. Existing stock metadata and engine commands remain readable for compatibility.

Components, 2D Sketches and 3D Tool Bodies use aligned headings and full-width separators. Group editing is indicated inside the selected group row, with italic Editing and Done controls. Double-click empty viewport space to leave the current group edit. Individual parts no longer have tree color swatches; a containing group's color is inherited by its members in the viewport, with the nearest nested group taking precedence.

Component definitions, including groups and tool bodies, use unique names (case-insensitive, with surrounding whitespace ignored). Creation and independent copies receive numeric suffixes when needed; duplicate manual renames are rejected. Linked instances keep their shared definition name. The `document.normalize_names` command repairs legacy duplicate definition names in one undoable action without changing reference IDs.

Starting Sketch without a selected planar face first opens the sketch panel in plane-selection state. Pick a planar face in the viewport or choose World XY/XZ/YZ; drawing controls remain inactive until the plane is chosen. The plane reference uses the same colored reference-box styling as tool operations. Selecting a face before starting Sketch or drawing a profile inside a pending operation retains the inferred plane. Escape cancels a sketch that is waiting for its plane.


The exploded-view slider spreads physical component instances away from the center of their combined bounding box. At 100% each component center is twice as far from the collection center as in the saved design; 0% restores the normal view. Hidden parts contribute to the overall center so hiding one does not shift the rest. Suppressed and unfinished parts without geometry are excluded. Parts whose centers coincide with the overall center stay in place. This display never changes placements or exports.

Use the bounding-box icon in the viewport controls to show orange bounds and a center cross for selected components; selecting a group shows its visible physical members. These are world-axis-aligned envelopes of each transformed local bounding box and may be conservative for rotated parts.


## Account menu preview

Click the R avatar in the upper-right corner for Profile, Account settings, Sign in and Create account placeholders. Account forms are explicitly marked as previews and disabled; they do not collect credentials, authenticate a user or change workspace access. External agents remains functional in this menu and provides the mobile route to the existing Agents panel.


Drag the grip along the top edge of Feature history / Activity up or down to resize the panel. Its contents scroll horizontally and vertically when they exceed the available space, with wider visible scrollbar tracks and thumbs. The chosen height stays while switching history modes during the session. Double-click the divider to restore automatic sizing. With the divider focused, Up/Down resize by 20 px (Shift: 50 px), Home minimizes it, and Enter resets it. Portrait mobile history supports the same divider; landscape mobile history fills its side panel.


In Agents, use **Copy Codex config** for a ready-to-paste TOML block and the exact configuration-file location. It targets the currently open workspace/design and reads its token from the local connection file. Codex configuration uses TOML, not YAML. The three-line main-menu button is to the right of RyanCAD.

A section plane reference now uses the same colored reference-card styling and pick/clear icons as Tool and Move. In the viewport, a faint violet plane marks the reference; an offset cut outline, dashed normal path, origin/end markers and signed distance label follow the configured offset. The reference plane remains at its copied location while the cut moves. These are display guides and do not alter the design.

The beaker **Experimental features** button immediately after Parameters opens optional browser-local settings. **Active component appearance** (`active-component-appearance`) offers Soft glow, Rim glow and Height gradient, with live strength and tint controls. Enabling it replaces amber whole-component edges with surface shading while preserving blue subfeature selection and hover feedback. It defaults to off; switching off restores the current styling. Settings survive refreshes without changing design files. See [Experimental features](EXPERIMENTAL_FEATURES.md) for mode IDs and lifecycle details.

**Measure** opens a right-side operation panel. Click point A, then point B in the viewport to see their distance, signed ΔX/ΔY/ΔZ and unit direction in design coordinates. Vertices and edge midpoints snap exactly; selecting an edge or face uses the location clicked, with edge length or face area shown as context. The world-origin marker can also supply a point. A labeled line joins the sampled points in the viewport and follows camera changes. Exploded display is reset while measuring so the displayed positions agree with design coordinates.

After a pair is complete, an ordinary click starts a new pair. Shift-click adds points to a chain, or removes an already sampled point at the same location. Chains show consecutive distances and total chain length. Click a point's reference card to replace it, use its × to remove it, or Clear points to start over. Hovering a reference card highlights its source geometry. Done or Escape closes Measure and returns to the inspector with the prior component selection retained. Measurements are temporary; they create no parameters, constraints, history events or saves. Document revisions clear samples to avoid stale measurements. This initial workflow samples 3D component geometry; sketch-entity measurement and whole-body minimum-separation analysis are not part of this panel.

## Bug reports

**Bug reports**, next to Experimental features, opens the server-wide list of bugs and feature requests. Use New report to add a title/date, steps, error message, notes and automatically filled browser/device details. Screenshots can be selected, dropped into the form or pasted while editing. Expand a report to read it or use Edit/Delete. Closing the menu retains an unsaved draft until page refresh; saved reports are shared across workspaces and survive server restarts. See [Bug reports](BUG_REPORTS.md) for storage and attachment limits.

## Browser graphics troubleshooting

RyanCAD's viewport requires WebGL 2 on the browser device, even when the server runs on another computer. If the browser cannot create its graphics context, a **3D graphics unavailable** message replaces the failed viewport startup while workspace/file menus remain accessible. This is a graphics diagnostic, not proof of a LAN or HTTPS problem. The app cannot enable a disabled browser GPU backend.

For Chrome, open `chrome://settings/system`, enable **Use graphics acceleration when available**, then fully quit and reopen Chrome. Inspect `chrome://gpu`, particularly WebGL/WebGL2, Problems Detected and GPU-process errors. If it still fails, update Chrome/macOS and try a Guest profile to isolate profile/extension behavior. Report Chrome/macOS versions and those GPU diagnostics if unresolved. Working Safari or Brave is a practical interim route. Do not disable the browser sandbox or force GPU blocklist overrides as a routine fix. Google's guidance: https://support.google.com/meet/answer/9302964?co=GENIE.Platform%3DDesktop .

# Parts, layouts and editor scopes

Browser designs use the Parts and Layouts structure from creation. Each design starts with Layout 1 and always retains at least one layout.

## Organization

- Designs switches between independently saved documents in the current workspace.
- Design Layouts are independent arrangements within one document, sharing its part library.
- A Layout contains placed Parts and Layout Groups. Moving or removing a placement does not change the part definition.
- A Layout Group organizes placed Parts and other Layout Groups in a layout. A Part Group organizes Components, nested Parts and other Part Groups inside a Part. They use `structure_role: group` with `group_kind: layout | part`; they cannot be moved across those two contexts. Layout groups can be moved together; Part Groups organize membership and their members are moved individually.
- A Part is a uniquely named reusable assembly containing Components, Parts and Part Groups.
- A Component is one solid or planar body. Component names may repeat; stable IDs distinguish them.
- Tool Bodies remain outside layouts, counts and manufacturing exports.
- Sketches remain design-level construction objects.
- Box, Sphere and Cylinder primitives create reusable parts with editable feature dimensions.
- Imported mesh bodies are read-only geometry. Their enclosing parts can still be placed and arranged.

## Editors

The viewport identifies Layout Editor, Part Editor, Component Editor or Sketch Editor. Select a library part to open its authoring view. Double-click a part or use Edit part to enter it; double-click its body to enter Component Editor. Done steps outward. Layout selection resolves a face hit to its enclosing part placement; modeling operations and measurement workflows still pick precise geometry references.

The existing sketch workflow remains shared between standalone sketches and ad hoc tool profiles. Feature history editing still updates the original feature in place.

## Variations

Use a named parameter in a part dimension first. Select the library part, choose Variation, check one or more used named parameters and supply override expressions. Variation names are unique within their base part. Edit values changes overrides; Place adds an instance to the active layout. A used variation cannot be deleted until its placements are removed.

Canonical storage contains only the base feature history and a variation record with part ID, name and parameter-ID-to-expression overrides. Evaluation regenerates the same features under each override context. Other dimensions and future feature edits remain linked. Virtual mesh identities are emitted for display and export, never persisted as independent feature copies. Invalid dimensions or downstream geometry failures reject the entire transaction.

STL export and design statistics use the active layout, excluding authoring occurrences and tool bodies. Multiple components in one part currently export as separate solid files.

## Compatibility and API

The existing assembly/instance engine remains the placement authority. Definitions gain an explicit structure_role; instances may name a variation. Document structure_version 1 enables the new rules. These are additive fields to native schema 0.2; older app builds do not understand them.

Commands: structure.enable, structure.rename, structure.remove, part.create, part.component.create, part.insert, part.primitive, partgroup.create, layoutgroup.create, layout.create, layout.select, layout.delete, variation.create/update/delete. All use the existing transaction, preview, revision, undo and agent interfaces.

## Follow-up decisions and limitations

- Part names are unique within a design document, not across independent workspace documents. Confirm whether a workspace-wide shared library is desired.
- Layout Groups and Part Groups have separate scopes; nested same-scope groups are supported.
- Variations edit named values, not feature suppression or different topology recipes. Nested combinations of variations need additional explicit semantics and testing.
- Referencing variation geometry in new modeling operations is not fully supported yet; movement references use picked coordinate snapshots.
- Imported bodies are marked read-only within their enclosing parts; a separate imported-parts catalog is a future presentation refinement.
- Library definition deletion and a dedicated variation comparison view are deferred. Removing placements retains reusable definitions.
- The first evaluator computes separate parameter contexts per variation and shares geometry caches. Large variant families need targeted regeneration/performance work.


## Workspace-rooted sidebar

The active workspace name is the root button and opens Workspaces management. Designs is a noninteractive list label below it; all nondeleted designs are listed. Layouts is a noninteractive label inside an expanded design. The active design and layout use the existing highlight styling. Layout Tree shows the active layout’s groups and part placements; Part rows never expand to expose components there. The 3D Parts tree exposes each definition’s components, nested parts and part groups. The viewport shows the active editing context and its Done control; the parts list does not duplicate those controls. Entering a Part Group keeps the Part Editor context. Every design retains at least one layout.

Creation actions use compact plus icons in the Designs, Layouts, Layout Tree, 3D Parts, 3D Tool Bodies and 2D Sketches headers instead of separate add rows. The workspace manager keeps its admin key in the bottom-left footer. Workspace renaming refreshes the tree and list, synchronizes the name field when metadata loads, and confirms a successful save.

The Layout Tree plus opens Place linked part directly under that section's header, above existing placements. Choose a part from the dropdown or click it in the 3D Parts tree; both inputs stay synchronized and the chosen library rows are highlighted. While this form is open, clicking or double-clicking a library part chooses it instead of changing editor scope. Place commits the linked placement; Cancel leaves the design unchanged. Nested-part insertion uses the same controls at the top of 3D Parts instead.

Workspace imports and native replacement must preserve the structured Parts/Layouts model with an active layout. Flat standalone documents without that structure are rejected instead of creating a design with an empty layout list.


## Group operation

The toolbar shows **Layout Group** in the Layout Editor and **Part Group** inside parts/components; G opens the current operation. The panel starts with **Group Operation Type**, whose choices are always **Create New Group** and **Add to Existing Group**. **Group name** is text for a new group and a dropdown of existing sibling groups for Add. Only selected members appear below, with an X to deselect each. Pick additional members in the viewport or tree; Shift-click can preselect multiple tree items. Tree highlighting follows the pending selection. An existing destination cannot be one of its own members. No existing groups leaves Add available but Apply disabled until there is a valid destination. Grouping preserves world placements, including when adding to a moved group.

The shared group scope resolver lives in `structure_scopes.py`, used independently by grouping, movement and project-structure validation. Restart the server after backend updates so long-running Python modules load the same version.


The 3D Parts section has a collapsible **Custom Parts for this Design** root above the reusable part tree, aligned with the Primitives and 3D Tool Bodies lists. Its plus creates a custom part. It starts expanded and opens automatically when choosing a linked part for placement.

## Copy and paste in layouts

Repeat Part is omitted from the Layout Editor toolbar. Existing Duplicate in Layout context actions remain available. Select one or more placed parts and press Ctrl+C, then Ctrl+V (Command+C / Command+V on macOS). Copy records their placement snapshots without editing the design. Paste adds linked instances of the same definitions and variations, preserves relative positions and rotations, and selects the new placements for moving. Each paste offsets the copied arrangement by another 30 mm along world X so copies are visible. Multi-part paste is one transaction and one Undo.

The clipboard stays in this app tab and design, and can paste into another layout or the layout group being edited. Removing the original placement does not invalidate the clipboard while its part definition remains available. Part/Component and Sketch Editors keep their own workflows. Text inputs and editable content retain ordinary clipboard shortcuts; these keys are reserved from toolbar shortcut reassignment.

**Remove from Layout** in the viewport or layout-tree context menu applies immediately without a confirmation dialog. The green completion notification includes **Undo** for ten seconds. This restores the placement through ordinary design history and leaves the reusable part definition intact. Its Undo button is disabled once a newer revision exists, avoiding accidental undo of another operation. Definition deletion retains its confirmation dialog.

Delete and Backspace perform the same removal on selected layout parts or groups. Multiple selected placements are removed together and restored by one Undo. These keys do not delete library definitions, act during a pending modeling/movement operation, or override text-field and Sketch Editor editing.

## Reference parts

The sidebar's **Parts Available to This Design** section contains **Custom Parts**, **Reference Parts**, Primitives, and 3D Tool Bodies. Header spacing is compact beneath each heading, with additional separation before major sections. Editing a placed part highlights the matching definition in Custom Parts.

Use **+** beside Reference Parts to browse designs in browser-owned workspaces, expand a design, select custom parts, and import them together. Imports are self-contained snapshots of the saved part definitions at their source revisions, not live cross-design links. Native features, internal component arrangements, dimensions and nested variations are copied with new IDs; parameter values are captured so later source edits do not change the reference. References are not placed in the active layout automatically. Their cyan ribbed-cylinder icons and source tooltip distinguish them from custom parts.

Reference definitions, their child arrangements, features and dimension values are immutable through normal commands, including external-agent commands. Layout placements remain movable and removable. **Create custom part** in a reference part's context menu creates an independent editable definition in Custom Parts and retains the original reference. A mesh-only imported body retains its existing mesh editing limitations. Undo restores imports/customizations as ordinary authored transactions. Automatic source refresh/version updates are deliberately not provided.

The Reference Parts catalog also includes the bundled **Mounting plate · fit study** and **Silicone mold · printed tooling** designs; their individual parts use the same read-only snapshot import flow. A cyan ribbed-cylinder icon distinguishes Reference Parts in the library, tree and picker. Catalog errors show an actionable explanation and Retry. If the browser has newer Reference Parts UI than the running server, restart RyanCAD and refresh. Dialogs render outside the sidebar stacking context so viewport origin markers and other overlays stay behind them.

The reference picker groups sources in this order: **Your designs**, **Stock / standard designs**, **Shared designs**. Each source list has its own bounded scroll area. Your designs retain workspace labels to distinguish similarly named designs across owned workspaces. Shared designs currently displays an empty state; publishing and access to other users’ designs are not implemented. Selection is retained across source lists, and Import applies the combined selection.

Primitive and 3D tool-body rows reserve the same disclosure space as reusable part rows, aligning their icons and labels even though they have no expand arrow.

Reference import source sections are separate bordered boxes. Each design row uses the shared sidebar blueprint icon and a chevron that rotates when expanded. **Edit part** or double-clicking a reference definition in the Reference Parts tree first creates an editable custom copy and opens its Part Editor, retaining the original reference. **Create custom part** remains available to copy without opening the editor.

The import dialog includes a read-only 3D preview. Click or focus a part row to preview it; checkboxes still control the import selection independently of which part is being viewed. The preview renders the part definition with its nested component placements, without creating a design, importing anything, moving layout objects, or adding history. Desktop uses a preview beside the source lists; narrow screens place it below them. Orbit/Pan buttons select the primary drag action; right-drag pans, the wheel zooms, and Fit recenters the part. Touch uses one finger for the selected action and two fingers to pan/zoom. Camera distance is clamped to 1.25–10 times the part bounding-sphere radius; the pan target stays within 0.65 radii of its center. Pending requests are debounced, superseded browser requests are aborted, and recent previews are cached for the lifetime of the dialog.

## Primitive templates and copies

Left-click a primitive to inspect its isolated template in the main **Part Editor** view, with its parameter values in the inspector. This is a read-only template view: it does not add a part, alter the active part, change a layout, or create a history event. Orbit, pan, zoom and Fit use the bounded part viewer. **Done** or Escape returns to the preceding viewport and camera. Select another part or sketch to leave template inspection.

Each primitive has a collapsed-by-default parameter list in the sidebar. Expanding it shows parameter names with a drawn parameter glyph; no numeric measurements appear in that list. Values are shown in the template inspector and configured when creating a copy. The primitive's context menu (sidebar or isolated viewport) offers **Add to layout** and **Add to active part**. The latter stays visible but disabled unless an editable part is open. Both actions open a parameter/name dialog before making the copy. Enter submits; Escape or Cancel discards it. Every accepted copy has its own part definition and feature dimensions. Adding to the active part creates a nested part placement rather than a new top-level layout placement, then returns to that part's editor. The primitive template itself remains unchanged.


## Browser startup

A new browser session shows **Welcome to RyanCAD**, a name field with **Enter a name to use with your workspace**, then **What would you like to work on?** Returning browsers show **Welcome back, [Name]** and an editable **Change name** field. Unrecognized browsers enter a display name; the default workspace becomes **[name]'s Workspace**, and the account avatar/menu uses that name. The name is retained on the server against the browser's existing owner cookie; this does not add authentication. Existing custom workspace names are preserved.

Startup embeds the same workspace/design picker used elsewhere. Designs are grouped by accessible workspace, with the current workspace first and RyanCAD's stock workspace last. It suggests the most recently edited saved design and offers a new blank design. Both **Last edited** and **Last active** labels are shared with the standalone picker. The untouched automatically-created blank is reused for first-time starts; opening an included design creates an editable independent design and preserves any existing work. Design names remain unique. Startup states that each completed operation is saved automatically.

Completion/dismissal is stored in sessionStorage, so ordinary refreshes and navigation reloads do not reopen startup. A new tab/session can show the choices again while retaining the display name and workspace through cookies. Returning users can dismiss the chooser to keep their current design. The header mark is a plain isometric box, and sidebar parameter glyphs are SVG paths, without font dependencies. Welcome shows the complete box-and-RyanCAD wordmark with the original wordmark weights; other modal headers have no logo.


## Opening and importing designs

The **Designs +** button, **Import → Reference designs**, and the design tree's management context action all open **Open or import a design**. This replaces the separate design-management and reference-example dialogs. The picker groups accessible browser-owned workspaces (plus server workspaces revealed by the admin key) and the bundled **RyanCAD stock / standard workspace**. The current workspace contains the New blank design option. Existing designs open in their own workspace; stock designs import as uniquely named editable copies into the current workspace. Ordinary picker imports always make a new design and retain the current one. Welcome may reuse only the untouched initial blank.

Selecting a design previews its active layout, falling back to the first layout if necessary; the preview names the layout. Other layouts, unplaced library definitions, hidden/suppressed objects, and tool bodies are excluded. Empty layouts show a compact message. Orbit/pan/zoom/Fit use the bounded viewer without changing designs, placement or history. On mobile the preview stacks beneath the workspace lists.

Rename and Delete remain in the current workspace design rows' context menu. Deletion asks for confirmation; Deleted designs offers Restore. Workspace recovery and workspace creation remain in the workspace-name management menu. Welcome name changes also update the profile/avatar and an automatically named personal workspace, while custom workspace names remain unchanged. Refreshes continue to skip welcome for the active browser session.

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

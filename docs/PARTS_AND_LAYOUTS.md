# Parts, layouts and editor scopes

New browser designs start with parts and layouts. Existing documents retain their original structure until **Organize into Parts & Layouts** is clicked. Conversion is a normal saved, undoable transaction: body IDs, feature histories and world placements are preserved.

## Organization

- Active Designs switches between independently saved documents in the current workspace.
- Design Layouts are independent arrangements within one document, sharing its part library.
- A Layout contains placed Parts and Part Groups. Moving or removing a placement does not change the part definition.
- A Part Group contains Parts only. It organizes membership; move its individual part placements instead of transforming the group.
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

Commands: structure.enable, structure.rename, structure.remove, part.create, part.component.create, part.insert, part.primitive, partgroup.create, layout.create, layout.select, layout.delete, variation.create/update/delete. All use the existing transaction, preview, revision, undo and agent interfaces.

## Follow-up decisions and limitations

- Part names are unique within a design document, not across independent workspace documents. Confirm whether a workspace-wide shared library is desired.
- Part Groups contain only Parts, following the prose definition; nested groups in the example outline are not enabled.
- Variations edit named values, not feature suppression or different topology recipes. Nested combinations of variations need additional explicit semantics and testing.
- Referencing variation geometry in new modeling operations is not fully supported yet; movement references use picked coordinate snapshots.
- Imported bodies are marked read-only within their enclosing parts; a separate imported-parts catalog is a future presentation refinement.
- Library definition deletion and a dedicated variation comparison view are deferred. Removing placements retains reusable definitions.
- The first evaluator computes separate parameter contexts per variation and shares geometry caches. Large variant families need targeted regeneration/performance work.

# Component groups

Groups reuse assembly definitions and placed instances. They organize manufactured components without Boolean joining their solids, changing component dimensions, inflating material quantities or losing individual STL export targets.

## Human workflow

1. Select components, optionally with Shift, then choose **Group** in the top bar or Ctrl/Cmd+G. The member list also works without prior selection.
2. Give the group a name, check its members and apply. Viewport clicks toggle whole components/groups while the panel is open. Enter applies; Escape cancels.
3. Outside group editing, clicking any grouped body selects the immediate closed group. All its physical descendants receive the orange component outline. **G / Move Component** moves or rotates the group through the existing preview/apply/cancel workflow. A point on any descendant may serve as its movement origin.
4. **Copy group** in the top bar or inspector copies group structure and membership, with a 30 mm parent-X offset. Physical part definitions remain linked. Copied group membership and instance placements are independent.
5. Double-click a group in the viewport or tree, or choose **Edit group**, to enter it. The tree shows its immediate children and outside components are muted. Parts regain normal face/edge/vertex editing. Nested groups open one level at a time.
6. **Done** or Escape outside an operation returns to the containing level and selects the group.

To add components to an existing group, select **Group**, choose **Add to [group]** as Destination, and select sibling components. This also makes legacy empty assemblies useful. **Ungroup** in the inspector dissolves the placed group without moving its children; Undo restores it. Grouping, adding, copying and ungrouping are authored, durable design actions.

## Geometry and placement behavior

- New groups insert an identity frame under the common parent. Existing member placement parameters/expressions remain intact, so organization alone does not move geometry or break parameter reuse.
- Adding to a moved group rebases new members into its frame. Ungrouping composes the group and member transforms. Both preserve the current world pose using new placement parameters, while retaining prior parameter identities for existing consumers.
- Native occurrence references follow path changes on grouping/reparenting, including target, profile, path and travel references. Physical definitions and feature identities remain unchanged.
- A copy recursively creates independent assembly definitions and child instances. Geometry definitions remain shared; changing a part's dimensions changes every linked use. Placement and pattern values are copied into independent parameters.
- Group counts/statistics aggregate physical descendants. Groups do not contribute their own volume or synthetic mesh.
- Ungroup retains the now-unplaced assembly definition and historical parameters so parameter users remain valid; it removes the placed container from the tree. Cleanup/compaction is separate work.

## Scope and limits

Membership selection is restricted to siblings in the current edit level, with 1–200 selected members. Individual component-pattern members require Make independent before regrouping. Membership changes to multiply-instanced legacy assembly structures are guarded; copying the group creates an independent structure first.

New physical parts created through the universal tool currently enter the root design. To include one in a group, finish the operation, return to the containing level and add it through Group. Automatically assigning new construction to the active group is a follow-up workflow decision.

## API

All commands use the same revision-checked command/preview/history system as other edits:

| Command | Arguments |
|---|---|
| `group.create` | `name`, `occurrences: [placed sibling IDs]` |
| `group.add` | `group: placed group ID`, `occurrences: [placed sibling IDs]` |
| `group.copy` | `occurrence`, optional `name`, optional parent-frame `offset: [x,y,z]` |
| `group.ungroup` | `occurrence` |

Group create/add receipts return `component_id`, `instance_id`, `occurrence_id`, `occurrence_map` and `placement_rebased`. Ungroup returns its occurrence path map. Geometry reference remapping is part of the same transaction.

## Toolbar

The All tools dropdown is removed. Shape/profile/motion shortcuts that duplicate the universal Tool workflow are removed from the tool catalog. Distinct workflows have direct toolbar buttons: Tool, Group, Sketch, Move Component, Repeat part/Copy group, Array parts, Stock, New parameter, Fit, Measure, Checkpoint and Parameters. Captions are compact; accessible labels/tooltips retain complete names. Narrow windows can scroll the toolbar horizontally. Ctrl/Cmd+K remains a secondary command search for these distinct actions.

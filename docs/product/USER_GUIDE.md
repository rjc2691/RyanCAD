# UI guide

[Install and start](../../README.md) · [Server help and backups](HOSTING.md)

## Workspace and project structure

```text
Workspace name → workspace manager
Designs
  Design → Layouts → active layout
Layout Tree
  Layout groups → placed parts
Parts Library for this Design
  Custom Parts → part groups, nested parts, components
  Reference Parts
  Primitives
  3D Tool Bodies
2D Sketches
```

| Item | Meaning |
|---|---|
| Workspace | Collection of designs. Click its name to open management. |
| Design | Layouts, reusable parts, sketches, named parameters, and history. |
| Layout | Arrangements of part copies; placement edits do not reshape components. |
| Part | Reusable definition containing components, nested parts, and part groups. |
| Component | One solid body, edited with modeling operations. |
| Reference part | Read-only snapshot from another design; editing creates a custom copy. |
| Tool body | Modeling geometry excluded from normal manufactured-part totals. |

- Section **+** buttons create/place items. Right-click items for context actions.
- Expand branches with chevrons; drag supported items to reorganize them.
- Workspace **Rename** edits in place. Enter/checkmark saves; Escape/Cancel discards. Inactive workspaces can be renamed without switching.
- The manager's key opens the server-wide admin list; the convenience password is `ryan`. Workspace deletion asks for confirmation.
- Design management includes deletion/restoration. Keep the workspace recovery code for another browser.
- **RyanCAD Public Workspace** contains the mounting plate and silicone mold designs. Opening one uses its saved design, without an automatic personal copy. This workspace is shared.
- Click a primitive to inspect it in isolation; right-click to add a copy to a layout or active part and configure its dimensions.
- **Reference Parts +** browses accessible designs. Imported definitions stay unchanged; their context menu creates an editable custom copy.

## Editors and selection

| Editor | Work on |
|---|---|
| Layout Editor | Placed parts and layout groups |
| Part Editor | Contents of a reusable part |
| Component Editor | A component or tool body's geometry |
| Sketch Editor | Design-owned 2D geometry and constraints |

Double-click a part or use its context action to enter its editor. Follow the editor label and active-item indicator. **Done / Return to layout** leaves the editing context; empty-space double-click can exit group editing.

- Hover identifies the next click target. The viewport legend distinguishes it from selected geometry and the active part.
- **Shift-click:** add/remove supported selections. **Ctrl-click:** deselect.
- **Escape:** cancel the current operation; clear selections when nothing else remains.
- In Layout Editor, Ctrl/Command+C and V copy/paste parts. Delete/Backspace removes the selected placement; the completion notice offers Undo.
- The inspector shows design, part, or selected-geometry information. Descriptions are editable; design display units support mm/in.

## Navigation and layout

| Context | Navigation |
|---|---|
| 3D | Left-drag orbit; right-drag pan; wheel zoom |
| Sketch | Right-drag pan; Shift+right-drag orbit within the front side of the plane |
| Touch | Drag to orbit; two fingers to pan/zoom |

- Top-right axes follow the camera. Front/Top/Right/Iso set standard views.
- Origin, axes, endpoints, and midpoints are reference picks. Plane markers appear when plane selection is needed.
- Drag the project-sidebar divider or timeline's upper edge to resize them.
- Toolbar buttons form one group between the sidebars. Overflow uses the chevron tray; Settings stays beside the arrow.
- Phones use **View / Design / Inspector / History** at the bottom. Drafts remain mounted across pane changes.

## Model with Tool

Select geometry, then press **T**. With no body selected, Tool starts with **Create New Part**.

For a first solid: start Tool, choose a rectangle profile and straight path, set its width/height/travel, then Apply. Place the resulting part in a layout from the parts context menu or the Layout Tree **+**. Open the part/component editor to reshape it; layout movement only changes placement.

```mermaid
flowchart LR
  A[Pick geometry or start Tool] --> B[Effect]
  B --> C[Profile]
  C --> D[Path and travel]
  D --> E[Origin]
  E --> F[Validated preview]
  F --> G[Apply]
```

All sections remain available together; reference picks update the draft.

| Section | Configure |
|---|---|
| Tool Effect | Create New Part, Auto, Add material, Remove material, or Intersect |
| Tool Profile | Basic shape, face, sketch, body, or generated round/chamfer cross-section |
| Tool Path | Straight travel, selected path, revolution, or other supported motion; direction and extent |
| Tool Origin | Reference point, usually inferred; world origin is selectable |

| Starting selection | Suggested setup |
|---|---|
| Planar face | Face profile with normal travel; extrusion or placed hole profile |
| Edge | Path for round/chamfer, sweep, or perpendicular profile |
| Closed sketch | Sketch profile |
| Point | Operation origin |

- New face picks replace profiles; edge picks replace paths. The target component stays fixed until cancellation.
- Shift-select connected path edges **on one component instance**. Multiple planar profiles must satisfy the operation's plane requirements.
- Travel accepts distance, percentage of a finite path, or a target projected onto the direction. Blank distance/target means full **finite** path; an implicit normal needs an extent.
- Negative distance reverses travel; it does not change Add into Remove. Auto infers effect from overlap.
- Reference colors identify profile, path, and origin. Unsupported combinations explain why they cannot apply.
- **Enter applies; Escape cancels.** Draw Profile temporarily uses the same Sketch Editor below.

## Move and group

**M** starts Move Part in a layout, or the corresponding move operation in other editors.

| Method | Inputs |
|---|---|
| Reference movement | Origin, target, direction, optional exact distance; picks determine motion |
| XYZ distances and rotation | Numeric translation and rotation increments |
| Rotation | Axis and angle |

Drag an XYZ arrow to slide along its axis; edit the displayed distance for precision. The preview follows the move and a ghost marks the original position. For direction picking: Up/Down = Z, Left = Y, Right = X. Enter/Apply commits; Escape/Cancel discards.

**G** groups selected parts in a layout, or creates a part group in the relevant editor. Choose **Create New Group** or **Add to Existing Group**. Groups organize geometry; they do not create joints.

## Sketch and constrain

1. Press **E**. Pick a world plane or planar face if none was selected.
2. Draw in the main viewport; existing bodies remain available for copied projection.
3. Finish saves the sketch and restores the previous view/workflow. Cancel discards the draft.

| Tools | Default keys |
|---|---|
| Select / move | Space / M |
| Line / rectangle / circle / center arc | L / R / C / A |
| Point / project | P / J |
| Dimension / connect / disconnect | D / K / U |

- Closing a line loop ends its chain. Endpoints and midpoints are picks; geometry snapping takes priority over the grid. Toggle grid snap in the viewport.
- Select points/lines individually; Delete removes selected geometry. Space ends drawing and selects.
- **D** on one line edits length in place. Two lines offer angle or, when parallel, separation. A line and world axis offer an angle. **Tab** cycles ambiguous choices.
- Dimension edits update geometry during editing. Persistent constraints look different from read-only measurements.
- Projection copies geometry; it does not attach the sketch to the source body.

## Parameters, inspection, and history

- **Parameters / P:** optional named values. Ordinary numbers stay local. Type letters for suggestions; Tab cycles matches. Parameter-derived labels can show `p:` and a name tooltip.
- Part variations share features and override selected named values; create them from the part context menu.
- Hover/select for on-face dimensions and inspector details. **Measure / I** shows point-to-point distance and XYZ components; edge/face clicks supply clicked points too.
- Section view uses a reference plane and movable offset. Exploded view changes display positions, not saved placement.
- Timeline arrows inspect build stages. Double-click supported features to edit dimensions/effect; saved references can remain read-only. Undo/redo and checkpoints retain authored history.
- Component lanes separate events by part; hiding a lane folds its events into the design lane.

## Files, agents, and preferences

| Transfer | Behavior |
|---|---|
| RyanCAD Design file | Import separately; `.rycad.zip` retains history. YAML contains current intent only. |
| STL | Import one closed solid, at most 5,000 facets; export selected solid instances. RyanCAD uses mm. |
| SVG | Import as a sketch; export selected sketches in their own plane coordinates. Multiple sketches download as a ZIP. |
| Workspace folder | One-time transfer of designs/history/exports, **not** automatic folder sync |

Direct folder export needs supported Chrome/Edge over HTTPS or localhost; Brave may need File System Access enabled. Safari/Firefox support folder import but not direct export. The dialog explains browser support before transfer.

- **Agents:** copy Codex config, inspect/pause/revoke sessions, follow work, or disable MCP server-wide. Other harness tabs are placeholders. See [MCP contracts](ENGINE.md#external-agents-mcp).
- **Settings:** edit hotkeys, resolve conflicts, reset defaults, and reorder toolbar buttons.
- **Testing:** experimental appearance/theme controls; preferences do not change geometry.
- **Bug reports:** shared bug/feature reports; paste, drop, or upload screenshots.
- The profile menu is a placeholder, not an account/login system.

Accepted operations autosave. Tool/sketch drafts require Apply/Finish. See [backup and recovery](HOSTING.md#backups-and-recovery).

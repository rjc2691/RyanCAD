# Using RyanCAD 0.1

## The workspace

The left tree contains physical instances and assembly groups. Linked parts share a definition and show a count badge. The inspector shows selected dimensions, bounds, area/volume, construction, parameters and creator/modifier. The bottom has separate feature build sequence and durable activity views. Metrics identify the inspected revision.

Use All tools or Ctrl/Cmd+K to find an operation. Drag to orbit, right-drag to pan, scroll/trackpad to zoom, F to fit, and Top/Front/Right/ISO for standard views. Ctrl/Cmd+Z undoes; Shift+Ctrl/Cmd+Z redoes. Shortcuts leave normal text entry alone.

Select a component in the tree or a face/edge in the viewport; Shift adds a viewport selection. Eligible top faces expose their generating dimension and exact push/pull offset. Selected edges offer semantic fillet/chamfer targeting. Section view is display clipping, without a filled cap. Exploded display moves the picture; authoritative placements and measurements stay unchanged.

## First precise part

1. All tools → Box. Keep New component, name it Mounting plate, length 80, width 40, height 6. Apply.
2. Hole → choose the plate. Diameter 6, columns 2, rows 2, spacing X 64/Y 24, X/Y position −32/−12. Through all is the default.
3. Fillet → radius 2, all vertical edges. Selection count is remembered so topology changes cannot silently target a different set.
4. Cylinder → New component, name Alignment pin, diameter 5.7, height 10. Expand Exact placement and set X −32/Y −12/Z 0.
5. With the pin selected, Repeat part → X placement 64. Both instances share geometry, with centers at −32 and +32 because the definition's local center is −32.

Boxes/cylinders have a centered XY footprint and bottom Z. Profiles use their named plane. Instance transforms then place local geometry in an assembly. Changing a definition updates linked uses; changing an instance placement moves one placed use.

New constructors default to components even when touching another part. An initially disconnected additive constructor is automatically assigned separate ownership. If an existing feature becomes disconnected during regeneration, the edit fails safely; physical part count never silently increases during regeneration. Explicit New on an already-owned solid is rejected.

## Parameters and fit intent

Click inspector dimensions or open Parameters. Filters distinguish independent roots, shared inputs, a component, favorites and unused inputs. A parameter dialog shows upstream references, root inputs, downstream consumers, formula, scope and tolerances. Preview impact evaluates without committing.

Use ↗ beside an input to reuse a parameter. Equal numbers entered separately remain independent. Favorite/promote standards; explicitly link or detach feature uses. Referenced parameters cannot be deleted.

Expressions support units and arithmetic, for example `12 mm`, `0.5 in`, `[Plate length] - 2 * [Edge offset]`, or `sin(30 deg) * 20 mm`. Names resolve locally first. Use `[Component name::Parameter name]` or a stable ID for ambiguous names. Renaming preserves stored references. Internal lengths are mm and angles degrees; changing display units never rescales geometry. Inputs visibly labeled mm remain mm inputs unless a unit is typed.

For holes that track plate edges, create shared `Edge offset = 8 mm` and use:

```text
X position      -[Mounting plate · length]/2 + [Edge offset]
Y position      -[Mounting plate · width]/2 + [Edge offset]
Column spacing   [Mounting plate · length] - 2 * [Edge offset]
Row spacing      [Mounting plate · width] - 2 * [Edge offset]
```

Tolerance fields are nonnegative deviations below/above nominal in canonical units. Unspecified does not mean zero. Fit relationships name the pin/socket diameter parameters and radial/per-side or diametral/total convention. The fit panel reports nominal difference and worst-case limits only when both tolerances exist. Manufacturing calibration remains a design input.

## Sketches and planar parts

Sketch uses the same ownership/parameter/history system. Click snapped points (0.5 mm grid), then edit coordinates, radii and angles numerically. Lines, rectangles, circles, circular arcs, points and construction entities are available. Fixed geometry is the simple default. For solver-driven work, clear Fix new geometry and add constraints. Reopen existing sketches through their construction feature; surviving entity/parameter IDs are preserved.

Actual PlaneGCS reports degrees of freedom and redundant/conflicting constraints. Supported relations include coincidence, horizontal/vertical, parallel/perpendicular lines, equal length/radius, distance, angle, radius/diameter, anchoring, circular tangency and point-on-line/circle. Free coordinates are solver seeds; solved positions are derived outputs. Fixed coordinates and constraint dimensions express controlling intent.

Closed regions can extrude or revolve. Open curves remain visible and must close before solid creation. Nested loops form holes; disconnected pieces need separate components. Splines and illustration are outside this build.

Create a rectangle/circle as a new planar fabrication component. Cut another profile from it using Cut from part. Stock thickness adds a named parameter and optional display-only extrusion. That preview adds no solid volume or extra part count and cannot export as STL. Extrude the profile explicitly, optionally reusing Stock thickness, to convert it into a solid. SVG and kerf output are later adapters.

## Assemblies and inspection

Repeat part creates a linked instance. Component pattern repeats with exact linear spacing or circular increments about the owning assembly origin/axis. Component actions → Make independent clones a selected definition and retains provenance; for a pattern member it extracts that member at its current pose.

Assembly group creates a container. Reparenting preserves the local transform, so world position can change if the new assembly is transformed. Use exact coordinates/rotations; geometry does not rely on free-space dragging.

Hide/show is display only; suppression explicitly changes manufactured quantities/export eligibility. Assembly metrics count linked uses. Measure between parts returns static minimum separation and intersecting solid volume at actual placements, not motion or process simulation.

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

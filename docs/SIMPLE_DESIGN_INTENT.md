# Simple design intent

These October 28, 2026 decisions replace the earlier automatic-parameter and live cross-component-reference requirements.

## References are one-time construction aids

Picking a point, face, edge, axis, sketch profile, or tool body helps configure the current operation. Once accepted, external geometry and its relative frame are copied into that operation. The source can subsequently move, change, or be deleted without changing the accepted result. World-origin placement is captured in the component's local frame, so moving the component moves its geometry too.

An operation may still refer to its own earlier geometry, such as the edges being filleted. Its dimensions remain editable. Independent feature history, undo, redo, previews, component groups and linked instances remain available. A linked instance shares a part definition; it is not a constraint between separately defined parts. Cross-component fit relationships and automatic reuse of another ordinary dimension are disabled.

Sketch projection copies geometry into the sketch plane. The picked component does not remain attached. Sketch-local length, angle and other explicit sketch constraints remain supported. A root sketch used by a solid operation is copied as a profile at acceptance; subsequent sketch edits do not change that independent solid operation.

## Numeric dimensions and named values

Entering a number creates an ordinary local dimension. It does not create a named entry in the Parameters window. A user deliberately creates named values in that window, with a unique name, value and dimensional type. Named values can be used directly or in expressions; changing one updates only explicit consumers.

Typing a name into a numeric field shows matching compatible parameters. Tab selects the first match, and further Tabs cycle the original matching list. Up/Down navigate it; Enter or clicking accepts the selected name. The list scrolls when necessary. Accepting a suggestion with Enter consumes that key; a subsequent Enter confirms the operation normally. Escape retains the surrounding operation's cancellation behavior.

Reusable numeric inputs, tool and movement quantities, sketch dimensions and constraints, and sketch entity coordinates share the same suggestions. Sketch U/V placement inputs resolve named values when the point is placed. Grid settings and export precision are application/output settings rather than persistent geometric dimensions.

Viewport dimensions with known parameter provenance show `p:` and the evaluated value. Hover displays the full parameter name. Sketch constraints retain this provenance when edited and reopened. Solid annotations are currently tagged for known primitive dimensions; a read-only measurement is never labeled as parameter-driven merely because its number happens to match a parameter.

## Saved designs and migration

The existing journal is preserved. On the next accepted edit, legacy geometric links are resolved at their saved placements, copied into operation-owned snapshots, and detached before the new edit is evaluated. This fixes movement without retroactively moving an existing part during migration. Undo retains the prior saved revision. Native snapshots include the copied geometry, so source deletion and restart do not invalidate accepted operations.

For compatibility, the native file retains stable private value records for existing feature fields, sketch coordinates and placements. They are implementation storage, excluded from the named parameter list and autocomplete. Deliberately created named parameters are distinguished from those private records. Old explicit parameter-creation actions and named reference-library inputs are recognized on load. Old links between unnamed dimensions are replaced by their current numeric values; explicit named-value dependencies remain live.

## Validation

Native regression cases cover world-origin construction followed by movement, copying a tool body then editing/deleting its source, explicit named values versus independent numeric dimensions, retained sketch constraints, and legacy-reference migration. Browser checks cover parameter creation, live autocomplete, Tab cycling, mouse selection, local-value editing, and one-time-reference movement. Existing geometry and sketch tests remain part of the release checks.

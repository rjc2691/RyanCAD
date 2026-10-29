# Import and export

Import and Export are adjacent dropdowns in the top bar, including compact icon buttons on mobile. The duplicate Reference designs link has been removed from the sidebar; examples remain in the three-line main menu. Finish or cancel an active operation before transferring geometry.

## Import

- **RyanCAD design** opens the existing native-file picker for YAML or a portable `.rycad.zip`. It creates a separate workspace design and preserves the current design. Portable files retain their journal; YAML contains current intent.
- **STL object** creates one new component with an authored, undoable mesh feature. Coordinates are interpreted as millimeters. Binary and ASCII STL are supported, with 1–5,000 triangles and an 8 MB upload limit. The engine validates closure, winding, degeneracy and self-intersection, then sews the facets into a solid. Disconnected shells and invalid meshes are rejected. A consistently reversed mesh is flipped as a whole. Imported facets remain facets; importing does not reconstruct the source's parametric history. The triangle data is embedded in native intent so archives and reopen do not depend on the original STL file. Separate physical parts should be imported separately.
- **SVG sketch** creates one independent, editable design-owned sketch on world XY. Physical SVG units and viewBox/group transforms are resolved at 96 pixels per inch, then converted to millimeters. SVG downward Y maps to sketch upward Y. Lines and circles are retained as sketch entities; elliptical/Bezier/arc paths are adaptively approximated by lines with a 0.05 mm sampling target. The existing 200-entity sketch limit applies, and excessive complexity is rejected rather than truncated. Text must first be converted to paths. Images, reusable symbols, external references, scripts and clipping/masking/filter effects are rejected. Colors and fills are not manufacturing properties; geometry follows path centerlines. No kerf or stroke-width offset is applied.

Geometry imports run through the same candidate validation and durable command history as manual edits. A failed import preserves the last saved design. Input values are local dimensions, without creating named parameters or live source-file dependencies.

## Export

- **STL components** opens the existing component selector and validated STL export settings. Each selected solid instance produces its own STL with the existing frame, precision, validation and receipt behavior.
- **SVG sketches** lists available sketches with checkboxes. One selection downloads an SVG; multiple selections download a ZIP with separately named SVGs. Geometry is exported from the evaluated sketch, including current dimensions/parameters, in its own plane coordinates and millimeters. Non-construction lines, circles and circular arcs are included. Construction geometry and isolated points are omitted. A sketch with no exportable geometry is rejected explicitly. Sketches on different planes are separate files, without an implicit projection of 3D components.
- **RyanCAD design** downloads the native editable snapshot, also available from the main menu.

Exports check the current revision and do not change the design. SVG export is independent of STL tessellation. These paths do not yet include SVG export of arbitrary 3D silhouettes or automatic conversion of mesh triangles into editable analytic features.

## Verification

`tests/test_file_formats.py` exercises real STL conversion, invalid/open meshes, SVG units/transforms/curves, explicit unsupported-content errors, sketch import/export round trips and stale-revision rejection through the API. `scripts/ui_file_actions_check.mjs` checks actual uploads/downloads, component/sketch selectors, retained logo examples, removed sidebar duplication and mobile bounds against an isolated server.

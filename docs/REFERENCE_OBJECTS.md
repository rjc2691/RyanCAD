# Reference objects and supplied STL inventory

**Inspected October 23, 2026. Source files retained unchanged in `stls/`.**

The supplied meshes are useful real-world references. They are not native parametric documents and do not contain the editable constraints, root dimensions or feature history needed for regeneration tests. No application import/conversion capability has been implemented.

## Supplied files

| File | Bytes | Triangles | Axis-aligned size, X × Y × Z |
|---|---:|---:|---|
| [bee vacuum flange.stl](../stls/bee%20vacuum%20flange.stl) | 203,984 | 4,078 | 76.20000 × 72.39000 × 76.20000 |
| [NEW Second Mirror Main Body.stl](../stls/NEW%20Second%20Mirror%20Main%20Body.stl) | 116,984 | 2,338 | 36.33515 × 29.46790 × 49.00000 |
| [Third Mirror and Lens Main Body.stl](../stls/Third%20Mirror%20and%20Lens%20Main%20Body.stl) | 2,437,884 | 48,756 | 57.97424 × 93.09998 × 126.97328 |

Sizes are **raw STL coordinate units**, rounded to five decimals. Millimeters have not been confirmed. Both mirror files have substantial coordinate offsets, so future reference loading should preserve original coordinates and offer explicit view/placement choices rather than silently recentering them.

Read-only inspection confirmed binary STL record counts/file lengths and found no non-finite vertex coordinates. This was a structural scan, not visual inspection or proof of watertightness, manifoldness, intended dimensions, separate-part count, fit or printability.

SHA-256 fingerprints for verifying the originals:

- bee vacuum flange.stl: `6A95A37780122451C55BC3E57A4D911AD30FB8BD3A377B567698A66EF8450A5A`
- NEW Second Mirror Main Body.stl: `77A9979848577154D939448C0885A20BB898BC5753F4433967CBDBEB89278A20`
- Third Mirror and Lens Main Body.stl: `804561B367C684EA52B462898FD36631C88BFA8A4445972F6CA1A308FD814EFD`

Use these later for reference-mesh loading, scale/placement handling, tessellation display and regression fixtures where appropriate. Read-only mesh viewing can be added when useful; general mesh repair and reverse engineering are not Phase 1 release requirements.

## Native fixtures to create after approval

| Fixture | Purpose |
|---|---|
| Plate with holes and repeated pin components | Shared commands, linked instances, automatic parameters, clearances, precise placement and per-part export. |
| Printed mold-making tool | Concrete target → silicone mold → printed tooling distinction; multiple removable printed pieces, shared dimensions, fit and section checks. |
| Filleted angle bracket | Parameter reuse, edge references, fillet limits and upstream edits. |
| Revolved spacer/bushing | Arc/revolve geometry, bore dimensions and export approximation. |
| Enclosure with separate lid | Cross-component dimensions, wall and fit parameters, linked dependencies and export naming. |
| Stepped solid | Direct face edits, generating-parameter identification, cost-aware history and invalid-reference recovery. |
| Planar fabrication plate beside a solid part | Unified 2D/3D ownership, dimensions, placement, optional stock thickness and no duplicate counting of previews. |
| Deliberately expensive pattern/Boolean model | Navigation cost estimates, cancellation, caching, event backpressure and sustained autosave. |

For each fixture, retain the native source, exact creation commands, independent requirements, valid/invalid parameter sweeps and derived exports. Native intent and requirements are the regression authority; an STL alone is insufficient.

The mold benchmark will use simple analytic geometry initially. It does not require reconstructing a mold from the supplied STL meshes, a dedicated mold wizard, or an automatic demolding simulation.

The original inventory above was recorded during planning. Implementation now generates editable native plate/pin and mold fixtures plus separate validated STLs under examples/. Native input and output remain connected through scripts/generate_examples.py. The supplied originals remain unchanged.

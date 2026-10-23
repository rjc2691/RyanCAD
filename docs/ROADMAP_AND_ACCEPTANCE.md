# Roadmap and acceptance

**Revision 2 — October 23, 2026. Phase 1 implementation authorized. Acceptance requirements remain unchanged; see [implementation evidence](IMPLEMENTATION_STATUS.md).**

## 1. Scope and authorization

Phase 1 is a Windows/macOS application for precise multi-component functional designs, operated manually or by observable external agents. It includes automatic parameters, visible dependencies/tolerances, per-edit autosave and controlled STL export.

After the owner approves Revision 2, start with 1A and proceed through the agreed Phase 1 milestones. Routine implementation does not need repeated approval. Discuss material scope changes, paid dependencies or failed feasibility gates before proceeding on a different basis. Phases 2 and 3 are future proposals.

Set delivery estimates from the actual team and early measurements. Multi-component editing, constraints, topology recovery and two-platform packaging make this a substantial CAD project.

## 2. Phase 1 milestones

### 1A — establish the foundation

Use the recommended stack; do not run a broad toolkit competition.

- Prove OCCT/OCP/build123d construction, tessellation and packaging on Windows and macOS.
- Assess PlaneGCS integration and a bounded constraint corpus, including conflicting, underdefined and near-degenerate sketches.
- Define versioned document/command schemas, scope/units/tolerance rules, automatic parameter creation and root/dependency queries.
- Prove one live document session shared by the browser and external MCP clients.
- Demonstrate attributed actions, revision/idempotency checks and pause/revoke at command boundaries.
- Demonstrate durable journal commits, bounded coalescing, snapshot replay and interrupted-write recovery.
- Produce a small dark viewport with selection, dimensions and background job status.
- Establish native dependency/license inventory and platform hardware matrix.

**Exit:** executable evidence that the proposed stack and key contracts are viable, with measured limitations. No unverified claim of macOS support. If solver packaging or an essential behavior fails, present a specific alternative and consequences.

### 1B — complete a small multi-component workflow

Create an 80 × 40 × 6 mm plate with four located holes and a separate reusable alignment pin. Place two linked pin instances through exact transforms. All editable dimensions become parameters automatically.

Demonstrate:

- New parts create components automatically; repeated pins share one definition.
- Shared pin/socket dimensions with explicitly labeled diametral clearance.
- Root-input and downstream-use inspection; independent same-value parameters stay independent.
- Human and external-agent creation through the same tools, with observable authored steps.
- Durable autosave, reopen, undo, checkpoint/restore and basic safe feature rollback.
- Per-part statistics and a batch of separate STL files with a revision/unit receipt.

**Exit:** editing a root dimension produces intended changes, linked instances remain linked, and durable state survives restart. A one-part demonstration alone does not satisfy this milestone.

### 1C — fit-aware multi-part mold benchmark

Build a deliberately simple mold-making tool using primitives, profiles, cuts and separate components. Keep the objects in the process distinct:

1. The intended small concrete casting.
2. The silicone mold that will form it.
3. The reusable printed tooling used to form that silicone mold.

The fixture may use a printed outer form split into removable pieces, a base and a removable core/master, with alignment keys or pins and sockets. Final dimensions and separation strategy are supplied or agreed before implementation. This is an application capability test, not an automated mold-design wizard.

Require shared casting/tool dimensions, silicone-thickness allowance as an explicit design input, exact component placements, specified parting surfaces and removal directions, named fit clearances, basic section views, pairwise interference/clearance queries and one STL per printed piece.

**Exit:** change an agreed root size and fit parameter; all intended pieces update or identify precise failures. Exported parts retain intended dimensions and labels. Nominal geometric fit is verified; physical fit remains unverified until printed/calibrated. Exhaustive undercut/demolding, silicone deformation and concrete shrinkage simulation are outside Phase 1.

### 1D — complete editing, history and planar-part consistency

Add the accepted constraint set, expression editing, revolutions, patterns, mirroring, Booleans, basic fillets/chamfers and supported planar face operations. Every feature has input eligibility, expected output type/count, failure behavior and manual/MCP parity.

Complete automatic parameter naming/reuse/promotion, dependency explanations, reference repair, component filtering and activity history. Measure operations and expose cumulative rebuild cost/cache status in the timeline. Cached scrubbing and explicit expensive computation must remain responsive.

Support planar physical-part components in the same tree, viewport and inspector, with optional stock thickness, defined regions/holes and exact assembly placement. Converting to a solid is explicit. SVG export is not a release gate.

**Exit:** valid parameter changes preserve intent; ambiguous topology does not silently target other geometry; unsupported cases preserve the last valid state. A planar plate and a solid part feel like the same application.

### 1E — cross-platform release quality

Refine dark styling, high-DPI text, selection, dimension/tolerance display, keyboard and trackpad workflows. Complete bounded-job cancellation, recovery, migration fixtures, consistent project snapshots, STL checks and end-to-end usability testing.

Test actual Windows and Mac hardware with the same supported workflows. Package a usable launcher/runtime. No embedded AI model or chat panel is added.

**Exit:** all accepted Phase 1 criteria pass, or any explicit exception is reviewed before release. Report known geometry/format/process limits clearly.

## 3. Acceptance matrix

| ID | Scenario | Pass condition |
|---|---|---|
| A01 | Create plate and multiple pin instances manually. | Components and dimensions organize automatically; no scripting or AI needed. |
| A02 | Repeat through an external agent. | Same semantic commands and dimensional intent; ordered steps appear in the live viewport/history. |
| A03 | Inspect authorship after a human modifies an agent-created feature. | Creator remains visible; modifier and action revision are correct; display names are not misrepresented as verified identities. |
| A04 | Pause/revoke an agent while work is queued. | No later queued mutation commits after revocation; pending native work is canceled or its result discarded. |
| A05 | Human edits between agent operations. | Old proposals fail revision checks; no overwrite. Duplicate request IDs do not duplicate parts. |
| A06 | Enter a fillet radius, then reuse it elsewhere. | First use creates a named local parameter; second can explicitly reuse it; shared impact is visible. |
| A07 | Enter equal values independently. | Inputs remain independent until explicitly linked. |
| A08 | Trace a socket dimension to root inputs. | Roots, formula, upstream dependencies and downstream consumers are accessible without searching the entire timeline. Rename preserves links. |
| A09 | Add geometry that creates a separate part. | New component is automatic with clear ownership; no orphaned body. Unexpected splits during regeneration require resolution. |
| A10 | Duplicate a component and make one copy independent. | Default copies remain linked; independent copy has a distinct definition and provenance. |
| A11 | Change mold size and clearance. | Intended printed pieces update; component count, relationships and fit conventions remain correct. |
| A12 | Inspect a tolerance envelope. | Nominal and limit values, per-side/total convention and assumptions are shown. Unspecified tolerances do not appear as zero. |
| A13 | Autosave isolated edits and sustained agent bursts. | Each durable acknowledgment survives restart; flush batching preserves all action records and stays within the accepted delay bound. |
| A14 | Fail a disk write or exhaust storage. | No false Saved/success signal; prior durable state survives; pending work and recovery options are visible. |
| A15 | Crash during journal commit, snapshot replacement or compaction. | Recovery produces a consistent acknowledged revision; no lost acknowledged actions or duplicated replay. |
| A16 | Restore a checkpoint or undo/redo. | Intent, values, assets and component instances restore correctly; audit events remain understandable. |
| A17 | Scrub across expensive history. | Cached states show immediately; uncached expensive paths are marked and require explicit computation; UI remains responsive. |
| A18 | Cancel an unresponsive geometry job. | Worker recovery preserves durable state; stale responses never replace newer geometry. |
| A19 | Break a topology reference or create a dependency cycle. | Specific failure and affected dependents are shown; no wrong-face substitution or partial commit. |
| A20 | Export a multi-component assembly as a batch. | One validated STL per selected physical part/instance, clear naming/units/frames/revisions; no implicit union. |
| A21 | Validate each STL. | Bounds, dimensions, closure, winding, manifold edges, degeneracy and self-intersection coverage are checked; legitimate cavity shells remain allowed. |
| A22 | Select an invalid or stale part for export. | It is blocked or an explicitly chosen valid revision is exported; other components are not silently omitted. |
| A23 | Edit a planar and solid part in the same design. | Shared selection, parameters, tolerances, ownership and history; no duplicate physical counting from thickness previews. |
| A24 | Reopen on the other supported OS. | Logical model and geometry agree within documented tolerances; paths/assets and authorship survive. |
| A25 | Disconnect agents and internet access. | All supported manual modeling, autosave, measurement and export remain functional. |
| A26 | Open malformed or unsupported native files. | Safe validation/read-only behavior; no dropped features, executable loading or destructive overwrite. |
| A27 | Count an assembly with linked instances and hidden parts. | Quantity-aware statistics are correct; visibility does not change physical quantities. |
| A28 | Change units/display rounding. | Physical dimensions, fits and dependencies remain unchanged. |

For batch export, stage and validate the selected set before publishing. On failure, explain which parts failed and avoid presenting a partial set as complete. A destination may not support atomic replacement of an entire multi-file batch; use a staged directory and completion receipt so incomplete output is detectable.

Validate intent as well as topology. Four requested holes becoming three is a failure even if the solid remains valid. Compare quantities, dimensions, bounds, volume, relevant clearances and semantic ownership rather than screenshots alone.

## 4. Performance and durability targets

These are initial targets for calibration, not measured achievements.

Standard corpus: actual fixtures with approximately 100 total modeling features, 20 component instances and 250,000 displayed triangles. Stress corpus: around 500 features, 100 instances and one million displayed triangles. Include a small mold assembly and pathological geometry; counts alone do not define Boolean complexity.

| Measurement | Initial objective |
|---|---|
| Selection/inspector response | p95 below 100 ms on both reference machines. |
| Simple geometry parameter refresh | p95 below 250 ms for designated simple fixtures, measured separately from durable acknowledgment. |
| Warm ordinary fixture rebuild | p95 below 2 seconds; report complex operations separately. |
| Navigation | Aim for 60 fps; publish frame-time percentiles and stalls at the agreed resolution. |
| Durable edit batching | Target at most 100 ms group delay; proposed hard cap 250 ms in normal operation, plus measured storage latency. No success acknowledgment before durable commit. |
| YAML snapshot freshness | 500 ms after quiet; no more than 2 seconds between updates during sustained accepted edits, excluding explicit reported storage failure. |
| Expensive-path marking | Initially use 500 ms historical/estimated rebuild cost as a threshold; unknown expensive paths remain explicit. |
| Pause/cancel acknowledgment | Below 100 ms; document a bounded worker-restart policy separately from acknowledgment. |
| Reopen | Useful view/information within 2 seconds warm for an ordinary project; cold launch measured separately. |
| Recovery | No loss of actions already acknowledged saved in the tested failure scenarios. |
| Learnability | Representative users finish the plate/pin workflow and a fit edit without code or expert rescue after brief orientation. |

Measure CPU/GPU/RAM, OS, storage/filesystem, browser, display, power mode, versions and cold/warm cache conditions. Include disk-failure tests, agent action bursts and event backpressure. Report actual durability latency; a batching deadline cannot guarantee a slow disk completes a flush within that time.

Use matched hardware and equivalent task/output accuracy when comparing other CAD tools. Measure completion time, edit success, recovery and information discoverability. External-agent provider latency is separate from engine performance.

## 5. Phase 2 — manufacturing information and richer exchange

Multiple components and basic assembly placement are already Phase 1. Phase 2 adds:

- Reusable part templates, configurations and deliberate parameter overrides, stronger assembly interfaces and richer clearance analysis.
- Material libraries with source, units, conditions and custom properties; mass/center-of-mass with stated density assumptions.
- Quantity-aware material/process cost models and “what changes if this dimension changes?” comparisons. Display selected instances, units, price basis, waste/support assumptions and uncertainty.
- Requested adapters such as 3MF/OBJ/STEP, plus bounded SVG import/export for fabrication. Each format has explicit preserved/lost semantics.
- Integrated laser-cutting workflows: cut/engrave roles, curves, offsets, kerf-aware output, stock thickness and layouts. Nominal geometry remains separate from compensation.
- Selected modeling additions such as shell, draft, sweep or loft, justified by actual parts.

Evidence: a design variant updates the intended instances and quantity-based cost comparison; a dimensioned planar part exports at the intended physical scale; imported geometry does not falsely claim recovered feature history.

## 6. Phase 3 — mechanisms and deeper analysis

Add joints and kinematics, assembly degrees of freedom, motion limits and scoped collision studies. Keep force-based dynamics separate from kinematic movement.

Add specialist analysis/manufacturing integrations with revision and assumption tracking, reproducible design comparisons, and advanced geometry only where required. Collaboration and a public extension system are optional separate workstreams.

Full illustration is not a planned phase. Continue 2D development toward fabricated parts. A broader graphics product would need an explicit future request.

## 7. Principal risks and responses

| Risk | Required response |
|---|---|
| Sketch solver integration | Bounded early proof, real diagnostics and cross-platform packaging; discuss a concrete fallback if it fails. |
| Fragile topology | Semantic references, lineage, adversarial edit fixtures, ambiguity and repair. |
| Parameter clutter or hidden coupling | Automatic scoped names, root/usage views, explicit reuse, no value-based auto-linking. |
| Component proliferation | Intent-aware new-part creation, linked instances, explicit split outcomes and no silent regeneration changes. |
| Agent activity too fast to inspect | Persistent actions, follow/step controls and optional rendering coalescing; never drop history. |
| Agent/human conflicts | One live document owner, revision/idempotency checks, pause/revoke and serialized writes. |
| Autosave corruption or false assurance | Journal durability, honest status, bounded batching, backpressure and crash/failure tests. |
| Frozen history navigation | Cost-aware dependency paths, cached snapshots, explicit compute and isolated cancellable workers. |
| Cross-platform assumptions | Real Windows/macOS validation early, not only a shared UI codebase. |
| Fit or cost overstated | Explicit tolerances, assumptions and physical calibration; quantity-aware analysis with provenance. |
| Scope growth | STL-only interchange, no embedded assistant, no moving joints or illustration in Phase 1. |

## 8. Implementation artifacts after approval

Maintain a concise decision log, versioned schema/protocol contracts, automated acceptance fixtures, dependency/license inventory, reproducible performance results and a short user guide. Use the supplied meshes and planned native fixtures described in the reference-object document.

The planning baseline above remains the release target. Current code, generated fixtures, measured results and outstanding gates are recorded separately in IMPLEMENTATION_STATUS.md.

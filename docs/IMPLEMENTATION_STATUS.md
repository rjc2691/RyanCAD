# RyanCAD 0.1 implementation and acceptance record

**October 23, 2026. Owner-authorized implementation; working development preview. Phase 1 release is not yet declared complete.** The product request and acceptance criteria remain the target. This record separates implemented behavior, demonstrated evidence and remaining validation.

## Delivered application

The Python engine, native OCCT evaluator, PlaneGCS adapter, durable project store, local API, external MCP server and production web interface are implemented. The interface runs from bundled files with no cloud/model/chat dependency. A working Windows environment, launchers, locked dependencies, installable wheel, examples, test corpus, documentation and Windows/macOS CI configuration are present.

Available modeling includes primitives, planar regions with holes, general bounded sketches/constraints, extrusion/cuts, revolve, holes/patterns, semantic edge fillets/chamfers, Booleans, mirrors, exact transforms, component arrays and linked/independent parts. Planar stock preview remains non-authoritative. Initial disconnected additive constructors get components; regeneration that splits a part is rejected safely.

Parameters are automatic and independent unless explicitly reused. Expressions preserve stable references and reject cycles/dimensional mismatches. Root/upstream/downstream/usage navigation, favorites, scope promotion, tolerances and fit intervals are exposed manually and through the same engine. Creation/modification attribution follows shared-dimension edits, without erasing feature creators.

Native work is isolated and cancellable. Commands use revision checks and idempotency keys, previews preserve exact candidate identities, and only durably committed revisions are reported saved. Agents join the visible live session, with authored history, follow/step/pause/revoke controls and inspectable atomic batch steps. Recent failed/cancelled jobs appear as diagnostics rather than successful features.

## Executed verification

| Evidence | Observed result |
|---|---|
| `python -m pytest -q` | **64 passed in 49.82 seconds**, including real geometry/constraints, storage, HTTP boundaries, independent multi-project browser sessions, worker recovery, ownership, branching dependency graphs, parameters, fits, native archive round trips and mesh validation. |
| Production TypeScript + Vite build | Pass; locally bundled assets, split client/rendering chunks, no type/build errors. |
| `scripts/ui_modeling_check.mjs` | Pass in headless Edge at 1600 × 1000: manual box/holes/fillet/pin/linked repeat, then planar cutout and stock preview; 4 instances, 3 definitions, no JavaScript errors. |
| `scripts/ui_check.mjs` | Pass on final UI: candidate preview does not commit; root diameter edit, undo, selected-part validated STL export and read-only feature rollback/return; no JavaScript errors. |
| Official MCP stdio client | Nine tools discovered; five separate authored modeling commands build a plate/two linked pins and export three separately validated STL files. `artifacts/mcp-workflow.json`. |
| Installed-wheel proof | Imported installed package ahead of source, served its bundled HTML/assets/license notices, executed a native-worker box operation and returned durable success and binary mesh. `artifacts/package-proof.json`. |
| Generated native examples | Four-piece mold tooling and plate/two-pin archives, with separate STL batches and receipts, rebuilt from the same engine. |
| Original meshes | All three SHA-256 hashes still match the planning inventory. |

Storage tests include a subprocess terminating with `os._exit` after a durable acknowledgment, stale/missing YAML recovery, injected SQLite failure, single-writer protection, externally changed snapshot protection, malformed YAML and consistent archive/history restore. They do not establish guarantees for every OS/power-loss/storage-controller failure.

Mesh tests include interpenetrating individually manifold shells, coplanar/noncoplanar intersections, disjoint triangles, actual generated STL readback and legitimate internal cavity shells. Validation runs on binary STL's float32 coordinates. BVH/separating-axis testing excludes welded vertex-adjacent pairs and uses a numerical tolerance of 1e-7 mm; it is not an exact-arithmetic certificate or physical printability test.

## Measured small-fixture performance

Reproduce with `python scripts/benchmark.py`; raw results are in `artifacts/benchmark.json`. Hardware inventory: Ryzen 7 7800X3D (8 cores/16 threads), approximately 63.1 GiB physical RAM reported by Windows, Radeon integrated graphics and RTX 4070 Ti present. Python 3.12.14, Windows 11 build 26200. GPU selection/power mode/viewport frame timing are not established by this CPU benchmark. Projects were on the workspace filesystem; storage media/sync overhead were not independently isolated.

Fixture: 14 features, 72 parameters, four physical instances and 4,088 unique displayed triangles. Twenty samples per edit class, persistent worker; p95 uses the nearest-rank sample. These measurements include durable acknowledgment, not just kernel construction.

| Measurement | Median | p95 |
|---|---:|---:|
| Root size edit, rebuild and durable commit | 195.3 ms | 236.6 ms |
| Metadata edit, cached geometry and durable commit | 18.3 ms | 20.2 ms |
| State query | 1.84 ms | 2.25 ms |

Cold worker start plus first complete mold creation: 3.49 s. Separate four-STL batch with mesh intersection checks: 1.95 s. Cold kernel startup stays outside the UI process. See raw maxima/conditions in the JSON.

These are small-fixture results. They do **not** validate the roadmap's 100/500-feature, 20/100-instance, 250k/1M-triangle corpora, selection latency, trackpad ergonomics or sustained navigation targets. No matched Fusion/SketchUp/SolidWorks comparison has been run.

## Acceptance tracking

“Demonstrated” below refers to this Windows build and bounded corpus, not a cross-platform release certification.

| ID | State and evidence / outstanding validation |
|---|---|
| A01 | Demonstrated manual plate/pin creation through real UI controls. Representative novice learnability remains untested. |
| A02 | Demonstrated official MCP stepwise creation, linked instances and STL export; same commands as manual UI. |
| A03 | Demonstrated retained creator + changed modifier after human edits to agent-authored shared dimensions; client-supplied identity labeled. |
| A04 | Pause/revoke, queued step mode and worker cancellation implemented/tested at command boundaries. Broader sustained contention testing remains. |
| A05 | Stale proposals and idempotent retries tested; a queued agent proposal cannot overwrite an intervening human change. |
| A06 | Automatic fillet parameter, explicit reuse/linking, favorite/promotion and consumer impact implemented. Additional novice workflow observation remains. |
| A07 | Independent same-value inputs tested; no value-based auto-linking. |
| A08 | Stable scoped expressions, root/dependency/consumer navigation, ambiguity and rename preservation tested. |
| A09 | New-part default and initial disconnected-addition component ownership tested; later splitting regeneration rejected without a partial commit. |
| A10 | Linked repetition, independent clones and extracting a pattern member at its pose tested. |
| A11 | Mold root-size rebuilds, shared dimensions, four separately owned printed pieces and export demonstrated. Example dimensions are test inputs, not an agreed production mold specification. |
| A12 | Explicit tolerance intervals and radial/diametral conventions tested. Physical process calibration remains external. |
| A13 | Every accepted action commits immediately with FULL synchronous SQLite; YAML debounce meets the implemented 0.5/2 s policy. No journal group delay is introduced; action records are not dropped. Long burst/stress measurements remain. |
| A14 | Injected storage failure produces no false durable success and preserves prior state. Real disk-full/removable-drive failure UX remains to validate. |
| A15 | Acknowledged edit survives process exit, stale snapshot and archive restore. Exhaustive mid-write/power-loss scenarios, compaction and long-journal testing remain. |
| A16 | Undo/redo/checkpoint and portable full-history restore tested. No external asset format is present yet. |
| A17 | Measured feature costs, explicit costly/unknown computation, cached read-only rollback and return to present tested. Large pathological paths/GPU stall measurements remain. |
| A18 | Cancel during worker startup and successful restart tested; saved intent preserved. Platform-specific pathological native-job cases remain. |
| A19 | Cycles, selection count changes/missing semantic references and failed geometry preserve the last valid state. General topology naming is not solved; ambiguous cases require explicit repair. |
| A20 | Separate selected-instance STL batches, frames, units/revision, staged completion and no implicit union demonstrated. |
| A21 | Closure/winding/manifold/degeneracy/float32/intersection checks and internal cavities tested; numerical coverage limits recorded in receipts. |
| A22 | Invalid/empty/stale export selection rejected; planar profiles require deliberate conversion/selection. No silent omission. |
| A23 | Manual planar cutout + stock preview beside solid linked parts tested; shared ownership/parameters/history and no extra volume/count. |
| A24 | **Open release gate:** actual Mac build, reopen, geometry agreement, input and file-recovery testing. |
| A25 | Manual code paths have no remote dependency; bundled assets and disconnected-agent operation demonstrated. A real air-gapped fresh-runtime installation test remains. |
| A26 | Unsafe tags/aliases, duplicate keys, malformed/unknown schemas and unsafe native archives rejected; restore never overwrites an existing destination. There is no prior released schema migration yet. |
| A27 | Hidden linked instances remain in quantities; suppression and independent/pattern counts tested. |
| A28 | Canonical geometry is independent of mm/in display preference; expression conversion and dimensional consistency tested. |

## Concrete implementation choices and limits

- Native schema is 0.2. Kernel shapes/display buffers are caches; supported intent is inspectable YAML. The current journal stores full validated intent per revision. Large-journal compaction is not implemented.
- SQLite DELETE journal + synchronous FULL was chosen for a simple single-writer lifecycle. Each edit flushes immediately; only YAML refresh is coalesced. Portable archives use consistent backup, not a copy of a live database.
- HTTP polling (650 ms UI refresh) and a sequenced diagnostic event ring provide live observation. Durable actions remain paginated independently. Polling is not a demonstrated sub-100 ms live-agent display guarantee.
- Semantic edge signatures and selection counts deliberately stop on ambiguity. Exact direct face editing is bounded to unambiguous generating top dimensions; arbitrary surface editing/advanced surfacing is not claimed.
- Definitions are limited to 250, features to 2,000, sketches to 200 entities, atomic batches to 100 steps, component patterns to 200 members and flattened occurrences to 5,000. Parts have a 10,000 mm local span/coordinate envelope. Expressions/queues/caches/uploads are bounded and reject excess rather than silently truncate design intent.
- Planar stock preview is separate from authoritative physical geometry. SVG/kerf, general mesh import, materials/cost systems, joints and simulation remain future phases.
- The wheel and launchers are developer installation artifacts, not a polished bundled-runtime installer. Actual Mac PlaneGCS source-build feasibility and final runtime packaging still need proof. The CI matrix is configured, not remotely executed here.
- Formal accessibility/high-DPI/trackpad evaluation, sustained stress tests, novice usability, broad adversarial geometry sweeps and comparative CAD benchmarks remain release work.

## Next release work

1. Run the locked build and corpus on the actual MacBook architecture/OS; resolve source-build/runtime packaging using measured failures, then compare reopened geometry and recovery.
2. Exercise the standard/stress corpora, long journals, disk-failure variants, input latency and actual navigation frame times on both reference machines.
3. Observe the owner/representative users completing the manual mold/fit workflow; refine interaction and dimensional organization from those results.
4. Produce self-contained installation packages and execute offline install/recovery checks before declaring Phase 1 release complete.

These are validation and release obligations, not silently removed requirements. Phase 2/3 remain the roadmap in ROADMAP_AND_ACCEPTANCE.md.

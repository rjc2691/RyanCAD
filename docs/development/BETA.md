# MVP and beta readiness

**Current stage: initial MVP built; preparing for beta.** Application version: 0.1.0. This is the release checklist, not a claim that all checks have passed.

## Current scope

| Area | Available |
|---|---|
| Organization | Browser workspaces, multiple designs/layouts, reusable parts, component/group trees, public workspace, reference parts, variations |
| Modeling | Parametric solid operations, previews, precise placement, history edits, authored actions |
| 2D | In-viewport sketches, dimensional/geometric constraints, SVG fabrication transfer |
| Files and recovery | STL/native transfer, workspace folder snapshots, durable revisions, undo/redo, checkpoints |
| Clients | Browser UI with mobile access; external agents through MCP |
| Feedback | Shared bug/feature reports with screenshots; experimental appearance settings |

## Candidate release gates

Record platform/browser, candidate commit, date, and evidence when checking these off. Existing test scripts and historical artifacts do not substitute for a current run.

- [ ] Fresh install, launch, update, and clean wheel install on Windows, macOS, and supported Linux.
- [ ] Build/type checks, backend tests, native checks, and relevant UI model/integration checks pass.
- [ ] New browser onboarding; refresh; multiple tabs/designs; two independent browser workspaces; public workspace persists across restart.
- [ ] Create a functional bracket/enclosure and a close-fitting multi-part mold; edit earlier features and export valid separate STLs.
- [ ] Sketch drawing, dimensions, point movement, projection, SVG round-trip; no silent geometry changes on confirmation.
- [ ] Human and MCP edits use the same history; stale previews, cancellation, pause/revoke, and retries behave correctly.
- [ ] Restart/crash recovery; archive/folder round-trip; backup restoration; invalid files preserve saved work.
- [ ] Resizing, toolbar overflow, context-menu bounds, reference labels, and mobile core operations remain usable without flicker.
- [ ] Preview/rebuild timing and large-model navigation measured on stated hardware; no unsupported superiority claims.
- [ ] Public deployment boundaries, third-party notices, and remaining critical bug reports reviewed.

## Boundaries to communicate

- No account/authentication system, permission model for public sharing, or conflict-merging collaboration.
- Component topology can fail after upstream geometry changes; historical reference replacement is limited.
- Import limits are deliberate: faceted STL solids and fabrication SVG, not general mesh repair or illustration editing.
- Workspace folder transfer is not continuous local-folder saving. Server storage remains authoritative.
- Mobile provides access to core controls; complex modeling still needs broader device testing.
- No evidence yet establishes better performance/quality than Fusion, SketchUp, or SolidWorks.

## After beta

Prioritize validated user needs rather than committing to speculative phases:

1. **Reliability and usability:** topology repair, clearer failure recovery, broader constraint/operation coverage, measured preview performance.
2. **Manufacturing information:** material/density/cost libraries, stronger tolerance analysis, additional interchange formats such as 3MF/STEP when justified.
3. **Larger systems:** joints/motion, richer part libraries, controlled sharing/accounts, larger-design scalability.

Each expansion needs acceptance criteria, migration/storage impact, and license review before implementation. The initial dream-product plans and alternative-stack surveys have been retired from the current documentation.

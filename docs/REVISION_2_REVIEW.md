# Revision 2 — review before building

**October 23, 2026 · Historical plan review; subsequently approved for implementation. See [current implementation record](IMPLEMENTATION_STATUS.md).**

The documentation now treats RyanCAD as a cross-platform, multi-component CAD application with automatic parameter organization and external-agent operation. The earlier Windows-first/single-part-document scope, integrated assistant, broad technology comparison, and mandatory early SVG exporter have been removed.

## Your changes, incorporated

| Request | Updated specification |
|---|---|
| 1. Watch external AI work like a human, with authorship | One live document session and shared semantic commands. Each action appears in the viewport/activity timeline with actor, revision and affected entities. Features retain creator/modifier information. Follow, step, pause and revoke controls are included. |
| 2. STL now; consider 3MF as the foundation | STL remains the only required manufacturing output. Keep our own parametric model; add 3MF/OBJ/other adapters when needed. Adapter boundaries are planned without promising every format is trivial. |
| 3. Components by default | Every separate physical part gets a component automatically. Repeats are linked instances by default. Independent copies and split outcomes are explicit. Multi-body components are an advanced future exception. |
| 4. Windows and Mac | Equal Phase 1 platform gates. Recommended shared web UI with a local Python engine on each machine; no cloud dependency. |
| 5. Autosave every edit | Durable journal per accepted action, bounded group flushes, automatic readable snapshots, recovery and honest Saved/Saving/Failed states. |
| 6. Avoid expensive history freezes | Cost/cache badges, cumulative rebuild estimates, cached scrubbing, explicit computation of expensive paths, background workers and cancellation. |
| 7. Understand dimension dependencies | Root-input filters, upstream/downstream lists, usage counts, shared/local scope, selection-linked inspector and focused optional dependency graph. |
| 8. No integrated AI/chat | Removed from Phase 1 and the recommended stack. External MCP agents only; the app shows CAD activity and controls. |
| 9. Automatic reusable parameters | Every editable dimension creates a named parameter automatically. Suggestions, favorites, promotion, reuse and make-independent are first-class actions. Equal numerical values never silently link. |
| 10. Supplied STLs and multi-part mold | Originals retained and inspected read-only. Native plate/pin and mold-making fixtures are added to the planned test corpus. Multi-component capability is a Phase 1 requirement. |
| 11. Integrated fabrication-oriented 2D | Same components, parameters, tolerances, commands, history and viewport. Planar part support starts in Phase 1; SVG/kerf adapters follow when needed. Full illustration is outside the roadmap. |
| Additional tolerance preference | Nominal dimensions, optional limits, explicit fit clearance, per-side/total convention and assumptions remain visible in the inspector. Numerical kernel tolerance stays separate. |

## Three design decisions worth highlighting

**MCP is suitable, but RyanCAD must implement the observable editing experience.** MCP provides the external tool connection. A shared engine session and application event stream make the human viewport and timeline update as each command completes. We do not need an agent to physically click toolbar buttons to use the same modeling behavior. [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)

**Keep the native document independent of 3MF.** Our requirements include editable constraints, a dependency graph, feature history, authorship and recovery. Those are application semantics beyond a standard manufacturing exchange model. Using a 3MF container with private data would still require maintaining our own schema. Add its useful interchange capabilities later. [3MF specifications](https://3mf.io/spec/)

**Reuse must be explicit even though parameter creation is automatic.** The first 5 mm fillet creates a parameter with a useful name. The next fillet can select it, and a shared change previews every consumer. Merely entering another 5 mm value will not create a hidden relationship.

## Recommended stack

Python application engine; OCCT/OCP plus build123d; a bounded PlaneGCS integration check; React/TypeScript/Three.js UI; local FastAPI service; official Python MCP adapter; YAML snapshots with a SQLite durable journal. No integrated model provider, mandatory desktop shell or broad competing-stack evaluation.

The solver remains a genuine feasibility risk. We will test it early and bring back a concrete finding if it cannot meet the agreed behavior. Cross-platform native packaging also needs actual Windows and Mac validation.

## Proposed start after approval

1. Prove the engine, solver boundary, shared live session, persistence and small viewport on both platforms.
2. Build a complete plate-and-pin workflow with linked components, automatic parameters, fit clearance, observed agent actions and STL batch export.
3. Extend it into the multi-part printed tooling for making the silicone mold, then complete the agreed editing tools and release-quality checks.

Approval authorizes this staged Phase 1 build and ordinary implementation decisions within it. A materially different scope, paid dependency or unresolved failed gate comes back for discussion. It does not authorize Phases 2 and 3 immediately.

## Files to review

- [Product request](PRODUCT_REQUEST.md): the self-contained build brief.
- [Architecture](ARCHITECTURE.md): precise behavior and data contracts.
- [Technology direction](TECHNOLOGY_OPTIONS.md): the shortened stack recommendation.
- [Roadmap and acceptance](ROADMAP_AND_ACCEPTANCE.md): milestones and 28 release scenarios.
- [Reference objects](REFERENCE_OBJECTS.md): supplied files and planned native fixtures.

The current work changed documentation only. The supplied STL files were not renamed or modified, and no application code or generated STL was added.

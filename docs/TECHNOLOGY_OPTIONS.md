# Technology direction

**Revision 2 — October 23, 2026. Stack selected and implemented in 0.1. See [runtime contracts](API.md), [dependency inventory](../THIRD_PARTY_NOTICES.md) and [validation evidence](IMPLEMENTATION_STATUS.md).**

The earlier broad comparison is retired. Start with one coherent stack and reopen a choice only if a concrete feasibility test fails.

## 1. Recommended stack

| Layer | Choice | Reason |
|---|---|---|
| Application engine | Python; standard-library dataclasses/enums, identifiers, filesystem utilities and process supervision. | Matches the owner's preference and keeps domain logic independent of the UI. |
| Schema boundary | Pydantic with strict validation and a single authoritative schema strategy. | Typed commands, serialization and JSON Schema without handwritten duplicated contracts. |
| Geometry | OCCT through OCP; build123d for construction convenience; direct OCP where needed. | Native B-rep calculations with Python control and useful 2D/3D construction tools. |
| Sketch constraints | Native PlaneGCS through pinned planegcs 0.9.6. | Real constraint solving and diagnostics; Mac source packaging remains to verify. |
| Client | React + TypeScript + Three.js; a shared dark web interface. | Same interaction code on Windows and macOS, with a replaceable engine boundary. |
| Local service | FastAPI with typed command/query endpoints, an event channel and binary geometry responses. | Straightforward local browser-to-Python connection; domain logic does not depend on HTTP. |
| AI connector | Official Python MCP SDK in a local stdio adapter connecting to the same application service. | External-agent access without a model provider or built-in chat system. |
| Persistence | Restricted YAML snapshot plus SQLite durable action journal and content-addressed assets. | Human-readable design intent with efficient transactional autosave. |
| Packaging | Local launcher/runtime on each OS, opening the bundled UI in a supported browser. | Avoids adding a desktop-shell toolchain before the core works. |
| Manufacturing output | STL adapter only. | Meets current needs while leaving an explicit adapter boundary for later formats. |

Exact exercised versions are now locked in pyproject.toml, uv.lock and frontend/pnpm-lock.yaml. Do not infer Mac compatibility from Windows installation or update the native dependencies independently without rerunning the acceptance corpus.

The browser is a local application client, not a cloud requirement. The Python engine runs on the same computer and owns file access. A desktop shell is optional later; no separate Qt implementation or mandatory shell comparison is part of Phase 1.

Bundle interface assets, fonts and runtime dependencies locally. Normal use must not require CDNs, development servers, package downloads, accounts or internet access.

## 2. Why these choices

OCP provides thin bindings to OCCT. build123d offers Python construction on that kernel, including separate curve, planar and solid concepts. Neither defines RyanCAD's native document, command history, authorship or stable-reference behavior. [OCP](https://github.com/CadQuery/OCP), [build123d](https://build123d.readthedocs.io/en/latest/)

Three.js supplies rendering primitives such as buffer geometry and raycasting. Authoritative modeling, toleranced measurement and export stay in the Python engine. [Three.js](https://threejs.org/docs/)

Pydantic supplies strict boundary validation and schema generation; FastAPI supplies the local service boundary. Neither replaces geometric validation. [Pydantic](https://docs.pydantic.dev/latest/), [FastAPI](https://fastapi.tiangolo.com/)

The official MCP Python SDK is a connector around the domain commands. The application implements step observation, authorship, pause/revoke and history itself. [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)

## 3. Sketch solving and the remaining Mac packaging gate

PlaneGCS is FreeCAD sketch-solver source under LGPL-2.1-or-later. Implementation found and uses the maintained standalone `planegcs` Python binding, pinned at 0.9.6; no custom extraction or substitute numerical solver was needed. Real solver diagnostics and a bounded constraint corpus execute on Windows. Its current distribution has no macOS wheel, so Mac source-build/packaging remains an unpassed release gate. [Binding source](https://github.com/spookylukey/planegcs), [PlaneGCS source](https://github.com/FreeCAD/FreeCAD/blob/main/src/Mod/Sketcher/App/planegcs/GCS.h)

build123d's documented approach emphasizes explicit relationships and targeted local solving. It does not by itself establish the general interactive constraint behavior requested here. [build123d constraints](https://build123d.readthedocs.io/en/latest/tutorial_constraints.html)

Use parameterized constructors for the initial plate-and-pin workflow while testing the bounded sketch constraint set. This is a sequencing choice, not permission to ship without the agreed constraints. If PlaneGCS cannot meet the requirements, bring a specific replacement or scope proposal backed by findings; do not restart a broad technology search or quietly build an unrestricted custom nonlinear solver.

## 4. Cross-platform proof

Windows and macOS are release gates, not aspirations. Test:

- Native geometry dependencies on the user's CPU architectures.
- Startup, service discovery, shutdown and worker restart.
- Browser GPU capabilities, small-edge picking, antialiasing, high-DPI text and dimension overlays.
- Mouse/trackpad orbit, pan, zoom, selection, keyboard modifiers and contextual menus.
- File paths, Unicode filenames, atomic save behavior, autosave recovery and export.
- External MCP connection to the visible application's document session.

Begin with a supported Chromium-based browser on both OSes to bound the rendering matrix; Safari support is a separate compatibility decision. The design does not assume the Mac is Apple Silicon—confirm the actual machine before publishing a support matrix. Real macOS validation is required; Windows success is not evidence of Mac support.

Later packaging should include the required engine runtime so ordinary users do not have to assemble a Python development environment. A development launcher is acceptable for the first milestone, not the final usability standard.

## 5. Autosave implementation

Use Python's sqlite3 interface for a single-writer durable action journal; choose and verify SQLite transaction/synchronization settings in the persistence spike. Group committing small edits can reduce synchronization overhead while preserving action order and acknowledgment semantics. [Python sqlite3](https://docs.python.org/3/library/sqlite3.html), [SQLite durability settings](https://www.sqlite.org/pragma.html#pragma_synchronous)

Prefer the simplest proven journal mode for this local workload. WAL is an option to measure, not a requirement; it introduces extra live files and checkpoint behavior. A portable project snapshot must use a consistent backup/materialization path rather than copying an active database file. [SQLite WAL](https://sqlite.org/wal.html)

The readable YAML snapshot and journal are two representations of one revisioned document. No UI or agent edits either representation directly while the service owns the project. Full format and crash guarantees are in the architecture.

## 6. 3MF and other future adapters

Keep the RyanCAD native model. 3MF is a promising future manufacturing exchange format; it can carry information beyond STL, but does not replace the required parametric graph and action history. Supporting our own metadata inside a 3MF container would still leave us maintaining a custom native schema. [3MF specifications](https://3mf.io/spec/)

Start with STL, then add OBJ, 3MF, SVG, STEP or another format in response to a real workflow. Each adapter declares loss of semantics and limits. A mesh exporter may be modest work; robust import, materials, transforms and interoperability are not automatically trivial. Do not promise reconstruction of editable features from STL/OBJ/3MF.

## 7. Dependency discipline and feasibility limits

OCCT uses LGPL 2.1 with an additional exception; wrapper licensing does not remove kernel obligations. Inventory exact shipped dependencies before choosing a distribution path. Current personal use does not require choosing an open-source or commercial product strategy now. No paid SDK or subscription is assumed approved. [OCCT license](https://www.occt3d.com/dev/doc/overview/html/occt_public_license.html)

Keep one kernel/helper strategy, one client, one domain schema and one live document owner. Avoid new geometry libraries for isolated demos, arbitrary-code agent tools, hosted infrastructure, model-provider SDKs and premature plugin systems.

Neither the stack nor the architecture proves performance. Benchmark geometry correctness, stable references, UI responsiveness, autosave latency and packaging in 1A. Retain the planned interfaces if a specific implementation needs replacement.

# RyanCAD

Local parametric CAD for functional printed parts and organized multi-component designs. A Python engine owns editable intent, native geometry, parameters, history, autosave, and STL export. The bundled dark React/Three.js interface and external MCP adapter use the same commands and live document.

**Build 0.1.0 is a development preview, tested on this Windows machine.** Actual Mac installation and interaction testing remain release gates. See the [acceptance record](docs/IMPLEMENTATION_STATUS.md) for evidence and limits.

## Start

The environment and production UI are already installed in this workspace:

```powershell
.\Start-RyanCAD.ps1
```

Open **http://127.0.0.1:8790**. The launcher opens the browser. New default projects load the four-part mold tooling example; existing designs are preserved. Keep the terminal running; Ctrl+C closes the service. The working folder is `runtime/projects/default.rycad/`.

For a separate project:

```powershell
.venv\Scripts\python.exe -m ryancad --project runtime/projects/my-design.rycad
```

Use `--port 8791` when needed. Each process must own a different project folder. Project → New design starts blank within the current recoverable history.

On a fresh machine, install Python 3.12/3.13, Node.js 22+, and pnpm 11 (or npm), then run `python scripts/bootstrap.py`. On macOS use `.venv/bin/python` and `bash Start-RyanCAD.command`. PlaneGCS needs a source build on Mac: Apple command-line build tools, CMake, Eigen3 and Boost, with `CMAKE_PREFIX_PATH` pointing to the package prefix. Mac setup/CI is prepared but has not been executed on a Mac here.

After setup the application works offline, with local bundled assets, no cloud service, telemetry, account, embedded model or chat panel.

## Use it

- Create automatically organized parts; repeat linked instances, make independent copies, group assemblies and set exact placements.
- Model primitives, constrained line/circle/arc sketches, planar regions, extrusions/cuts, revolves, holes, fillets/chamfers, Booleans, mirrors and patterns.
- Edit automatically named parameters, reuse standards, trace roots/dependencies/consumers and specify tolerances and fit intervals.
- Work with planar fabrication profiles, cutouts, stock thickness and display-only thickness previews in the shared workspace.
- Inspect dimensions, volume/area, quantities, selected faces/edges, section clipping and static separation/interference.
- Preview, undo/redo, checkpoint, inspect attributed actions and feature rollback, cancel native work and recover durable edits.
- Export separate validated binary STL files with explicit selection, frames, precision and a revision/unit receipt.

Read the [user guide](docs/USER_GUIDE.md), [API/MCP guide](docs/API.md), and [editable examples](examples/README.md). The supplied meshes remain unchanged in `stls/`.

## Connect an external agent

Start the app, then configure an MCP client:

```json
{
  "mcpServers": {
    "ryancad": {
      "command": "C:/path/to/RyanCAD/.venv/Scripts/python.exe",
      "args": ["-m", "ryancad.mcp_server", "--connection", "C:/path/to/RyanCAD/runtime/connection.json", "--name", "CAD agent"],
      "cwd": "C:/path/to/RyanCAD"
    }
  }
}
```

On Mac use `.venv/bin/python`. For a different port use `runtime/connection-PORT.json`. The local capability file supplies the session token. Agents appear in the UI with pause, step and revoke controls. Names identify client-supplied sessions, not verified people.

## Save and recover

Working folders contain readable `manifest.yaml`, durable `journal.sqlite3` and `exports/`. Every accepted edit commits to SQLite before success. YAML follows after 500 ms quiet time or two seconds of sustained changes. The interface reports write failures and snapshot warnings.

Download native snapshot creates a consistent `.rycad.zip` with full history/checkpoints. UI Open a native design copy imports its current editable model into the current project's undo history. Restore a full archive into a new folder with:

```text
python -m ryancad --restore examples/mold-tooling.rycad.zip --project runtime/projects/restored-mold.rycad
```

Do not hand-edit the manifest while the service owns it. The journal is authoritative for existing working projects. Preserve the whole folder or a portable snapshot; YAML alone omits history.

## Develop and verify

```text
uv sync --frozen --extra dev
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
uv run python -m pytest -q
uv run python scripts/benchmark.py
uv run python scripts/generate_examples.py
uv build --wheel
```

`scripts/ui_check.mjs` tests preview/edit/undo/export on the mold app at port 8790. `scripts/ui_modeling_check.mjs` creates a plate, linked pins and a planar part through an empty isolated project at port 8791. Browser tests require Playwright and Chromium; `PLAYWRIGHT_MODULE_PATH`, `PLAYWRIGHT_CHANNEL` and `RYANCAD_UI_URL` override defaults. `scripts/check_mcp.py` exercises the official client against the running app.

The wheel includes production UI assets and depends on the Python/native runtime. It is not a self-contained installer. See [third-party notices](THIRD_PARTY_NOTICES.md).

Product intent remains in [PRODUCT_REQUEST.md](docs/PRODUCT_REQUEST.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), [TECHNOLOGY_OPTIONS.md](docs/TECHNOLOGY_OPTIONS.md), and [ROADMAP_AND_ACCEPTANCE.md](docs/ROADMAP_AND_ACCEPTANCE.md). Materials/cost systems, SVG/3MF/OBJ/STEP adapters, joints and simulation remain later phases.

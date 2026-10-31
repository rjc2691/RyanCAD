# RyanCAD

Local parametric CAD for functional printed parts and organized multi-component designs. A Python engine owns editable intent, native geometry, parameters, history, autosave, and STL export. The bundled dark React/Three.js interface and external MCP adapter use the same commands and live document.

**Build 0.1.0 is a development preview, tested on this Windows machine.** Actual Mac installation and interaction testing remain release gates. See the [acceptance record](docs/IMPLEMENTATION_STATUS.md) for evidence and limits.

## Start

The environment and production UI are already installed in this workspace:

```powershell
.\Start-RyanCAD.ps1
```

Open **http://127.0.0.1:8790**. The launcher opens the browser. A new browser workspace starts with a blank design; reference examples are available from the project menu. The normal launcher keeps the terminal open; Ctrl+C closes the service. Startup opens browser workspaces only; it does not load an old standalone design or seed a demo.

On Windows, RyanCAD also places its icon in the notification area. Look under the **^** arrow if Windows hides it. Right-click the icon to open RyanCAD or quit the server; double-click opens the app. Hover over the icon to see which port that instance uses. Quitting shuts down the local server cleanly for every browser connected to it; saved designs remain on disk.

To start without keeping a terminal window open:

```powershell
.\Start-RyanCAD.ps1 -Background
```

The launcher detects an already-used port before starting in the background. Use `-NoBrowser` if you do not want it to open a browser. The icon is Windows-only; `python -m ryancad --no-tray` disables it for automated or headless Windows runs. macOS and Linux retain their existing launch and shutdown behavior.

For a separate project:

```powershell
.venv\Scripts\python.exe -m ryancad --project runtime/projects/my-design.rycad
```

Use `--port 8791` when needed. Each process must own a different project folder. Click **Local Workspace** in the sidebar, or **Workspace designs** in the RyanCAD menu, to create, switch, rename, delete, and restore independent designs.

On a fresh machine, install Python 3.12/3.13, Node.js 22+, and pnpm 11 (or npm), then run `python scripts/bootstrap.py`. On Linux, install the native system runtime first: `libgl1` on Ubuntu/Debian or `libglvnd-glx` on Amazon Linux 2023. See [Linux/EC2 setup and troubleshooting](docs/LINUX_SETUP.md). Bootstrap checks native geometry and sketch solving before declaring setup complete. On macOS use `.venv/bin/python` and `bash Start-RyanCAD.command`. PlaneGCS needs a source build on Mac: Apple command-line build tools, CMake, Eigen3 and Boost, with `CMAKE_PREFIX_PATH` pointing to the package prefix. Mac setup/CI is prepared but has not been executed on a Mac here.

After setup the application works offline, with local bundled assets, no cloud service, telemetry, account, embedded model or chat panel.

### Local network access

To open RyanCAD from a phone or another computer on the same network:

```powershell
.\Start-RyanCAD.ps1 -Lan
# Optional: -Background -NoBrowser
```

On macOS, run `bash Start-RyanCAD.command --lan`; on Linux or with the Python CLI, add `--lan` to `python -m ryancad`. Stop the previous instance before restarting it in LAN mode. The server prints **Local network** URLs such as `http://192.168.1.11:8790`; open the Wi-Fi/Ethernet address from the other device. Virtual adapter addresses may also be listed. Background launches record the addresses in the `lan_urls` field of `runtime/connection.json` (or `connection-PORT.json`).

LAN mode listens on IPv4 interfaces and allows the computer's detected private interface addresses through the existing Host/Origin checks. It retains the localhost URL for the local browser, tray and MCP connector. Normal startup without `-Lan`/`--lan` remains limited to localhost. Restart after changing networks or receiving a different DHCP address.

No router port forwarding is needed. Devices must be on a network that permits communication between clients; a guest Wi-Fi network may isolate them. A host firewall can also block inbound connections. Starting RyanCAD does not change firewall settings or require administrator elevation. Each browser still receives its own workspace; use the existing workspace recovery code to open an existing workspace on another device.

### Public access behind a reverse proxy

Set `RYANCAD_PUBLIC_URL` to the exact public origin, for example `https://cad.example.com`, and restart RyanCAD. The proxy must forward the original `Host` header and browser `Origin` unchanged to `127.0.0.1:8790`, and terminate HTTPS. For a systemd service add `Environment=RYANCAD_PUBLIC_URL=https://cad.example.com` under `[Service]`, then run `sudo systemctl daemon-reload` and `sudo systemctl restart ryancad`. Check `curl http://127.0.0.1:8790/api/health` locally and visit the public URL in a browser. Leave port 8790 private.

Browsers on HTTP public origins may not expose `crypto.randomUUID`; RyanCAD falls back to cryptographic random bytes (or server-generated request IDs if browser crypto is unavailable). HTTPS is recommended for remote access.

Each browser profile gets an independent workspace and the same profile retains it across refreshes and server restarts. Private/incognito sessions use separate browser storage. Workspace codes allow an existing workspace to be reopened in another browser. Workspace separation is for convenience, not account authentication or access control.

## Use it

- Create automatically organized parts; repeat linked instances, make independent copies, group assemblies and set exact placements.
- Press **T / Tool** for one viewport-driven operation workspace: Tool Origin, Tool Profile, Tool Path, Tool Effect in one scrolling form. Enter applies; Escape cancels the whole draft. Shift-click groups connected path edges and parallel planar profiles; plain viewport picks replace profiles/paths, and Auto suggests Add/Remove from native overlap. Native previews cover extrusions, holes, round/bevel, custom sweeps, revolutions, helices and body Booleans. See [launch walkthroughs](docs/UNIFIED_OPERATIONS.md).
- Use primitives, existing constrained sketches, planar regions, mirrors, connected geometry repeats and linked part instances.
- Keep ordinary dimensions local, create optional named values in Parameters, and type their names in numeric fields with live suggestions. External geometry picks become one-time snapshots; sketch-local dimensional constraints remain. See [simple design intent](docs/SIMPLE_DESIGN_INTENT.md).
- Work with planar fabrication profiles, cutouts, stock thickness and display-only thickness previews in the shared workspace.
- Inspect dimensions and scoped volume/area in the inspector; part counts live in the structure tree and revision/Undo/Redo in the timeline. The viewport is reserved for geometry, selection and annotations.
- Hover/select geometry for ranked contextual dimension lines. A [portable information service](docs/CONTEXTUAL_INFORMATION.md) balances interest, recent interactions, repetition, readability, and available space.
- Preview, undo/redo, checkpoint, inspect attributed actions and feature rollback, cancel native work and recover durable edits.
- Export separate validated binary STL files with explicit selection, frames, precision and a revision/unit receipt.

Read the [user guide](docs/USER_GUIDE.md), [API/MCP guide](docs/API.md), and [reference generation](examples/README.md). Reference designs can be created from the Import menu.

## Connect an external agent

Start the app, then configure an MCP client:

```json
{
  "mcpServers": {
    "ryancad": {
      "command": "C:/path/to/RyanCAD/.venv/Scripts/python.exe",
      "args": ["-m", "ryancad.mcp_server", "--connection", "C:/path/to/RyanCAD/runtime/connection.json", "--name", "CAD agent", "--workspace", "YOUR_WORKSPACE_CODE", "--design", "YOUR_DESIGN_ID"],
      "cwd": "C:/path/to/RyanCAD"
    }
  }
}
```

On Mac use `.venv/bin/python`. For a different port use `runtime/connection-PORT.json`. The local capability file supplies the session token; the app's **External agents** panel shows a command containing the current workspace code and design ID. The connector stays on that design when another tab switches. Omitting both flags connects to the original single-project service for compatibility. Agents appear in the UI with pause, step and revoke controls. Names identify client-supplied sessions, not verified people.

## Save and recover

Each workspace's designs are stored in `runtime/projects/default.rycad.workspaces/` (or alongside the path given by `--project`, with `.workspaces` appended). Back up that entire folder with the server stopped, use workspace folder export, or download a native snapshot of each design while it is running. Each design folder contains readable `manifest.yaml`, durable `journal.sqlite3` and any `exports/`. Every accepted edit commits to SQLite before success. YAML follows after 500 ms quiet time or two seconds of sustained changes. The interface reports write failures and snapshot warnings.

The workspace manager shows a recovery code under **Workspace recovery and switching**. Save it somewhere you can find it: clearing browser data or changing browser profiles removes the local link to the workspace. If you lose it, the server stores the same `recovery_code` in that workspace's `workspace.json` file. Deleted designs stay available under **Deleted designs**. Download native snapshot creates a consistent `.rycad.zip` with full history/checkpoints. **Open a native design copy** creates a separate design; full native archives retain history, while YAML contains the current model only. Use Import for native design copies or workspace folders.

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

`node --test scripts/inspector_measurements.test.mjs scripts/operation_model.test.mjs scripts/measurement_service.test.mjs` checks draft logic and information ranking. `node --test scripts/operation_path_extent.test.mjs scripts/geometry_labels.test.mjs` checks fractional intent and entity labels. `scripts/ui_path_extent_check.mjs` verifies panel-only distance/percentage travel and reference-name hover on an empty isolated project at port 8817. `scripts/ui_implicit_operations_check.mjs` verifies Auto, implicit picks, stale previews and cached-candidate recovery on an empty isolated project at port 8797. `scripts/preview_latency_check.mjs` reproduces the small warm preview benchmark. `scripts/ui_operation_check.mjs` exercises the unified flow in an **empty isolated project** at port 8793 and commits test edits. Earlier per-tool-dialog creation scripts predate this workflow; see the acceptance record. Browser tests require Playwright and Chromium; `PLAYWRIGHT_MODULE_PATH`, `PLAYWRIGHT_CHANNEL` and `RYANCAD_UI_URL` override defaults. `scripts/check_mcp.py` exercises the official client against the running app.

The wheel includes production UI assets and depends on the Python/native runtime. It is not a self-contained installer. See [third-party notices](THIRD_PARTY_NOTICES.md).

Product intent remains in [PRODUCT_REQUEST.md](docs/PRODUCT_REQUEST.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), [TECHNOLOGY_OPTIONS.md](docs/TECHNOLOGY_OPTIONS.md), and [ROADMAP_AND_ACCEPTANCE.md](docs/ROADMAP_AND_ACCEPTANCE.md). Materials/cost systems, SVG/3MF/OBJ/STEP adapters, joints and simulation remain later phases.


`scripts/ui_move_component_check.mjs` exercises Move Component and the camera-following XYZ indicator on an empty isolated project at port 8821. `scripts/view_orientation.test.mjs` and the placement cases in `viewport_operation_display.test.mjs` cover camera projection and source-mesh placement restoration.

`M` opens Move Component; `G` opens Group; `Shift+G` toggles the viewport grid. Movement offers one inferred reference workflow (points, direction and optional exact distance), XYZ increments, and true axis-and-angle rotation. Each reference and the active component can be cleared or replaced in the panel. See `docs/USER_GUIDE.md` for reference picking and frame semantics. `scripts/movement_model.test.mjs`, `tests/test_movement.py`, and the movement native API case cover exact snapping and movement math/transactions.

Tool Path supports semantic travel targets, full finite travel from blank inputs, and face-boundary path selection. The corner indicator center selects world origin. Corner-finish profiles are native changed-material cross sections; single straight finishes support target-limited travel with planar end caps. `tests/test_operation_targets.py` covers target regeneration, arc length, native sections and partial finish geometry.


Sketch is available from the toolbar or **E**, using the main viewport and side panel. World/picked planes, exact inputs, line/rectangle/circle/arc/point tools, snapping, copied projection and native relationships share one workflow with ad hoc Tool Profile drawing. New sketches belong to the design root and appear separately from components. See [the sketch workflow](docs/SKETCH_WORKSPACE.md) for current behavior and limits.


**Group** in the top bar organizes components into selectable, movable and copyable assembly-backed groups. Double-click to edit their parts; Done exits. Group copies have independent membership/placement with linked part geometry. The former All tools dropdown is removed; distinct actions are directly in the toolbar and shape edits stay inside Tool. See [the group workflow](docs/GROUPS.md).

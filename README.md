# RyanCAD

Parametric CAD for 3D parts, part layouts, and fabrication sketches. A Python engine serves the web interface to your browser. RyanCAD supports STL/SVG transfer and external agents through MCP.

**Version 0.1 — MVP, preparing for beta.** See the [beta checklist](docs/development/BETA.md) for remaining release checks and limits.

## 1. Get the project and prerequisites

Download or clone this repository. Open a terminal **in the RyanCAD folder containing `pyproject.toml`**.

| Install | Required for |
|---|---|
| Python **3.12 or 3.13** | Running the engine; other Python versions are outside this dependency set |
| Node.js **22+**, including npm | Building the interface during setup |
| pnpm **11** | Reproducible frontend installation; bootstrap can fall back to npm |
| A browser with working WebGL | Displaying and interacting with the model |

Install pnpm if needed:

```text
npm install --global pnpm@11
```

Additional OS prerequisites:

- **Windows:** no additional native build tools are normally needed with the pinned wheels.
- **macOS:** install Apple's command-line tools (`xcode-select --install`), then `brew install eigen boost cmake`. PlaneGCS builds from source; set `export CMAKE_PREFIX_PATH="$(brew --prefix)"` in the setup terminal.
- **Linux:** install `libgl1` on Debian/Ubuntu, or `libglvnd-glx` on Amazon Linux 2023. See [Linux prerequisites](docs/product/HOSTING.md#linux-prerequisites) for compatible systems.

## 2. Install

| Platform | Setup command, from the project folder |
|---|---|
| Windows PowerShell | `py -3.12 scripts/bootstrap.py` |
| macOS / Linux | `python3.12 scripts/bootstrap.py` |

Use `3.13` instead of `3.12` if that is the supported Python you installed.

Bootstrap installs frontend packages, builds the interface, creates `.venv`, installs Python dependencies, and checks native geometry and sketch solving. It uses `uv` and the lockfile when `uv` is installed; otherwise it uses pip. Setup needs internet access. Wait for **Setup complete** before starting.

**Already have a built wheel?** Install the `.whl` in a Python 3.12/3.13 virtual environment with `python -m pip install /path/to/package.whl`, then run `python -m ryancad`. The wheel includes the interface; Node/pnpm are unnecessary. OS native prerequisites still apply. It is not a standalone desktop installer.

## 3. Start and stop

| Platform | Start from the project folder |
|---|---|
| Windows PowerShell | `.\Start-RyanCAD.ps1` |
| macOS | `bash Start-RyanCAD.command` |
| Linux | `.venv/bin/python -m ryancad --no-browser` |

Open **http://127.0.0.1:8790** on the server computer. Windows/macOS launchers open the browser automatically.

- If PowerShell blocks the launcher, run `.venv\Scripts\python.exe -m ryancad` directly.
- Stop a foreground server with **Ctrl+C**. On Windows, the notification-area icon also offers **Quit**.
- For background Windows use: `.\Start-RyanCAD.ps1 -Background`. The icon may be under the notification area's **^** menu.
- First visit: enter a name and choose a design. Each browser gets a personal workspace; **RyanCAD Public Workspace** contains the two default designs.
- Accepted operations autosave on the **server**. Normal use works offline after installation.

LAN access is enabled by default. Other devices can use the **Local network** address printed at startup. For localhost only, use `--no-lan` with Python or `-Lan:$false` with the PowerShell launcher. See [hosting and troubleshooting](docs/product/HOSTING.md).

## 4. Update an existing checkout

1. Stop RyanCAD and [back up its data](docs/product/HOSTING.md#backups-and-recovery).
2. Update the repository files.
3. Rerun your platform's bootstrap command from step 2.
4. Start RyanCAD and refresh connected browsers.

## Documentation

| I want to… | Read |
|---|---|
| Use the application | [UI guide](docs/product/USER_GUIDE.md) |
| Understand the engine or connect an agent/client | [Engine and API](docs/product/ENGINE.md) |
| Host it, find data, back up, or troubleshoot | [Hosting](docs/product/HOSTING.md) |
| Understand or change the implementation | [Architecture](docs/development/ARCHITECTURE.md) · [Development](docs/development/DEVELOPMENT.md) |
| Prepare a beta release | [Beta checklist](docs/development/BETA.md) |

[Documentation index](docs/README.md) · [Dependency and license notices](THIRD_PARTY_NOTICES.md)

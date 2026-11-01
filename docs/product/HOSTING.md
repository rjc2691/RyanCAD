# Hosting and troubleshooting

[Install first](../../README.md). Commands below run from the project folder with its virtual environment.

## Linux prerequisites

Use a system compatible with the pinned native wheels: **glibc 2.28+**, such as current Ubuntu or **Amazon Linux 2023**. Install Python **3.12/3.13** explicitly; the OS default may differ. Amazon Linux 2 is outside this native dependency baseline.

| System | Native runtime package |
|---|---|
| Debian / Ubuntu | `sudo apt-get update` then `sudo apt-get install -y libgl1` |
| Amazon Linux 2023 | `sudo dnf install -y libglvnd-glx` |

The geometry kernel can need `libGL.so.1` even on a headless server. This does not require a desktop session or GPU instance. A working browser GPU/WebGL context is a separate requirement on the client device.

After bootstrap, verify the native dependencies without starting a server or writing a design:

```text
.venv/bin/python -m ryancad.check_install
```

Expected: `RyanCAD native geometry and sketch solver are ready.`

## Server options

```text
python -m ryancad [--project PATH] [--port 8790] [--no-browser] [--no-tray] [--no-lan]
```

Use `.venv\Scripts\python.exe` on Windows or `.venv/bin/python` on macOS/Linux instead of bare `python` if the environment is not activated.

| Option | Meaning |
|---|---|
| Default network | Bind `0.0.0.0`; print usable local-network addresses |
| `--no-lan` | Bind `127.0.0.1` only |
| `--project PATH` | Storage namespace, **not** a design file to open; default `runtime/projects/default.rycad` |
| `--port` | HTTP port, 1024–65535 |
| `--no-browser` / `--no-tray` | Suppress automatic browser launch / Windows tray icon |

Keep the same working directory and storage path across restarts. A second independent server needs a different port **and** storage namespace. Stop with Ctrl+C or the Windows tray's Quit action; closing a browser does not stop the server.

### Local network

1. Start normally and use the printed LAN URL on the other device.
2. Put both devices on the same reachable network; guest Wi-Fi may isolate clients.
3. If needed, allow the app/port through the firewall on the **private** network profile.
4. Restart after a network/IP change; allowed LAN addresses are collected at startup.

RyanCAD does not enable PowerShell remoting or change firewall rules. The app port serves HTTP, not a shell. HTTP LAN origins lack some secure-browser APIs, including direct workspace folder export; use HTTPS for those features.

## HTTPS and unattended hosting

Terminate HTTPS at a reverse proxy; the Python app itself serves HTTP. Configure certificates for your hostname, preserve Host/Origin, and set the exact external origin:

```text
RYANCAD_PUBLIC_URL=https://cad.example.com
```

Example Nginx location **inside an HTTPS server block with certificates already configured**:

```nginx
location / {
    proxy_pass http://127.0.0.1:8790;
    proxy_set_header Host $http_host;
    proxy_set_header Origin $http_origin;
}
```

Run RyanCAD with `--no-lan` behind that local proxy. A different hostname/origin can produce a 403 until configured. Large workspace-folder transfers may also need a higher proxy body limit.

Example Linux systemd service; create the `ryancad` OS user and writable directories first, and adjust paths:

```ini
[Unit]
Description=RyanCAD
After=network.target

[Service]
User=ryancad
WorkingDirectory=/srv/RyanCAD
Environment=RYANCAD_PUBLIC_URL=https://cad.example.com
ExecStart=/srv/RyanCAD/.venv/bin/python -m ryancad --project /srv/ryancad-data/default.rycad --no-browser --no-tray --no-lan
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

The service needs write access to its data and `runtime/` connection metadata. Enable/start the service using your system's normal systemd workflow.

**Deployment boundary:** workspaces provide convenience isolation, not account security. The profile is a placeholder and the admin key uses `ryan`. Put authentication/access restrictions at the proxy before exposing a server to untrusted users. Keep bearer tokens and workspace recovery codes private.

## Data locations

Default source installation:

```text
runtime/
  connection.json                     current server URL/token/PID
  projects/
    default.rycad/feedback/             shared report YAML and screenshots
    default.rycad.workspaces/
      <workspace>/workspace.json       workspace metadata and design index
      <workspace>/<design>/
        journal.sqlite3                revision authority
        manifest.yaml                  readable current snapshot
        exports/                       generated files
      browser-profiles/                browser identity records
      deleted-workspaces/              deleted workspace recovery data
      agent-access.json                MCP access preference
```

Non-default ports use a corresponding `connection-PORT.json`. A custom `--project` relocates the project namespace and sibling workspace directory. Do not copy the connection token as part of a shared sample configuration.

- Each recognized browser keeps workspace ownership through cookies; tabs can select different designs.
- Refresh preserves the workspace. Clearing cookies/private browsing can lose the browser's association, while server files remain.
- Recovery codes reopen a workspace in another browser. The public workspace is shared across users.
- Report attachments are server-wide for this storage namespace, not per workspace.

## Backups and recovery

| Need | Method |
|---|---|
| One design with history | Export a RyanCAD Design archive |
| Portable workspace copy | Export a workspace folder; this is a snapshot, not a live save location |
| Complete server backup | Stop the server; copy the entire `.workspaces` directory and project `feedback/` directory |
| Restore server backup | Stop server; restore those directories at the same configured namespace; restart |
| Deleted design | Restore from design management where available |
| Lost browser identity | Recover using the workspace code or admin workspace list |

Back up the SQLite journal with the manifest; YAML alone does not preserve history. Do not replace individual files while the server is using them. Workspace deletion retains recovery data on disk, but there is no normal UI restore flow for a deleted workspace; use backups for dependable recovery.

## Troubleshooting

| Symptom | Check |
|---|---|
| `libGL.so.1` missing / kernel start failed | Install the Linux runtime package above, then run `check_install` |
| WebGL disabled / context creation failed | Client browser graphics settings/GPU policy; test another browser and enable acceleration, then restart it |
| LAN address unavailable | Bind mode, printed current IP, firewall/private profile, Wi-Fi isolation |
| 403 host/origin | Exact public origin, proxy Host/Origin headers, or changed LAN IP |
| Port already in use / project already open | Stop the existing process; do not run two servers on one namespace |
| Empty or unexpected workspace | Working directory, `--project` path, cookies, selected workspace/design |
| Native dependency install fails | Supported Python version, compatible OS/wheels; macOS Eigen/Boost/CMake setup |
| UI missing or old | Rerun bootstrap/build; refresh browsers; confirm the server uses the intended checkout |
| Direct folder export unavailable | Chrome/Edge with File System Access on HTTPS/localhost; use normal file exports otherwise |
| Stale revision | Another edit completed; reread current state and recreate the operation/preview |
| MCP disconnected | Running server, current connection file, access enabled, target selection; see [MCP](ENGINE.md#external-agents-mcp) |

Include the exact error, server terminal output, OS/browser version, and reproduction steps in a bug report. Logs and capabilities are more useful than a generic “operation failed.”

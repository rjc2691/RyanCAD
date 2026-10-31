from __future__ import annotations

import argparse
import json
import multiprocessing
import os
from pathlib import Path
import secrets
import socket
import threading
import webbrowser


def main():
    parser = argparse.ArgumentParser(description="RyanCAD local parametric CAD application")
    parser.add_argument("--project", type=Path, default=Path("runtime/projects/default.rycad"), help="Storage namespace; designs live in its .workspaces sibling directory")
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--lan", action="store_true", help="Allow devices on the local network to connect over IPv4")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--no-tray", action="store_true", help="Do not show the Windows notification-area icon")
    arguments = parser.parse_args()
    if not 1024 <= arguments.port <= 65535:
        parser.error("Choose a local port from 1024 to 65535.")
    bind_host = "0.0.0.0" if arguments.lan else "127.0.0.1"
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            probe.bind((bind_host, arguments.port))
        except OSError:
            parser.error(f"Port {arguments.port} is already in use. Open the running app, or choose another --port and project folder.")
    runtime = Path("runtime").resolve()
    runtime.mkdir(exist_ok=True)
    os.environ.setdefault("XDG_CACHE_HOME", str(runtime / "cache"))
    os.environ.setdefault("PYTHONUTF8", "1")
    token = secrets.token_urlsafe(32)
    connection_file = runtime / ("connection.json" if arguments.port == 8790 else f"connection-{arguments.port}.json")
    from .api import create_app
    import uvicorn
    app = create_app(arguments.project, token, arguments.port, lan=arguments.lan)
    server = uvicorn.Server(uvicorn.Config(app, host=bind_host, port=arguments.port, log_level="warning"))
    connection_file.write_text(json.dumps({"url": f"http://127.0.0.1:{arguments.port}", "token": token,
                                           "pid": os.getpid(), "project": str(arguments.project.resolve()),
                                           "lan_urls": app.state.lan_urls}), "utf-8")
    try:
        connection_file.chmod(0o600)
    except OSError:
        pass
    browser_timer = None
    if not arguments.no_browser:
        browser_timer = threading.Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{arguments.port}"))
        browser_timer.daemon = True
        browser_timer.start()
    print(f"RyanCAD is running at http://127.0.0.1:{arguments.port}", flush=True)
    if arguments.lan:
        for url in app.state.lan_urls:
            print(f"Local network: {url}", flush=True)
        if not app.state.lan_urls:
            print("No private IPv4 address was detected. Connect to a local network and restart RyanCAD.", flush=True)
    tray = None
    try:
        if not arguments.no_tray:
            from .windows_tray import start_windows_tray
            tray = start_windows_tray(f"http://127.0.0.1:{arguments.port}", arguments.port,
                                      lambda: setattr(server, "should_exit", True))
        server.run()
    finally:
        if browser_timer:
            browser_timer.cancel()
        if tray:
            tray.close()
        try:
            if json.loads(connection_file.read_text("utf-8")).get("pid") == os.getpid():
                connection_file.unlink(missing_ok=True)
        except (OSError, ValueError):
            pass


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()

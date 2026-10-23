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
    parser.add_argument("--project", type=Path, default=Path("runtime/projects/default.rycad"))
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--demo", choices=["mold", "plate"])
    parser.add_argument("--restore", type=Path, help="Restore a native .rycad.zip snapshot into the new --project folder before opening")
    arguments = parser.parse_args()
    if not 1024 <= arguments.port <= 65535:
        parser.error("Choose a local port from 1024 to 65535.")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", arguments.port))
        except OSError:
            parser.error(f"Port {arguments.port} is already in use. Open the running app, or choose another --port and project folder.")
    runtime = Path("runtime").resolve()
    runtime.mkdir(exist_ok=True)
    if arguments.restore:
        from .projects import restore_project
        restore_project(arguments.restore, arguments.project)
    os.environ.setdefault("XDG_CACHE_HOME", str(runtime / "cache"))
    os.environ.setdefault("PYTHONUTF8", "1")
    token = secrets.token_urlsafe(32)
    connection_file = runtime / ("connection.json" if arguments.port == 8790 else f"connection-{arguments.port}.json")
    from .api import create_app
    import uvicorn
    app = create_app(arguments.project, token, arguments.port, arguments.demo)
    connection_file.write_text(json.dumps({"url": f"http://127.0.0.1:{arguments.port}", "token": token,
                                           "pid": os.getpid(), "project": str(arguments.project.resolve())}), "utf-8")
    try:
        connection_file.chmod(0o600)
    except OSError:
        pass
    if not arguments.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{arguments.port}")).start()
    print(f"RyanCAD is running at http://127.0.0.1:{arguments.port}", flush=True)
    try:
        uvicorn.run(app, host="127.0.0.1", port=arguments.port, log_level="warning")
    finally:
        try:
            if json.loads(connection_file.read_text("utf-8")).get("pid") == os.getpid():
                connection_file.unlink(missing_ok=True)
        except (OSError, ValueError):
            pass


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()

"""Build the UI and install the project using the current Python 3.12/3.13."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(arguments, **kwargs):
    print("Running:", " ".join(map(str, arguments)), flush=True)
    subprocess.run([str(arg) for arg in arguments], cwd=ROOT, check=True, **kwargs)


def main():
    if not (3, 12) <= sys.version_info[:2] < (3, 14):
        raise SystemExit("Use Python 3.12 or 3.13 to install this tested native dependency set.")
    node = shutil.which("node")
    if not node:
        raise SystemExit("Node.js 22 or later is needed once to build the interface. Install it and rerun setup.")
    manager = os.environ.get("RYANCAD_PNPM") or shutil.which("pnpm")
    if manager:
        prefix = [node, manager] if manager.endswith((".cjs", ".js", ".mjs")) else [manager]
        run([*prefix, "--dir", "frontend", "install", "--frozen-lockfile"])
    elif shutil.which("corepack"):
        run([shutil.which("corepack"), "pnpm", "--dir", "frontend", "install", "--frozen-lockfile"])
    elif shutil.which("npm"):
        run([shutil.which("npm"), "--prefix", "frontend", "install"])
    else:
        raise SystemExit("Install pnpm (preferred) or npm, then rerun setup.")
    run([node, ROOT / "frontend/node_modules/typescript/bin/tsc", "-b", ROOT / "frontend"])
    subprocess.run([node, str(ROOT / "frontend/node_modules/vite/bin/vite.js"), "build"], cwd=ROOT / "frontend", check=True)
    environment = dict(os.environ)
    environment["UV_CACHE_DIR"] = str(ROOT / ".cache/uv")
    uv = shutil.which("uv")
    if uv:
        run([uv, "sync", "--frozen", "--extra", "dev", "--python", sys.executable], env=environment)
    else:
        venv_python = ROOT / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
        if not venv_python.exists():
            run([sys.executable, "-m", "venv", ROOT / ".venv"])
        run([venv_python, "-m", "pip", "install", "-e", ".[dev]"])
    print("Setup complete. Run the start script or the environment's 'python -m ryancad'.", flush=True)


if __name__ == "__main__":
    main()

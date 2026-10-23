#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Run python3.12 scripts/bootstrap.py once before starting RyanCAD."
  exit 1
fi
exec .venv/bin/python -m ryancad --demo mold "$@"

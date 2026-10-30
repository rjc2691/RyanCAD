"""Actionable diagnostics without importing the native kernel into the web server."""
from __future__ import annotations

import sys
from .errors import CadError


def kernel_start_error(error: Exception, platform: str | None = None) -> CadError:
    message = str(error)
    platform = sys.platform if platform is None else platform
    if platform.startswith("linux") and "libGL.so.1:" in message and "cannot open shared object file" in message:
        return CadError(
            "kernel_start_failed",
            "The CAD engine needs the Linux system library libGL.so.1. "
            "Ubuntu/Debian: sudo apt-get install -y libgl1. "
            "Amazon Linux 2023: sudo dnf install -y libglvnd-glx. "
            "Install it on the server, then restart RyanCAD.",
            missing_library="libGL.so.1", cause=message,
        )
    return CadError("kernel_start_failed", message)

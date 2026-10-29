"""Exercise an isolated Windows tray instance, including graceful persistence."""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import http.cookiejar
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

from ryancad.windows_tray import QUIT_COMMAND, WM_COMMAND


if sys.platform != "win32":
    raise SystemExit("This check requires Windows.")

root = Path(__file__).resolve().parents[1]
cache = root / ".cache"
cache.mkdir(exist_ok=True)
with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]

connection = root / "runtime" / f"connection-{port}.json"
user32 = ctypes.WinDLL("user32", use_last_error=True)
user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
user32.FindWindowW.restype = wintypes.HWND
user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
user32.PostMessageW.restype = wintypes.BOOL
user32.IsWindow.argtypes = [wintypes.HWND]
user32.IsWindow.restype = wintypes.BOOL
cookies = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
base = f"http://127.0.0.1:{port}"


def http(path, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(base + path, data=body, headers={"Content-Type": "application/json"})
    with opener.open(request, timeout=5) as response:
        return response.read()


def launch(project):
    process = subprocess.Popen([sys.executable, "-m", "ryancad", "--project", str(project),
                                "--port", str(port), "--no-browser"], cwd=root,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise AssertionError(f"Test server exited early: {process.stdout.read()}")
        try:
            data = json.loads(connection.read_text("utf-8"))
            hwnd = user32.FindWindowW(f"RyanCADTray_{data['pid']}", None)
            if hwnd:
                http("/api/health")
                return process, hwnd
        except (OSError, ValueError):
            pass
        time.sleep(.1)
    process.terminate()
    process.wait(timeout=10)
    raise AssertionError(f"Tray or test server did not start: {process.stdout.read()}")


def quit_from_tray(process, hwnd):
    if not user32.PostMessageW(hwnd, WM_COMMAND, QUIT_COMMAND, 0):
        raise ctypes.WinError(ctypes.get_last_error())
    assert process.wait(timeout=30) == 0, process.stdout.read()
    assert not connection.exists(), "The graceful shutdown should remove its connection file."
    assert not user32.IsWindow(hwnd), "The notification window should be removed on exit."


with tempfile.TemporaryDirectory(prefix="ryancad-tray-", dir=cache) as temporary:
    project = Path(temporary).resolve() / "isolated.rycad"
    project.relative_to(cache.resolve())  # Ensure cleanup only touches the owned test directory.
    process = None
    try:
        process, hwnd = launch(project)
        http("/")
        state = json.loads(http("/api/state"))
        submitted = json.loads(http("/api/commands", {"name": "document.rename", "expected_revision": state["document"]["revision"],
                                                       "args": {"name": "Tray persistence test"}}))
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            job = json.loads(http("/api/jobs/" + submitted["job_id"]))
            if job["status"] in {"complete", "failed", "cancelled"}:
                assert job["status"] == "complete", job
                break
            time.sleep(.1)
        else:
            raise AssertionError("The test edit did not finish.")
        quit_from_tray(process, hwnd)
        process, hwnd = launch(project)
        http("/")
        reopened = json.loads(http("/api/state"))
        assert reopened["document"]["name"] == "Tray persistence test"
        assert reopened["document"]["revision"] == 1
        quit_from_tray(process, hwnd)

        # The PowerShell launcher can detach a hidden server even when its path has spaces.
        background_project = Path(temporary).resolve() / "background project.rycad"
        launcher = subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                                   str(root / "Start-RyanCAD.ps1"), "-Background", "-NoBrowser",
                                   "-Project", str(background_project), "-Port", str(port)],
                                  cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        assert launcher.returncode == 0, "The background launcher failed."
        background_pid = None
        background_hwnd = None
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            try:
                record = json.loads(connection.read_text("utf-8"))
                assert Path(record["project"]).resolve() == background_project
                background_pid = record["pid"]
                background_hwnd = user32.FindWindowW(f"RyanCADTray_{background_pid}", None)
                if background_hwnd:
                    http("/api/health")
                    break
            except (OSError, ValueError):
                pass
            time.sleep(.1)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel32.OpenProcess.restype = wintypes.HANDLE
        kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel32.WaitForSingleObject.restype = wintypes.DWORD
        kernel32.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel32.OpenProcess(0x00100000 | 0x0001, False, background_pid) if background_pid else None
        try:
            assert background_hwnd, "The detached server did not register its tray icon."
            assert handle, "The detached test process could not be inspected."
            assert user32.PostMessageW(background_hwnd, WM_COMMAND, QUIT_COMMAND, 0)
            assert kernel32.WaitForSingleObject(handle, 30000) == 0, "The detached server did not exit."
            assert not connection.exists()
        finally:
            if handle and kernel32.WaitForSingleObject(handle, 0) != 0:
                kernel32.TerminateProcess(handle, 1)
                kernel32.WaitForSingleObject(handle, 10000)
            if handle:
                kernel32.CloseHandle(handle)
        print("Windows tray passed: icon registration, graceful Quit, saved-design recovery, and hidden launcher with spaces in the project path.")
    finally:
        if process and process.poll() is None:
            process.terminate()
            process.wait(timeout=10)

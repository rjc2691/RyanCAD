import os
from pathlib import Path
import socket
import subprocess
import sys
import threading

import pytest

from ryancad import windows_tray


def test_tray_commands_open_its_server_and_request_shutdown(monkeypatch):
    opened = []
    opened_event = threading.Event()
    exit_event = threading.Event()

    def open_browser(url):
        opened.append(url)
        opened_event.set()

    monkeypatch.setattr(windows_tray.webbrowser, "open", open_browser)
    tray = windows_tray.WindowsTray("http://127.0.0.1:8894", 8894, exit_event.set)
    tray._command(windows_tray.OPEN_COMMAND)
    assert opened_event.wait(2)
    assert opened == ["http://127.0.0.1:8894"]
    tray._command(windows_tray.QUIT_COMMAND)
    assert exit_event.is_set()


def test_non_windows_has_no_tray(monkeypatch):
    monkeypatch.setattr(windows_tray.sys, "platform", "linux")
    assert windows_tray.start_windows_tray("http://127.0.0.1:8790", 8790, lambda: None) is None


@pytest.mark.skipif(sys.platform != "win32", reason="Native notification areas are Windows-specific")
def test_real_windows_notification_window_handles_quit_and_closes(monkeypatch):
    requested = threading.Event()
    opened = threading.Event()
    monkeypatch.setattr(windows_tray.webbrowser, "open", lambda url: opened.set())
    tray = windows_tray.WindowsTray("http://127.0.0.1:8894", 8894, requested.set).start()
    try:
        if not tray._window:
            if os.environ.get("RYANCAD_REQUIRE_TRAY"):
                pytest.fail(f"Windows tray unavailable: {tray.error}")
            pytest.skip(f"Windows notification area unavailable: {tray.error}")
        assert tray.error is None
        assert tray.custom_icon_loaded, "The packaged RyanCAD icon should be used."
        assert tray._post_message(tray._window, windows_tray.WM_TRAY, 1, windows_tray.WM_LBUTTONDBLCLK)
        assert opened.wait(3)
        assert tray._post_message(tray._window, windows_tray.WM_COMMAND, windows_tray.QUIT_COMMAND, 0)
        assert requested.wait(3)
    finally:
        tray.close()
    assert not tray._thread.is_alive()


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell launcher is Windows-specific")
@pytest.mark.parametrize("lan", [False, True])
def test_background_launcher_reports_an_occupied_port(lan):
    root = Path(__file__).resolve().parents[1]
    if not (root / ".venv" / "Scripts" / "python.exe").exists():
        pytest.skip("The local PowerShell launcher requires its .venv.")
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        result = subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                                 str(root / "Start-RyanCAD.ps1"), "-Background", "-NoBrowser", "-Port", str(port)] + (["-Lan"] if lan else []),
                                cwd=root, capture_output=True, text=True, timeout=15)
        assert result.returncode != 0
        assert "already in use" in result.stderr + result.stdout

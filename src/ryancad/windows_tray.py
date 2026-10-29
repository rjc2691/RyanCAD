"""A small native Windows notification-area controller for the running server."""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import sys
import threading
import webbrowser


OPEN_COMMAND = 1001
QUIT_COMMAND = 1002
WM_COMMAND = 0x0111
WM_CLOSE = 0x0010
WM_DESTROY = 0x0002
WM_NULL = 0x0000
WM_TRAY = 0x8001
WM_LBUTTONDBLCLK = 0x0203
WM_RBUTTONUP = 0x0205
WM_CONTEXTMENU = 0x007B


class WindowsTray:
    """Own the icon and its hidden message window on a dedicated thread."""

    def __init__(self, url: str, port: int, request_exit):
        self.url = url
        self.port = port
        self.request_exit = request_exit
        self.class_name = f"RyanCADTray_{os.getpid()}"
        self._window = None
        self._post_message = None
        self._thread = None
        self._ready = threading.Event()
        self._stop_requested = threading.Event()
        self.error: str | None = None
        self.custom_icon_loaded = False

    def start(self):
        self._thread = threading.Thread(target=self._run, name="RyanCAD notification icon", daemon=True)
        self._thread.start()
        self._ready.wait(timeout=3)
        return self

    def close(self):
        self._stop_requested.set()
        if self._window and self._post_message:
            self._post_message(self._window, WM_CLOSE, 0, 0)
        if self._thread and self._thread is not threading.current_thread():
            self._thread.join(timeout=3)

    def _command(self, command: int):
        if command == OPEN_COMMAND:
            threading.Thread(target=webbrowser.open, args=(self.url,), daemon=True).start()
        elif command == QUIT_COMMAND:
            self.request_exit()

    def _run(self):
        try:
            self._message_loop()
        except Exception as exc:
            self.error = str(exc)
            print(f"RyanCAD notification icon unavailable: {exc}", file=sys.stderr, flush=True)
        finally:
            self._ready.set()

    def _message_loop(self):
        """Create and service a hidden top-level window in the tray thread."""
        user32 = ctypes.WinDLL("user32", use_last_error=True)
        shell32 = ctypes.WinDLL("shell32", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        LRESULT = ctypes.c_ssize_t
        WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

        class WNDCLASSW(ctypes.Structure):
            _fields_ = [("style", wintypes.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int),
                        ("cbWndExtra", ctypes.c_int), ("hInstance", wintypes.HINSTANCE), ("hIcon", wintypes.HICON),
                        ("hCursor", wintypes.HANDLE), ("hbrBackground", wintypes.HBRUSH),
                        ("lpszMenuName", wintypes.LPCWSTR), ("lpszClassName", wintypes.LPCWSTR)]

        class GUID(ctypes.Structure):
            _fields_ = [("Data1", wintypes.DWORD), ("Data2", wintypes.WORD), ("Data3", wintypes.WORD),
                        ("Data4", wintypes.BYTE * 8)]

        class NOTIFYICONDATAW(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.DWORD), ("hWnd", wintypes.HWND), ("uID", wintypes.UINT),
                        ("uFlags", wintypes.UINT), ("uCallbackMessage", wintypes.UINT), ("hIcon", wintypes.HICON),
                        ("szTip", wintypes.WCHAR * 128), ("dwState", wintypes.DWORD), ("dwStateMask", wintypes.DWORD),
                        ("szInfo", wintypes.WCHAR * 256), ("uTimeoutOrVersion", wintypes.UINT),
                        ("szInfoTitle", wintypes.WCHAR * 64), ("dwInfoFlags", wintypes.DWORD),
                        ("guidItem", GUID), ("hBalloonIcon", wintypes.HICON)]

        def signature(function, restype, *argtypes):
            function.restype = restype
            function.argtypes = argtypes
            return function

        get_module = signature(kernel32.GetModuleHandleW, wintypes.HINSTANCE, wintypes.LPCWSTR)
        register = signature(user32.RegisterClassW, wintypes.ATOM, ctypes.POINTER(WNDCLASSW))
        unregister = signature(user32.UnregisterClassW, wintypes.BOOL, wintypes.LPCWSTR, wintypes.HINSTANCE)
        create_window = signature(user32.CreateWindowExW, wintypes.HWND, wintypes.DWORD, wintypes.LPCWSTR,
                                  wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                  ctypes.c_int, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID)
        destroy_window = signature(user32.DestroyWindow, wintypes.BOOL, wintypes.HWND)
        default_proc = signature(user32.DefWindowProcW, LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
        post_message = signature(user32.PostMessageW, wintypes.BOOL, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
        post_quit = signature(user32.PostQuitMessage, None, ctypes.c_int)
        get_message = signature(user32.GetMessageW, ctypes.c_int, ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT)
        translate = signature(user32.TranslateMessage, wintypes.BOOL, ctypes.POINTER(wintypes.MSG))
        dispatch = signature(user32.DispatchMessageW, LRESULT, ctypes.POINTER(wintypes.MSG))
        register_message = signature(user32.RegisterWindowMessageW, wintypes.UINT, wintypes.LPCWSTR)
        load_image = signature(user32.LoadImageW, wintypes.HANDLE, wintypes.HINSTANCE, wintypes.LPCWSTR,
                               wintypes.UINT, ctypes.c_int, ctypes.c_int, wintypes.UINT)
        load_icon = signature(user32.LoadIconW, wintypes.HICON, wintypes.HINSTANCE, wintypes.LPCWSTR)
        destroy_icon = signature(user32.DestroyIcon, wintypes.BOOL, wintypes.HICON)
        notify = signature(shell32.Shell_NotifyIconW, wintypes.BOOL, wintypes.DWORD, ctypes.POINTER(NOTIFYICONDATAW))
        create_menu = signature(user32.CreatePopupMenu, wintypes.HMENU)
        append_menu = signature(user32.AppendMenuW, wintypes.BOOL, wintypes.HMENU, wintypes.UINT,
                                ctypes.c_size_t, wintypes.LPCWSTR)
        destroy_menu = signature(user32.DestroyMenu, wintypes.BOOL, wintypes.HMENU)
        cursor_position = signature(user32.GetCursorPos, wintypes.BOOL, ctypes.POINTER(wintypes.POINT))
        foreground = signature(user32.SetForegroundWindow, wintypes.BOOL, wintypes.HWND)
        track_menu = signature(user32.TrackPopupMenu, wintypes.UINT, wintypes.HMENU, wintypes.UINT,
                               ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.HWND, wintypes.LPVOID)

        instance = get_module(None)
        taskbar_created = register_message("TaskbarCreated")
        icon = None
        owns_icon = False
        registered = False
        added = False
        data = NOTIFYICONDATAW()

        def menu(hwnd):
            handle = create_menu()
            if not handle:
                return
            try:
                append_menu(handle, 0, OPEN_COMMAND, "Open RyanCAD")
                append_menu(handle, 0x0800, 0, None)  # MF_SEPARATOR
                append_menu(handle, 0, QUIT_COMMAND, "Quit RyanCAD")
                point = wintypes.POINT()
                if cursor_position(ctypes.byref(point)):
                    foreground(hwnd)
                    command = track_menu(handle, 0x0100 | 0x0080 | 0x0002, point.x, point.y, 0, hwnd, None)
                    post_message(hwnd, WM_NULL, 0, 0)
                    self._command(command)
            finally:
                destroy_menu(handle)

        @WNDPROC
        def window_proc(hwnd, message, wparam, lparam):
            nonlocal added
            if message == WM_TRAY:
                event = lparam & 0xFFFF
                if event == WM_LBUTTONDBLCLK:
                    self._command(OPEN_COMMAND)
                elif event in (WM_RBUTTONUP, WM_CONTEXTMENU):
                    menu(hwnd)
                return 0
            if message == WM_COMMAND:
                self._command(wparam & 0xFFFF)
                return 0
            if taskbar_created and message == taskbar_created:
                added = bool(notify(0, ctypes.byref(data)))  # NIM_ADD after Explorer restarts
                return 0
            if message == WM_CLOSE:
                if added:
                    notify(2, ctypes.byref(data))  # NIM_DELETE
                    added = False
                destroy_window(hwnd)
                return 0
            if message == WM_DESTROY:
                post_quit(0)
                return 0
            return default_proc(hwnd, message, wparam, lparam)

        try:
            window_class = WNDCLASSW()
            window_class.lpfnWndProc = window_proc
            window_class.hInstance = instance
            window_class.lpszClassName = self.class_name
            if not register(ctypes.byref(window_class)):
                raise ctypes.WinError(ctypes.get_last_error())
            registered = True
            self._window = create_window(0, self.class_name, f"RyanCAD ({self.port})", 0, 0, 0, 0, 0, None, None, instance, None)
            if not self._window:
                raise ctypes.WinError(ctypes.get_last_error())
            self._post_message = post_message
            icon_path = Path(__file__).resolve().parent / "assets" / "tray.ico"
            icon = load_image(None, str(icon_path), 1, 0, 0, 0x0010 | 0x0040)  # IMAGE_ICON, LR_LOADFROMFILE, LR_DEFAULTSIZE
            owns_icon = bool(icon)
            self.custom_icon_loaded = owns_icon
            if not icon:
                icon = load_icon(None, ctypes.cast(ctypes.c_void_p(32512), wintypes.LPCWSTR))  # IDI_APPLICATION
            data.cbSize = ctypes.sizeof(data)
            data.hWnd = self._window
            data.uID = 1
            data.uFlags = 0x0001 | 0x0002 | 0x0004  # NIF_MESSAGE | NIF_ICON | NIF_TIP
            data.uCallbackMessage = WM_TRAY
            data.hIcon = icon
            data.szTip = f"RyanCAD · port {self.port}"
            if not notify(0, ctypes.byref(data)):  # NIM_ADD
                raise OSError("Windows could not add the RyanCAD notification icon.")
            added = True
            self._ready.set()
            if self._stop_requested.is_set():
                post_message(self._window, WM_CLOSE, 0, 0)
            message = wintypes.MSG()
            while get_message(ctypes.byref(message), None, 0, 0) > 0:
                translate(ctypes.byref(message))
                dispatch(ctypes.byref(message))
        except Exception as exc:
            self.error = str(exc)
            print(f"RyanCAD notification icon unavailable: {exc}", file=sys.stderr, flush=True)
        finally:
            if added:
                notify(2, ctypes.byref(data))
            if self._window:
                destroy_window(self._window)
                self._window = None
            if owns_icon and icon:
                destroy_icon(icon)
            if registered:
                unregister(self.class_name, instance)
            self._ready.set()


def start_windows_tray(url: str, port: int, request_exit):
    """Start the optional controller on Windows; other platforms keep their normal behavior."""
    if sys.platform != "win32":
        return None
    return WindowsTray(url, port, request_exit).start()

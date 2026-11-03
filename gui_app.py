"""SeeEnglish app-window launcher (fallback for environments where Electron
cannot create a native window).

Starts the local FastAPI service, then opens the GUI in a dedicated Chrome or
Edge app window. The window has no address bar or tabs, so it reads as a
desktop app while still sharing the same API and database as the web UI.
"""

from __future__ import annotations

import argparse
import ctypes
import os
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from ctypes import wintypes
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8765
_STREAM_HANDLES: list[object] = []


def ensure_std_streams() -> None:
    """pythonw starts with sys.stdout/stderr set to None.

    uvicorn's default logging config calls sys.stdout.isatty(), which raises
    during startup under pythonw. Give the process real file streams before
    uvicorn is imported.
    """
    try:
        path = data_directory() / "gui.log"
        if sys.stdout is None:
            handle = path.open("a", encoding="utf-8", buffering=1)
            sys.stdout = handle
            _STREAM_HANDLES.append(handle)
        if sys.stderr is None:
            handle = path.open("a", encoding="utf-8", buffering=1)
            sys.stderr = handle
            _STREAM_HANDLES.append(handle)
    except OSError:
        pass


def data_directory() -> Path:
    path = ROOT / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


def log(message: str) -> None:
    try:
        with (data_directory() / "gui.log").open("a", encoding="utf-8") as handle:
            handle.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except OSError:
        pass


def show_error(message: str) -> None:
    log(message)
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, message, "SeeEnglish", 0x10)
    except Exception:
        pass


def health_ok(port: int) -> bool:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/api/health", timeout=1.2
        ) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def wait_for_backend(port: int, timeout: float = 18.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if health_ok(port):
            return True
        time.sleep(0.25)
    return False


def start_backend(port: int):
    ensure_std_streams()
    os.environ.setdefault("SEEENGLISH_DB", str(data_directory() / "seeenglish.db"))
    os.environ["SEEENGLISH_GUI_DIST"] = str(ROOT / "gui" / "dist")
    os.environ["SEEENGLISH_WEB_DIST"] = str(ROOT / "web" / "dist")

    import uvicorn

    config = uvicorn.Config(
        "server.main:app",
        host="127.0.0.1",
        port=port,
        log_level="warning",
        log_config=None,
        access_log=False,
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True, name="seeenglish-api")
    thread.start()
    return server, thread


def browser_candidates() -> list[Path]:
    program_files = Path(os.environ.get("ProgramFiles", "C:/Program Files"))
    program_files_x86 = Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)"))
    local_app = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    return [
        program_files / "Google/Chrome/Application/chrome.exe",
        program_files_x86 / "Google/Chrome/Application/chrome.exe",
        local_app / "Google/Chrome/Application/chrome.exe",
        program_files / "Microsoft/Edge/Application/msedge.exe",
        program_files_x86 / "Microsoft/Edge/Application/msedge.exe",
    ]


def default_browser_path() -> str:
    """Resolve the Windows default browser through AssocQueryStringW."""
    try:
        shlwapi = ctypes.windll.shlwapi
        shlwapi.AssocQueryStringW.argtypes = [
            wintypes.DWORD,
            wintypes.DWORD,
            wintypes.LPCWSTR,
            wintypes.LPCWSTR,
            wintypes.LPWSTR,
            ctypes.POINTER(wintypes.DWORD),
        ]
        shlwapi.AssocQueryStringW.restype = ctypes.c_long
        size = wintypes.DWORD(0)
        # ASSOCF_NONE, ASSOCSTR_EXECUTABLE, http, open
        shlwapi.AssocQueryStringW(0, 2, "http", "open", None, ctypes.byref(size))
        if size.value <= 1:
            return ""
        buffer = ctypes.create_unicode_buffer(size.value + 1)
        result = shlwapi.AssocQueryStringW(
            0, 2, "http", "open", buffer, ctypes.byref(size)
        )
        return buffer.value if result == 0 else ""
    except Exception:
        return ""


def find_browser() -> Path | None:
    default = default_browser_path()
    if default:
        candidate = Path(default)
        if candidate.exists():
            return candidate
    for candidate in browser_candidates():
        if candidate.exists():
            return candidate
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="seeenglish-gui")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Local API port")
    parser.add_argument(
        "--server-only",
        action="store_true",
        help="Start the local API and keep it alive without opening a window",
    )
    parser.add_argument(
        "--print-default-browser",
        action="store_true",
        help="Write the Windows default browser path to data/default-browser.txt",
    )
    return parser.parse_args()


def main() -> None:
    ensure_std_streams()
    args = parse_args()
    if args.print_default_browser:
        (data_directory() / "default-browser.txt").write_text(
            default_browser_path(), encoding="utf-8"
        )
        return
    port = args.port
    if port < 1 or port > 65535:
        show_error("端口必须在 1–65535 之间。")
        raise SystemExit(2)

    browser = find_browser()
    if browser is None:
        show_error("没有找到 Chrome 或 Edge，无法打开应用窗口。")
        raise SystemExit(1)

    server = None
    thread = None
    try:
        if args.server_only:
            if not health_ok(port):
                server, thread = start_backend(port)
                if not wait_for_backend(port):
                    show_error("本地 API 没有启动成功，请检查 data/gui.log。")
                    raise SystemExit(1)
            log("server-only launcher ready")
            while thread is not None and thread.is_alive():
                time.sleep(1)
            return

        if not health_ok(port):
            server, thread = start_backend(port)
            if not wait_for_backend(port):
                show_error("本地 API 没有启动成功，请检查 data/gui.log。")
                raise SystemExit(1)

        profile = data_directory() / "browser-profile"
        profile.mkdir(parents=True, exist_ok=True)
        url = f"http://127.0.0.1:{port}/gui/"
        log(f"opening app window: {browser} {url}")
        process = subprocess.Popen(
            [
                str(browser),
                f"--app={url}",
                "--window-size=1280,820",
                f"--user-data-dir={profile}",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-features=Translate",
            ]
        )
        process.wait()
    except SystemExit:
        raise
    except Exception:
        show_error("SeeEnglish 启动失败。\n\n" + traceback.format_exc())
    finally:
        if server is not None:
            server.should_exit = True
        if thread is not None:
            thread.join(timeout=4)
        log("app window closed")


if __name__ == "__main__":
    main()

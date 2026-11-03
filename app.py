"""SeeEnglish command-line launcher.

Usage:
    python app.py
    python app.py --port 9000 --open
    python app.py --reload
"""

from __future__ import annotations

import argparse
import socket
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8765


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="seeenglish",
        description="Start the SeeEnglish local UI and API.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Port (default: {DEFAULT_PORT})")
    parser.add_argument("--reload", action="store_true", help="Reload the API when Python files change")
    parser.add_argument("--open", action="store_true", help="Open the UI in the default browser")
    return parser.parse_args()


def _port_available(host: str, port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
        return True
    except OSError:
        return False


def _print_banner(host: str, port: int) -> None:
    display_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    base = f"http://{display_host}:{port}"
    web_exists = (ROOT / "web" / "dist" / "index.html").exists()
    line = "─" * 54
    print()
    print(f"  SeeEnglish  /  见词")
    print(f"  {line}")
    if web_exists:
        print(f"  UI         {base}")
    else:
        print("  UI         not built  ·  cd web && npm run build")
    print(f"  Local API  {base}/api")
    print(f"  Health     {base}/api/health")
    print(f"  API Docs   {base}/docs")
    print(f"  {line}")
    print("  Press Ctrl+C to stop.\n", flush=True)


def main() -> None:
    args = _parse_args()
    if args.port < 1 or args.port > 65535:
        print("Port must be between 1 and 65535.", file=sys.stderr)
        raise SystemExit(2)
    if not _port_available(args.host, args.port):
        print(
            f"Port {args.port} is already in use. Try: python app.py --port {args.port + 1}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

    _print_banner(args.host, args.port)

    if args.open:
        base = f"http://{'127.0.0.1' if args.host in {'0.0.0.0', '::'} else args.host}:{args.port}"
        threading.Timer(1.0, lambda: webbrowser.open(base)).start()

    import uvicorn

    uvicorn.run(
        "server.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(ROOT / "server")] if args.reload else None,
        log_level="info",
    )


if __name__ == "__main__":
    main()

"""Frozen backend entry point used by the installed desktop app."""

from __future__ import annotations

import argparse
import sys

import uvicorn

from server.main import app


def main() -> None:
    parser = argparse.ArgumentParser(prog="SeeEnglishBackend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_config=None,
        access_log=False,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback

        traceback.print_exc()
        sys.exit(1)

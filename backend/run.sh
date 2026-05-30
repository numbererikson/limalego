#!/usr/bin/env bash
# Start the FastAPI server, bound to all interfaces so the iPhone on the LAN can reach it.
set -euo pipefail
cd "$(dirname "$0")"
exec ../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 "$@"

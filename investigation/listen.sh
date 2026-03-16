#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
if [[ -x "$ROOT/.venv/bin/mitmweb" ]]; then
  exec "$ROOT/.venv/bin/mitmweb" -s via_listener.py "$@"
elif [[ -x "$ROOT/venv/bin/mitmweb" ]]; then
  exec "$ROOT/venv/bin/mitmweb" -s via_listener.py "$@"
else
  if ! command -v mitmweb &>/dev/null; then
    echo "mitmweb not found. Install it in the repo venv (from repo root):" >&2
    echo "  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
    exit 1
  fi
  exec mitmweb -s via_listener.py "$@"
fi

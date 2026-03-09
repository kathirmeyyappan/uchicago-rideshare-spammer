"""
Via listener: mitmproxy addon that logs every request to Via's recurring `validate` endpoint.

Writes:
- via_validate_calls.json: JSON array of all validate requests (pretty-printed)

Usage:
  mitmdump -s via_listener.py
  # or
  mitmweb -s via_listener.py

Make sure device/app is configured to use this mitmproxy instance as its HTTP(S) proxy.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from mitmproxy import http, ctx

TARGET_URL = "https://router-ucaca.live.ridewithvia.com/ops/rider/proposal/prescheduled/recurring/validate"
CALLS_LOG = Path("via_validate_calls.json")


def _load_calls() -> list:
    if not CALLS_LOG.exists():
        return []
    try:
        data = json.loads(CALLS_LOG.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def request(flow: http.HTTPFlow) -> None:
    """
    Called whenever a client request is received.
    """
    if not flow.request.pretty_url.startswith(TARGET_URL):
        return

    msg = f"Matched validate call: {flow.request.method} {flow.request.pretty_url}"
    ctx.log.info(msg)

    payload = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "method": flow.request.method,
        "url": flow.request.pretty_url,
        "headers": dict(flow.request.headers),
    }
    if flow.request.content:
        try:
            raw = flow.request.content.decode("utf-8", errors="replace")
            try:
                payload["body"] = json.loads(raw)
            except json.JSONDecodeError:
                payload["body"] = raw
        except Exception:
            payload["body_raw_hex"] = flow.request.content.hex()

    try:
        calls = _load_calls()
        calls.append(payload)
        CALLS_LOG.write_text(
            json.dumps(calls, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as e:
        ctx.log.warn(f"Could not write {CALLS_LOG}: {e}")

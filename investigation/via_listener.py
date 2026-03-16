"""
mitmproxy addon: logs every request to Via's recurring `validate` endpoint.

Writes:
- investigation/via_validate_calls.json: raw request log (for debugging)
- via_credentials.json (repo root): credentials + origin/destination for the attack CLI

Run from repo root: ./investigate.sh (or cd investigation && mitmweb -s via_listener.py).
Proxy the phone, then book a ride; the root JSON is updated on each validate request.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from mitmproxy import http, ctx

TARGET_URL = "https://router-ucaca.live.ridewithvia.com/ops/rider/proposal/prescheduled/recurring/validate"
REPO_ROOT = Path(__file__).resolve().parent.parent
CALLS_LOG = Path(__file__).resolve().parent / "via_validate_calls.json"
CREDENTIALS_JSON = REPO_ROOT / "via_credentials.json"


def _load_calls() -> list:
    if not CALLS_LOG.exists():
        return []
    try:
        data = json.loads(CALLS_LOG.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _extract_origin_destination(body: dict) -> tuple:
    o = (body or {}).get("prescheduled_recurring_series_details", {}).get("origin")
    d = (body or {}).get("prescheduled_recurring_series_details", {}).get("destination")
    if not o or not d:
        return None, None
    latlng_o = (o.get("latlng") or {}) if isinstance(o, dict) else {}
    latlng_d = (d.get("latlng") or {}) if isinstance(d, dict) else {}
    origin = {
        "geocoded_addr": o.get("geocoded_addr"),
        "full_geocoded_addr": o.get("full_geocoded_addr"),
        "lat": latlng_o.get("lat"),
        "lng": latlng_o.get("lng"),
    } if isinstance(o, dict) else None
    destination = {
        "geocoded_addr": d.get("geocoded_addr"),
        "full_geocoded_addr": d.get("full_geocoded_addr"),
        "lat": latlng_d.get("lat"),
        "lng": latlng_d.get("lng"),
    } if isinstance(d, dict) else None
    return origin, destination


def request(flow: http.HTTPFlow) -> None:
    if not flow.request.pretty_url.startswith(TARGET_URL):
        return

    ctx.log.info(f"Matched validate call: {flow.request.method} {flow.request.pretty_url}")

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
        CALLS_LOG.write_text(json.dumps(calls, indent=2, ensure_ascii=False), encoding="utf-8")

        auth_token = payload.get("headers", {}).get("authorization") or (
            (payload.get("body") or {}).get("whos_asking", {}).get("auth_token")
        )
        if auth_token:
            body = payload.get("body") or {}
            whos = body.get("whos_asking") or {}
            origin, destination = _extract_origin_destination(body)
            creds = {
                "auth_token": auth_token,
                "rider_id": whos.get("id"),
                "origin": origin,
                "destination": destination,
            }
            CREDENTIALS_JSON.write_text(json.dumps(creds, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        ctx.log.warn("Could not write capture: %s", e)

# uchicago-rideshare-spammer

**→ Full write-up, findings, and rationale: [Via RideSmart API Spamming — Findings & Implementation](https://www.notion.so/723eea1ebed842ccb255621bffe1d186)** — that’s the place to see the full picture.

---

## What this is

Reverse-engineering UChicago’s **RideSmart** app (Via) to understand its API: which endpoints drive route assignment and the free-Lyft fallback, and whether I could generate synthetic traffic to stress the routing engine.

## Why I gave up

The API is wide open (no WAF, no rate limiting, trivially replayable with an auth token). But **flooding `/validate` does not reliably trigger the Lyft fallback**. That endpoint is likely **stateless** (read-only feasibility check) and doesn’t inject demand into Via’s route planner. The Lyft voucher is probably gated by real `/book`-level demand or fleet availability, not `/validate` traffic. Without spamming `/book` (which creates real ride records and has unknown side effects), the “free Lyft via API flooding” idea is **not proven** — so the project is abandoned.

---

## Repo layout

| Area | What’s here |
|------|-------------|
| **[investigation/](investigation/)** | Python + mitmproxy: capture live validate (and optionally book) requests. See [investigation/README.md](investigation/README.md) and `via_listener.py` / `listen.sh`. |
| **[attack/](attack/)** | Node CLI and module to replay/spam the validate endpoint using captured credentials. See [attack/README.md](attack/README.md) for env vars and `cli.js` usage. |

Start with the Notion doc for context; use the subdir READMEs for runnable steps.

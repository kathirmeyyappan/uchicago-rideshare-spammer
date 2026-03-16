## What this is

Tool that spoofs UChicago RideSmart requests in high volume to try to get free lyfts (see instructions below).

I tried reverse-engineering UChicago’s **RideSmart** app (Via) to understand its API: which endpoints drive route assignment and the free-Lyft fallback, and is it possible to generate synthetic traffic to stress the routing engine to get free Lyft rides?

## Disclaimer

The API is wide open (no WAF, no rate limiting, trivially replayable with an auth token). But **flooding `/validate` does not seem to reliably trigger the Lyft fallback**. That endpoint is likely **stateless** (read-only feasibility check) and doesn’t inject demand into Via’s route planner. The Lyft voucher could be gated by real `/book`-level demand or fleet availability, rather than `/validate` traffic. Without spamming `/book` (which creates real ride records and has unknown side effects), the “free Lyft via API flooding” idea is **not proven**. That being said, I do seem to get Lyfts at a higher rate when timing the request on my phone properly.

---

## Setup (one-time)

For the investigation script you need mitmproxy in a venv (or on PATH):

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

You will also need to wire up your phone so that network traffic can be recorded by scripts running on your machine. See instructions for that here: https://info.kathirm.com/ridshare-spammer-setup.

---

## Instructions (run from repo root)

1. **Point your phone at this computer.**  
   Follow [these instructions](https://info.kathirm.com/ridshare-spammer-setup) to send your phone’s network traffic through the machine running the scripts.

2. **Capture credentials.**  
   Run `./investigate.sh`. Book a ride in the RideSmart app. The listener writes **`via_credentials.json`** in the repo root (overwritten on each validate request).

3. **Replay / spam validate.**  
   Once **`via_credentials.json`** has been created, run `./attack.sh`. See [attack/README.md](attack/README.md) for params and customization.

To test without running investigation: copy `via_credentials.json.example` to `via_credentials.json` and paste your auth token and rider id (e.g. from a previous capture).

| Dir | Purpose |
|-----|---------|
| [investigation/](investigation/) | mitmproxy addon + `listen.sh`. See [investigation/README.md](investigation/README.md). |
| [attack/](attack/) | Node module + CLI. See [attack/README.md](attack/README.md). |

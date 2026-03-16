# Attack

Run from **repo root**: `./attack.sh [--once] [--loop N] [--interval MS] [--concurrent N] [--randomize-requests]`.

Credentials are read from **`via_credentials.json`** in the root (same file the investigation script writes). To test without capturing: `cp via_credentials.json.example via_credentials.json` and fill `auth_token` and `rider_id`.

**Locations:** If the creds file has no `origin`/`destination`, or you pass **`--randomize-requests`**, each request uses a random origin and destination from a fixed list of UChicago locations. Otherwise the captured locations from the creds file are used.

Flags: `--once` | `--loop N` | `--interval MS` | `--concurrent N` | `--randomize-requests`.

Programmatic: `const { sendValidate } = require("./spoof-validate.js");` then call `sendValidate(opts)`.

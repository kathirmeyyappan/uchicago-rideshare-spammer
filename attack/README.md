# Attack

**Module:** `spoof-validate.js` → `sendValidate(opts)`.  
**CLI:** `cli.js` — env + args, then calls `sendValidate`.

## CLI

```bash
cd attack
cp .env.example .env   # paste values from investigation/via_validate_calls.json
node cli.js --once
node cli.js --loop 5 --interval 2000
node cli.js --concurrent 4      # 4 parallel (optional)
node cli.js --capture ../investigation/via_validate_calls.json --index 0
```

Flags: `--once` (default) | `--loop N` | `--interval MS` | `--concurrent N` | `--capture FILE` | `--index N`.

## Programmatic

```js
const { sendValidate } = require("./spoof-validate.js");
const results = await sendValidate({ authToken, riderId, count: 1, dumpDir: "./out" });
```

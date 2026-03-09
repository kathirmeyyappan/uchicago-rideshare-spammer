#!/usr/bin/env node
/**
 * CLI for spoof-validate. Loads .env, parses args, resolves credentials (env or --capture), calls sendValidate.
 * Usage: node cli.js [--once] [--loop N] [--interval MS] [--concurrent N] [--capture FILE] [--index N]
 */

const path = require("path");
const fs = require("fs");
const { sendValidate } = require("./spoof-validate.js");

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  try {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch (_) {}
}

function uuid4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

function loadCapture(filePath, index = 0) {
  const p = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const list = Array.isArray(data) ? data : [data];
  const entry = list[index];
  if (!entry || !entry.body) throw new Error("No body in capture entry at index " + index);
  const auth = entry.headers?.authorization || entry.body?.whos_asking?.auth_token;
  const riderId = entry.body?.whos_asking?.id;
  if (!auth || riderId == null) throw new Error("Capture must have authorization and whos_asking.id");
  const o = entry.body?.prescheduled_recurring_series_details?.origin;
  const d = entry.body?.prescheduled_recurring_series_details?.destination;
  return {
    authToken: auth,
    riderId,
    rbzid: entry.headers?.rbzid ?? null,
    cookie: entry.headers?.cookie ?? null,
    deviceId: entry.body?.client_details?.client_spec?.device_id ?? uuid4(),
    origin: o ? { geocoded_addr: o.geocoded_addr, full_geocoded_addr: o.full_geocoded_addr, lat: o.latlng?.lat, lng: o.latlng?.lng } : null,
    destination: d ? { geocoded_addr: d.geocoded_addr, full_geocoded_addr: d.full_geocoded_addr, lat: d.latlng?.lat, lng: d.latlng?.lng } : null,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { once: true, loop: 1, interval: 2000, capture: null, index: 0, concurrent: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--once") out.once = true;
    else if (args[i] === "--loop" && args[i + 1] != null) { out.loop = parseInt(args[++i], 10) || 1; out.once = false; }
    else if (args[i] === "--interval" && args[i + 1] != null) out.interval = parseInt(args[++i], 10) || 1000;
    else if (args[i] === "--concurrent" && args[i + 1] != null && /^\d+$/.test(args[i + 1])) {
      out.concurrent = parseInt(args[++i], 10);
      out.once = false;
    } else if (args[i] === "--capture" && args[i + 1] != null) out.capture = args[++i];
    else if (args[i] === "--index" && args[i + 1] != null) out.index = parseInt(args[++i], 10) || 0;
  }
  return out;
}

function log(label, value) {
  console.log(value === undefined ? `  ${label}` : `  ${label}: ${value}`);
}

async function main() {
  loadEnv();
  const args = parseArgs();

  let authToken = process.env.VIA_AUTH_TOKEN;
  let riderId = process.env.VIA_RIDER_ID != null ? parseInt(process.env.VIA_RIDER_ID, 10) : null;
  let rbzid = process.env.VIA_RBZID || null;
  let cookie = process.env.VIA_COOKIE || null;
  let deviceId = process.env.VIA_DEVICE_ID || uuid4();
  let origin = null;
  let destination = null;
  let credentialSource = "env (.env or process.env)";

  if (args.capture) {
    const cap = loadCapture(args.capture, args.index);
    authToken = cap.authToken;
    riderId = cap.riderId;
    rbzid = cap.rbzid ?? rbzid;
    cookie = cap.cookie ?? cookie;
    deviceId = cap.deviceId ?? deviceId;
    origin = cap.origin;
    destination = cap.destination;
    credentialSource = `capture file (index ${args.index})`;
  }

  if (!authToken || riderId == null) {
    console.error("Missing credentials. Set VIA_AUTH_TOKEN and VIA_RIDER_ID, or use --capture <via_validate_calls.json>");
    process.exit(1);
  }

  const n = args.concurrent != null ? args.concurrent : (args.once ? 1 : Math.max(1, args.loop));

  console.log("Credentials & session-bound headers");
  log("source", credentialSource);
  log("rider_id", riderId);
  log("device_id", deviceId);
  log("auth_token", authToken ? `${authToken.slice(0, 20)}...` : "(missing)");
  log("rbzid (Radware)", rbzid ? `${rbzid.slice(0, 8)}...` : "(not set — may trigger bot detection)");
  log("cookie (Cloudflare)", cookie ? `set, ${cookie.length} chars` : "(not set — may trigger bot detection)");
  if (args.concurrent != null) log("mode", `${n} concurrent`);
  console.log("");

  const results = await sendValidate({
    authToken,
    riderId,
    deviceId,
    rbzid,
    cookie,
    origin,
    destination,
    count: args.concurrent == null ? n : undefined,
    intervalMs: args.interval,
    concurrent: args.concurrent != null ? n : undefined,
    dumpDir: __dirname,
  });

  results.forEach((result, i) => {
    console.log(`[${i + 1}/${n}] Response`);
    log("status", result.status);
    log("ok", result.ok);
    if (result.body) {
      const proposals = result.body.proposals ?? [];
      log("proposals_count", proposals.length);
      if (result.body.header_text) log("header_text", result.body.header_text);
      if (result.body.unavailable_providers?.length) log("unavailable_providers", result.body.unavailable_providers.join(", "));
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

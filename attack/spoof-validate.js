#!/usr/bin/env node
/**
 * Spoof the Via RideSmart recurring/validate endpoint.
 *
 * Uses the mock payload from Notion. Requires real session credentials —
 * capture via mitm (investigation/listen.sh) and pass via env or --capture file.
 * Env values map to investigation/via_validate_calls.json as follows:
 *
 * Env                  | Capture path
 * ---------------------|----------------------------------------------------------
 * VIA_AUTH_TOKEN       | headers.authorization or body.whos_asking.auth_token
 * VIA_RIDER_ID         | body.whos_asking.id (e.g. 8173)
 * VIA_RBZID            | headers.rbzid (optional, Radware fingerprint)
 * VIA_COOKIE           | headers.cookie (optional, __cf_bm + __cflb)
 * VIA_DEVICE_ID        | body.client_details.client_spec.device_id (optional, else random UUID)
 *
 * Usage:
 *   VIA_AUTH_TOKEN="2|1:0|..." VIA_RIDER_ID=8173 node spoof-validate.js [--once]
 *   node spoof-validate.js --capture ../investigation/via_validate_calls.json [--index 0] [--loop 5] [--interval 2000]
 */

const path = require("path");
const fs = require("fs");

// Load attack/.env so you can copy .env.example → .env and paste capture values
(function loadEnv() {
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
})();

const VALIDATE_URL =
  "https://router-ucaca.live.ridewithvia.com/ops/rider/proposal/prescheduled/recurring/validate";

const SUPPORTED_FEATURES = [
  "MULTIPLE_PROPOSALS",
  "UNAVAILABLE_PROVIDERS",
  "PUBLIC_TRANSPORT",
  "PUBLIC_TRANSPORT_BUY_TICKET",
  "PREBOOKING_RIDE_SUPPLIER",
  "PREBOOKING_INTER_MODAL",
  "INTERMODAL_SECOND_LEG",
  "GENERIC_PROPOSALS",
  "NOW_LATER",
  "AUTONOMOUS_VEHICLE",
  "THIRD_PARTY",
  "DEEP_LINK_PROPOSALS",
  "RECURRING_INTERMODAL",
];

// Campus-ish origin/destination pairs (name, full_geocoded_addr, lat, lng)
const LOCATIONS = [
  {
    geocoded_addr: "John Crear Library",
    full_geocoded_addr: "John Crear Library",
    lat: 41.7904925,
    lng: -87.6035966,
  },
  {
    geocoded_addr: "Ratner",
    full_geocoded_addr: "Ratner, Chicago, IL, USA",
    lat: 41.7942566,
    lng: -87.6015131,
  },
  {
    geocoded_addr: "5134 S Ingleside Ave, Chicago",
    full_geocoded_addr: "5134 S Ingleside Ave, Chicago, IL 60615, USA",
    lat: 41.801086979247714,
    lng: -87.60301910340786,
  },
  {
    geocoded_addr: "Browns Barber Shop, East 53rd Street, Chicago, IL, USA",
    full_geocoded_addr: "Browns Barber Shop, East 53rd Street, Chicago, IL, USA",
    lat: 41.7992278,
    lng: -87.60073640000002,
  },
];

function uuid4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

function randomBigInt() {
  return BigInt(Math.floor(Number.MAX_SAFE_INTEGER * Math.random())) * BigInt(2);
}

function pickOriginDestination() {
  // const o = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  // let d = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  // while (d === o) d = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  // return { origin: o, destination: d };
  return { origin: LOCATIONS[0], destination: LOCATIONS[3] }; // Crear → Browns
}

function buildPayload(opts) {
  const {
    authToken,
    riderId,
    deviceId = uuid4(),
    origin,
    destination,
    clientTs = Date.now() / 1000,
  } = opts;

  const { origin: o, destination: d } = origin && destination
    ? { origin, destination }
    : pickOriginDestination();

  return {
    sub_services: ["U_Chicago_Safe_Ride"],
    id: 0,
    client_details: {
      client_spec: {
        app_id: "UniversityOfChicagoRider",
        device_name: "iPhone",
        app_name: "RideSmart",
        client_os: 0,
        device_model: "iPhone18,1",
        client_version: { major_version: "4.26.4", minor_version: "1" },
        device_id: deviceId,
        client_os_version: "26.2.1",
        client_type: 0,
      },
      client_state: {
        charging: false,
        battery_level: -1,
        client_ts: clientTs,
      },
    },
    prescheduled_recurring_series_details: {
      origin: {
        geocoded_addr: o.geocoded_addr,
        full_geocoded_addr: o.full_geocoded_addr,
        latlng: { lat: o.lat, lng: o.lng },
      },
      n_passengers: 4,
      destination: {
        geocoded_addr: d.geocoded_addr,
        full_geocoded_addr: d.full_geocoded_addr,
        latlng: { lat: d.lat, lng: d.lng },
      },
      recurring_series_type: "OT",
    },
    supported_features: SUPPORTED_FEATURES,
    whos_asking: {
      acct_type: 0,
      id: riderId,
      auth_token: authToken,
    },
    prescheduled_recurring_series_id: 0,
    mp_session_id: Number(randomBigInt()),
    prescheduled_recurring_series_ride_details: { display_time: [] },
    rider_service_flag: 0,
    end_date_timestamp: clientTs,
    city_id: 783,
  };
}

function buildHeaders(body, opts) {
  const {
    authToken,
    deviceId,
    rbzid = null,
    cookie = null,
  } = opts;

  const bodyStr = JSON.stringify(body);
  const requestId = uuid4();
  const xRequestId = uuid4();
  const sentryTraceId = uuid4().replace(/-/g, "").slice(0, 32);
  const sentrySpanId = uuid4().replace(/-/g, "").slice(0, 16);

  const headers = {
    "content-type": "application/json",
    authorization: authToken,
    "x-via-tenant": "ucaca",
    request_id: requestId,
    baggage: `sentry-environment=production,sentry-public_key=9a1bb62e186a44fdb3d352cfa075d229,sentry-release=com.ridewithvia.UCA.UniversityOfChicagoRider%404.26.4%2B1,sentry-trace_id=${sentryTraceId}`,
    accept: "*/*",
    priority: "u=3, i",
    "sentry-trace": `${sentryTraceId}-${sentrySpanId}-0`,
    "accept-language": "en-US",
    "accept-encoding": "gzip, deflate, br",
    "x-request-id": xRequestId,
    "content-length": String(Buffer.byteLength(bodyStr, "utf8")),
    "user-agent": "ViaRider/4.26.4(1) Alamofire/5.10.2 (iOS 26.2.1; iPhone18,1)",
    "x-via-city-id": "783",
    "x-via-actor": `com.ridewithvia.UCA.UniversityOfChicagoRider_4.26.4_(1)_${deviceId}`,
  };

  if (rbzid) headers.rbzid = rbzid;
  if (cookie) headers.cookie = cookie;

  return headers;
}

async function postValidate(body, headers) {
  const res = await fetch(VALIDATE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, body: json, raw: text };
}

function dumpResponse(result, requestIndex) {
  const path = require("path");
  const fs = require("fs");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `response_${ts}_${requestIndex}.json`;
  const outPath = path.join(__dirname, name);
  fs.writeFileSync(outPath, JSON.stringify({ timestamp_utc: new Date().toISOString(), request_index: requestIndex, ...result }, null, 2), "utf8");
  return outPath;
}

function log(label, value) {
  if (value === undefined) console.log(`  ${label}`);
  else console.log(`  ${label}: ${value}`);
}

async function main() {
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

  const n = args.once ? 1 : Math.max(1, args.loop);

  console.log("Credentials & session-bound headers");
  log("source", credentialSource);
  log("rider_id", riderId);
  log("device_id", deviceId);
  log("auth_token", authToken ? `${authToken.slice(0, 20)}...` : "(missing)");
  log("rbzid (Radware)", rbzid ? `${rbzid.slice(0, 8)}...` : "(not set — may trigger bot detection)");
  log("cookie (Cloudflare)", cookie ? `set, ${cookie.length} chars` : "(not set — may trigger bot detection)");
  console.log("");

  for (let i = 0; i < n; i++) {
    const clientTs = Date.now() / 1000;
    const payload = buildPayload({
      authToken,
      riderId,
      deviceId,
      origin,
      destination,
      clientTs,
    });
    const headers = buildHeaders(payload, { authToken, deviceId, rbzid, cookie });
    const bodyStr = JSON.stringify(payload);

    console.log(`[${i + 1}/${n}] Request`);
    log("url", VALIDATE_URL);
    log("body_size", `${bodyStr.length} bytes`);
    log("origin", payload.prescheduled_recurring_series_details.origin.geocoded_addr);
    log("destination", payload.prescheduled_recurring_series_details.destination.geocoded_addr);
    log("request_id", headers.request_id);
    log("x-request_id", headers["x-request-id"]);
    log("x-via-actor", headers["x-via-actor"].slice(-36));
    log("rbzid_sent", !!headers.rbzid);
    log("cookie_sent", !!headers.cookie);

    const result = await postValidate(payload, headers);

    const dumpPath = dumpResponse(result, i + 1);
    log("response_dump", dumpPath);

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
    if (!result.ok) {
      log("raw_preview", result.raw?.slice(0, 300) ?? "(empty)");
    }
    console.log("");

    if (i < n - 1 && args.interval > 0) {
      await new Promise((r) => setTimeout(r, args.interval));
    }
  }
}

function loadCapture(filePath, index = 0) {
  const fs = require("fs");
  const path = require("path");
  const p = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const list = Array.isArray(data) ? data : [data];
  const entry = list[index];
  if (!entry || !entry.body) throw new Error("No body in capture entry at index " + index);
  const auth = entry.headers?.authorization || entry.body?.whos_asking?.auth_token;
  const riderId = entry.body?.whos_asking?.id;
  if (!auth || riderId == null) throw new Error("Capture must have authorization and whos_asking.id");
  return {
    authToken: auth,
    riderId,
    rbzid: entry.headers?.rbzid ?? null,
    cookie: entry.headers?.cookie ?? null,
    deviceId: entry.body?.client_details?.client_spec?.device_id ?? uuid4(),
    origin: entry.body?.prescheduled_recurring_series_details?.origin
      ? {
          geocoded_addr: entry.body.prescheduled_recurring_series_details.origin.geocoded_addr,
          full_geocoded_addr: entry.body.prescheduled_recurring_series_details.origin.full_geocoded_addr,
          lat: entry.body.prescheduled_recurring_series_details.origin.latlng?.lat,
          lng: entry.body.prescheduled_recurring_series_details.origin.latlng?.lng,
        }
      : null,
    destination: entry.body?.prescheduled_recurring_series_details?.destination
      ? {
          geocoded_addr: entry.body.prescheduled_recurring_series_details.destination.geocoded_addr,
          full_geocoded_addr: entry.body.prescheduled_recurring_series_details.destination.full_geocoded_addr,
          lat: entry.body.prescheduled_recurring_series_details.destination.latlng?.lat,
          lng: entry.body.prescheduled_recurring_series_details.destination.latlng?.lng,
        }
      : null,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { once: true, loop: 1, interval: 2000, capture: null, index: 0 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--once") out.once = true;
    else if (args[i] === "--loop" && args[i + 1] != null) {
      out.loop = parseInt(args[++i], 10) || 1;
      out.once = false;
    } else if (args[i] === "--interval" && args[i + 1] != null) {
      out.interval = parseInt(args[++i], 10) || 1000;
    } else if (args[i] === "--capture" && args[i + 1] != null) {
      out.capture = args[++i];
    } else if (args[i] === "--index" && args[i + 1] != null) {
      out.index = parseInt(args[++i], 10) || 0;
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

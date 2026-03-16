/**
 * Module only. Exports sendValidate(opts) for spoofing the Via recurring/validate endpoint.
 * CLI and other entrypoints live in separate files (e.g. cli.js) that require this and call sendValidate.
 *
 * @see sendValidate JSDoc for options and return value.
 */

const path = require("path");
const fs = require("fs");

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

// UChicago / RideSmart: from investigation/via_validate_calls.json where present; 5134 S Ingleside was in original code (not in capture).
const LOCATIONS = [
  { geocoded_addr: "John Crear Library", full_geocoded_addr: "John Crear Library", lat: 41.7904925, lng: -87.6035966 },
  { geocoded_addr: "Ratner", full_geocoded_addr: "Ratner, Chicago, IL, USA", lat: 41.7942566, lng: -87.6015131 },
  { geocoded_addr: "5134 S Ingleside Ave, Chicago", full_geocoded_addr: "5134 S Ingleside Ave, Chicago, IL 60615, USA", lat: 41.801086979247714, lng: -87.60301910340786 },
  { geocoded_addr: "5142 S Ingleside Ave, Chicago", full_geocoded_addr: "5142 S Ingleside Ave, Chicago, IL 60615, USA", lat: 41.80095601261519, lng: -87.60317265987396 },
  { geocoded_addr: "Browns Barber Shop, East 53rd Street, Chicago, IL, USA", full_geocoded_addr: "Browns Barber Shop, East 53rd Street, Chicago, IL, USA", lat: 41.7992278, lng: -87.60073640000002 },
  { geocoded_addr: "Kent", full_geocoded_addr: "Kent", lat: 41.79301, lng: -87.60139 },
  { geocoded_addr: "Woodlawn Dining Commons", full_geocoded_addr: "Woodlawn Dining Commons", lat: 41.7848865, lng: -87.5978597 },
  { geocoded_addr: "Cathey Dining Commons", full_geocoded_addr: "Cathey Dining Commons", lat: 41.7851539, lng: -87.6011259 },
  { geocoded_addr: "Saieh Hall", full_geocoded_addr: "Saieh Hall", lat: 41.7898996, lng: -87.5964634 },
  { geocoded_addr: "6016 S Cottage Grove Ave, Chicago", full_geocoded_addr: "6016 S Cottage Grove Ave, Chicago, IL 60637, USA", lat: 41.78511, lng: -87.60629 },
  { geocoded_addr: "Taco Bell, East 53rd Street, Chicago, IL, USA", full_geocoded_addr: "Taco Bell, East 53rd Street, Chicago, IL, USA", lat: 41.7992164, lng: -87.5924969 },
  { geocoded_addr: "Siam Thai, East 55th Street, Chicago, IL, USA", full_geocoded_addr: "Siam Thai, East 55th Street, Chicago, IL, USA", lat: 41.79508, lng: -87.58502399999999 },
  { geocoded_addr: "Student Wellness Center", full_geocoded_addr: "Student Wellness Center", lat: 41.7877271, lng: -87.6042521 },
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
  return { origin: LOCATIONS[0], destination: LOCATIONS[3] };
}

function pickRandomOriginDestination() {
  const i = Math.floor(Math.random() * LOCATIONS.length);
  let j = Math.floor(Math.random() * LOCATIONS.length);
  if (LOCATIONS.length > 1) while (j === i) j = Math.floor(Math.random() * LOCATIONS.length);
  return { origin: LOCATIONS[i], destination: LOCATIONS[j] };
}

function buildPayload(opts) {
  const { authToken, riderId, deviceId = uuid4(), origin, destination, clientTs = Date.now() / 1000 } = opts;
  const { origin: o, destination: d } = origin && destination ? { origin, destination } : pickOriginDestination();
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
      client_state: { charging: false, battery_level: -1, client_ts: clientTs },
    },
    prescheduled_recurring_series_details: {
      origin: { geocoded_addr: o.geocoded_addr, full_geocoded_addr: o.full_geocoded_addr, latlng: { lat: o.lat, lng: o.lng } },
      n_passengers: 4,
      destination: { geocoded_addr: d.geocoded_addr, full_geocoded_addr: d.full_geocoded_addr, latlng: { lat: d.lat, lng: d.lng } },
      recurring_series_type: "OT",
    },
    supported_features: SUPPORTED_FEATURES,
    whos_asking: { acct_type: 0, id: riderId, auth_token: authToken },
    prescheduled_recurring_series_id: 0,
    mp_session_id: Number(randomBigInt()),
    prescheduled_recurring_series_ride_details: { display_time: [] },
    rider_service_flag: 0,
    end_date_timestamp: clientTs,
    city_id: 783,
  };
}

function buildHeaders(body, opts) {
  const { authToken, deviceId, rbzid = null, cookie = null } = opts;
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
  const res = await fetch(VALIDATE_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, body: json, raw: text };
}

/**
 * Send one or more spoofed validate requests.
 * @param {Object} opts
 * @param {string} opts.authToken - Required.
 * @param {number} opts.riderId - Required.
 * @param {string} [opts.deviceId]
 * @param {string} [opts.rbzid]
 * @param {string} [opts.cookie]
 * @param {{ geocoded_addr: string, full_geocoded_addr: string, lat: number, lng: number }} [opts.origin]
 * @param {{ geocoded_addr: string, full_geocoded_addr: string, lat: number, lng: number }} [opts.destination]
 * @param {number} [opts.count=1]
 * @param {number} [opts.intervalMs=0]
 * @param {number} [opts.concurrent] - If set, send this many requests in parallel (ignores count/intervalMs).
 * @param {string} [opts.dumpDir] - If set, write response_<timestamp>_<n>.json here.
 * @param {function(number, number, object, { origin: string, destination: string })} [opts.onProgress] - Called after each request: (index, total, result, locations).
 * @param {boolean} [opts.randomizeLocations] - If true, pick random origin/destination from LOCATIONS per request (ignores origin/destination).
 * @returns {Promise<Array<{ status: number, ok: boolean, body: object|null, raw: string }>>}
 */
async function sendValidate(opts) {
  const {
    authToken,
    riderId,
    deviceId = uuid4(),
    rbzid = null,
    cookie = null,
    origin = null,
    destination = null,
    count = 1,
    intervalMs = 0,
    concurrent = null,
    dumpDir = null,
    onProgress = null,
    randomizeLocations = false,
  } = opts;

  if (!authToken || riderId == null) throw new Error("sendValidate requires authToken and riderId");

  const getOriginDestination = () =>
    randomizeLocations ? pickRandomOriginDestination() : (origin && destination ? { origin, destination } : pickOriginDestination());

  if (concurrent != null && concurrent > 0) {
    const n = Math.max(1, concurrent);
    const baseTs = Date.now() / 1000;
    const promises = Array.from({ length: n }, async (_, i) => {
      const clientTs = baseTs + i * 0.001;
      const { origin: o, destination: d } = getOriginDestination();
      const payload = buildPayload({ authToken, riderId, deviceId, origin: o, destination: d, clientTs });
      const headers = buildHeaders(payload, { authToken, deviceId, rbzid, cookie });
      const result = await postValidate(payload, headers);
      if (onProgress) onProgress(i + 1, n, result, { origin: o.geocoded_addr, destination: d.geocoded_addr });
      return result;
    });
    const results = await Promise.all(promises);
    if (dumpDir) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      results.forEach((result, i) => {
        const name = `response_${ts}_${i + 1}.json`;
        fs.writeFileSync(path.join(dumpDir, name), JSON.stringify({ timestamp_utc: new Date().toISOString(), request_index: i + 1, ...result }, null, 2), "utf8");
      });
    }
    return results;
  }

  const n = Math.max(1, count);
  const results = [];

  for (let i = 0; i < n; i++) {
    const clientTs = Date.now() / 1000;
    const { origin: o, destination: d } = getOriginDestination();
    const payload = buildPayload({ authToken, riderId, deviceId, origin: o, destination: d, clientTs });
    const headers = buildHeaders(payload, { authToken, deviceId, rbzid, cookie });
    const result = await postValidate(payload, headers);
    results.push(result);
    if (onProgress) onProgress(i + 1, n, result, { origin: o.geocoded_addr, destination: d.geocoded_addr });

    if (dumpDir) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const name = `response_${ts}_${i + 1}.json`;
      fs.writeFileSync(path.join(dumpDir, name), JSON.stringify({ timestamp_utc: new Date().toISOString(), request_index: i + 1, ...result }, null, 2), "utf8");
    }

    if (i < n - 1 && intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
  }

  return results;
}

module.exports = { sendValidate };

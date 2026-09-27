#!/usr/bin/env node
// 45c-fetch-moth-bits.mjs — task 45-c order-whitening entropy fetch.
//
// Fetches FRESH raw bits from the moth quantum service (coin-toss-v1) to seed
// the 42-b whitening recipe (45c-mothbits.mjs) for the 96-claim presentation
// order. Key: env MOTH_KEY (never printed, never written to any file).
//
// Discipline: ONE submit + poll cycle, time-boxed (default 100s wall). On any
// failure exits 3 and the runner falls back (fixture bits / crypto bytes),
// receipted honestly. The raw bits are written to the receipts dir; the bits
// are NOT secret and the file contains NO key material.
//
// Usage: node worker/scripts/45c-fetch-moth-bits.mjs <outBitsFile> <outReceiptJson> [wallSeconds]
//   stdlib only.

import * as fs from "node:fs";
import * as path from "node:path";

const outBits = process.argv[2];
const outReceipt = process.argv[3];
const wallMs = (Number(process.argv[4]) || 100) * 1000;
if (!outBits || !outReceipt) {
  console.error("usage: 45c-fetch-moth-bits.mjs <outBitsFile> <outReceiptJson> [wallSeconds]");
  process.exit(2);
}
const key = process.env.MOTH_KEY;
if (!key) {
  console.error("45c-moth: MOTH_KEY not set — fail-closed exit 3 (runner falls back, receipted)");
  process.exit(3);
}

const API = "https://api.mothquantum.com/api/v1";
const SHOTS = 2048; // raw coin bits; VN debias keeps ~25%, ~512 bits -> plenty for the FY stream (which is SHA-256-extended anyway)
const t0 = Date.now();

async function call(method, p, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(5000, wallMs - (Date.now() - t0)));
  try {
    const res = await fetch(API + p, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 400) }; }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: { error: String((e && e.message) || e) } };
  } finally {
    clearTimeout(timer);
  }
}

const receipt = {
  run: "45c order-whitening entropy fetch",
  engine: "coin-toss-v1",
  mode: "qpu",
  shots: SHOTS,
  started_at: new Date().toISOString(),
  wall_budget_seconds: wallMs / 1000,
  steps: [],
};

let jobId = null;
// 1. submit
{
  const r = await call("POST", "/engines/coin-toss-v1/process", { params: { mode: "qpu", shots: SHOTS } });
  receipt.steps.push({ step: "submit", status: r.status, at: new Date().toISOString() });
  const jid = r.data && (r.data.job_id || r.data.id || (r.data.result && r.data.result.job_id));
  if (r.status !== 200 && r.status !== 201) {
    receipt.error = `submit failed status=${r.status} body=${JSON.stringify(r.data).slice(0, 300)}`;
    fs.writeFileSync(outReceipt, JSON.stringify(receipt, null, 2) + "\n");
    console.error(`45c-moth: submit failed — ${receipt.error}`);
    process.exit(3);
  }
  jobId = jid || null;
}
// 2. poll (job-based API; some engines return the result synchronously — handle both)
let result = null;
for (let i = 0; Date.now() - t0 < wallMs; i++) {
  const r = await call("GET", jobId ? `/process/${jobId}` : "/process");
  if (r.status === 200 && r.data) {
    const d = r.data;
    if (d.status === "completed" || d.state === "completed" || d.result || d.outputs) {
      result = d.result || d.outputs || d;
      receipt.steps.push({ step: "poll", polls: i + 1, at: new Date().toISOString() });
      break;
    }
  }
  receipt.steps.push({ step: "poll-wait", i, status: r.status, at: new Date().toISOString() });
  await new Promise((res) => setTimeout(res, 3000));
}
if (!result) {
  receipt.error = `no completed result within ${wallMs / 1000}s (jobId=${jobId})`;
  fs.writeFileSync(outReceipt, JSON.stringify(receipt, null, 2) + "\n");
  console.error("45c-moth: no result in budget — fail-closed exit 3 (runner falls back, receipted)");
  process.exit(3);
}
// 3. extract bits — accept the several shapes the service has used
let bits = null, shape = null;
const pick = (o) => {
  if (!o) return null;
  if (typeof o === "string" && /^[01]+$/.test(o)) return o;
  if (Array.isArray(o) && o.every((x) => x === 0 || x === 1)) return o.join("");
  if (Array.isArray(o) && o.every((x) => typeof x === "number")) {
    // integer results: bit = v & 1
    return o.map((v) => String(v & 1)).join("");
  }
  if (o.bits) return pick(o.bits);
  if (o.outcomes) return pick(o.outcomes);
  if (o.results) return pick(o.results);
  return null;
};
for (const [k, v] of Object.entries(result)) {
  const b = pick(v);
  if (b) { bits = b; shape = k; break; }
}
if (!bits || bits.length < 256) {
  receipt.error = `could not extract >=256 bits from result keys=${Object.keys(result).join(",")}`;
  fs.writeFileSync(outReceipt, JSON.stringify(receipt, null, 2) + "\n");
  console.error("45c-moth: bit extraction failed — fail-closed exit 3 (runner falls back, receipted)");
  process.exit(3);
}
fs.mkdirSync(path.dirname(path.resolve(outBits)), { recursive: true });
fs.writeFileSync(outBits, bits + "\n");
receipt.finished_at = new Date().toISOString();
receipt.bits_len = bits.length;
receipt.result_shape = shape;
receipt.jobId = jobId;
fs.writeFileSync(outReceipt, JSON.stringify(receipt, null, 2) + "\n");
console.log(`45c-moth: OK ${bits.length} bits (shape=${shape}) -> ${outBits}`);

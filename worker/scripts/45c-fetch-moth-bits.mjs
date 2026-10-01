#!/usr/bin/env node
// 45c-fetch-moth-bits.mjs — task 45-c order-whitening entropy fetch.
//
// Fetches FRESH random bytes from the moth quantum service (comet-qrng-v1: Born-rule
// measurements on IBM hardware, SP 800-90B certificate + Toeplitz extractor) to seed
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
const OUTPUT_BYTES = 64; // comet-qrng-v1: Born-rule bytes off IBM hardware, Toeplitz-extracted; num_qubits=12 x shots=256 keeps the counts-only log2(shots!) ordering subtraction below the raw budget
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
  engine: "comet-qrng-v1",
  mode: "qpu",
  output_bytes: 512,
  started_at: new Date().toISOString(),
  wall_budget_seconds: wallMs / 1000,
  steps: [],
};

let jobId = null;
// 1. submit
{
  const r = await call("POST", "/engines/comet-qrng-v1/process", { params: { mode: "qpu", num_qubits: 12, shots: 256, output_bytes: 64 } });
  receipt.steps.push({ step: "submit", status: r.status, at: new Date().toISOString() });
  const jid = r.data && (r.data.job_id || r.data.id || (r.data.result && r.data.result.job_id));
  if ((r.status !== 200 && r.status !== 201 && r.status !== 202) || !jid) {
    receipt.error = `submit failed status=${r.status} body=${JSON.stringify(r.data).slice(0, 300)}`;
    fs.writeFileSync(outReceipt, JSON.stringify(receipt, null, 2) + "\n");
    console.error(`45c-moth: submit failed — ${receipt.error}`);
    process.exit(3);
  }
  jobId = jid || null;
}
// 2. poll /jobs/{id}/status until completed, then /jobs/{id}/result
let result = null;
for (let i = 0; Date.now() - t0 < wallMs; i++) {
  await new Promise((res) => setTimeout(res, i === 0 ? 1000 : 3000));
  const s = await call("GET", `/jobs/${jobId}/status`);
  const st = s.data && s.data.status;
  if (st === "failed" || st === "cancelled") {
    receipt.error = `job ${jobId} ${st}`;
    fs.writeFileSync(outReceipt, JSON.stringify(receipt, null, 2) + "\n");
    console.error(`45c-moth: job ${st} — fail-closed exit 3 (runner falls back, receipted)`);
    process.exit(3);
  }
  if (st !== "completed") {
    receipt.steps.push({ step: "poll-wait", i, status: st, at: new Date().toISOString() });
    continue;
  }
  const r = await call("GET", `/jobs/${jobId}/result`);
  result = (r.data && (r.data.result !== undefined ? r.data.result : r.data)) || null;
  receipt.steps.push({ step: "poll", polls: i + 1, at: new Date().toISOString() });
  break;
}
if (!result) {
  receipt.error = `no completed result within ${wallMs / 1000}s (jobId=${jobId})`;
  fs.writeFileSync(outReceipt, JSON.stringify(receipt, null, 2) + "\n");
  console.error("45c-moth: no result in budget — fail-closed exit 3 (runner falls back, receipted)");
  process.exit(3);
}
// 3. extract bytes — comet-qrng returns output.random.hex (Toeplitz-extracted).
// ONLY the documented randomness leaf is acceptable entropy — commitment/
// salt/circuit_hash fields are provenance digests and must never be mistaken
// for randomness (a sha256 digest is uniform-looking but is NOT chamber entropy).
const direct = result && result.output && result.output.random && result.output.random.hex;
let bytesHex = null, shape = null;
if (typeof direct === "string" && /^[0-9a-f]{64,}$/.test(direct)) { bytesHex = direct; shape = "output.random.hex"; }
if (!bytesHex) {
  const r = (result && result.output && result.output.random) || {};
  const keys = Object.keys(result).join(",");
  receipt.error = `no usable output.random.hex (keys=${keys}, random.bytes=${r.bytes}, requested=${r.requested_bytes})`;
  receipt.jobId = jobId;
  fs.writeFileSync(outReceipt, JSON.stringify(receipt, null, 2) + "\n");
  console.error("45c-moth: byte extraction failed — fail-closed exit 3 (runner falls back, receipted)");
  process.exit(3);
}
let bits = "";
for (const byte of Buffer.from(bytesHex, "hex")) bits += byte.toString(2).padStart(8, "0"); // MSB-first, the recipe input convention
fs.mkdirSync(path.dirname(path.resolve(outBits)), { recursive: true });
fs.writeFileSync(outBits, bits + "\n");
receipt.finished_at = new Date().toISOString();
receipt.bits_len = bits.length;
receipt.bytes_hex_sha256 = (await import("node:crypto")).createHash("sha256").update(bytesHex).digest("hex");
receipt.result_shape = shape;
receipt.jobId = jobId;
fs.writeFileSync(outReceipt, JSON.stringify(receipt, null, 2) + "\n");
console.log(`45c-moth: OK ${bits.length} bits (shape=${shape}) -> ${outBits}`);

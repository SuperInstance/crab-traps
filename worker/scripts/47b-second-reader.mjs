#!/usr/bin/env node
// 47b-second-reader.mjs — lane 47-b "two-reader rule", the SECOND reader.
//
// Independently walks the SAME 8 chains the fleet's wave-46 witness rollout
// verified (fleet-seeds playtest/wave46/witness-rollout), compares computed
// tips / binding facts against the wave-46 RECEIPTED pins, and emits a
// two-reader receipt whose every row carries the walker identity
// 'crab-traps-second-reader'. Exits 0 iff every chain agrees and the receipt
// chain self-verifies under this reader's OWN witness-grammar implementation.
//
// INDEPENDENCE: the walker (worker/src/arena-scenarios-003-two-reader-walker.mjs)
// was written from the stone-v1 law + witness grammar TEXT; no fleet walker
// code imported or copied. Pins are DATA reused verbatim from the fleet's
// receipted pin table (worker/src/arena-scenarios-003-two-reader-pins.mjs).
//
// Modes:
//   default        LIVE — remote pins fetched from raw.githubusercontent at the
//                  pinned commit; FIXTURE bytes read from --fleet-root checkout.
//   --offline      replay — every byte read from --fetched-root (bytes a prior
//                  live run committed under worker/src/receipts/47b/fetched/).
//   --no-save      live run does NOT write fetched bytes (default: writes them
//                  so the whole run replays offline from crab-traps alone).
//   --sabotage <id>:<tamper-byte|tamper-predictions|wrong-pin>  TEST-ONLY
//                  negative-control hook; applied in memory, recorded in the
//                  receipt, forces exit 1.
//
// STDLIB ONLY (node:crypto, node:fs, node:path, node:child_process). Keys: none.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SECOND_READER_ID, sha256Hex, sha256Utf8, digestOf, cjson,
  walkStoneText, walkWitnessText, walkArtifactBinding, walkFixtureManifest,
  witnessCheckFields, witnessId, walkWitnessReceipts,
} from '../src/arena-scenarios-003-two-reader-walker.mjs';
import { PIN_TABLE, FLEET_REFERENCE } from '../src/arena-scenarios-003-two-reader-pins.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_FETCHED = join(REPO, 'worker', 'src', 'receipts', '47b', 'fetched');
const DEFAULT_OUT = join(REPO, 'worker', 'src', 'receipts', '47b', '47b-two-reader-receipt.json');
const CLAIMS_PATH = 'worker/src/arena-scenarios-003-two-reader-claims.json';

// ── args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = { offline: false, save: true, fleetRoot: null, fetchedRoot: DEFAULT_FETCHED, out: DEFAULT_OUT, sabotage: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--offline') opt.offline = true;
  else if (a === '--no-save') opt.save = false;
  else if (a === '--fleet-root') opt.fleetRoot = resolve(args[++i]);
  else if (a === '--fetched-root') opt.fetchedRoot = resolve(args[++i]);
  else if (a === '--out') opt.out = resolve(args[++i]);
  else if (a === '--sabotage') opt.sabotage = args[++i];
  else if (a === '--help') { console.log('usage: node 47b-second-reader.mjs [--fleet-root DIR] [--offline] [--no-save] [--fetched-root DIR] [--out FILE] [--sabotage id:tamper-byte|tamper-predictions|wrong-pin]'); process.exit(0); }
  else { console.error(`unknown arg: ${a}`); process.exit(2); }
}
const live = !opt.offline;
if (live && !opt.fleetRoot) {
  console.error('--fleet-root is required in live mode (fleet-seeds checkout, READ-ONLY, for fixture bytes)');
  process.exit(2);
}
const FLEET_FETCHED = opt.fleetRoot ? join(opt.fleetRoot, 'playtest', 'wave46', 'witness-rollout', 'receipts', 'fetched') : null;
const fleetCommittedPath = (id, name) => {
  if (!FLEET_FETCHED) return null;
  const p = join(FLEET_FETCHED, id, name);
  return existsSync(p) ? p : null;
};
const bySha = (p) => (p ? sha256Hex(readFileSync(p)) : null);

// ── sabotage (test-only hook) ──────────────────────────────────────────────
function tamperHexChar(buf) {
  const marker = Buffer.from('"row_hash":"');
  let at = buf.indexOf(marker);
  at = at >= 0 ? at + marker.length : Math.floor(buf.length / 2);
  buf[at] = buf[at] === 0x61 ? 0x62 : 0x61; // 'a' <-> 'b'
  return buf;
}
function sabotageWanted(id, mode) {
  if (!opt.sabotage) return false;
  const [sid, smode] = opt.sabotage.split(':');
  return sid === id && (mode === undefined || smode === mode);
}
const flipHalf = (bytes) => { const b = Buffer.from(bytes); const at = Math.floor(b.length / 2); b[at] = b[at] === 0x61 ? 0x62 : 0x61; return b; };

// ── byte providers ─────────────────────────────────────────────────────────
async function fetchPinned(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { 'user-agent': `crab-traps worker/scripts/47b-second-reader.mjs (47-b two-reader, walker=${SECOND_READER_ID})` },
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { status: res.status, bytes };
}
const offlinePathFor = (id, name) => join(opt.fetchedRoot, id, name);
function readOffline(id, name) {
  const p = offlinePathFor(id, name);
  if (!existsSync(p)) throw new Error(`offline byte missing: ${p} (run LIVE first or pass the committed receipts/47b/fetched)`);
  return readFileSync(p);
}
function gitBlobAt(commit, repoPath) {
  if (!opt.fleetRoot) return null; // offline replay: blob check only meaningful live
  try {
    return execFileSync('git', ['-C', opt.fleetRoot, 'rev-parse', `${commit}:${repoPath}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null; // git unavailable — recorded as null; byte sha still binds
  }
}

// ── helpers ────────────────────────────────────────────────────────────────
function inputsManifest(pairs) {
  // pairs: [[path, sha256]] — receipted manifest convention, sorted by path
  const text = [...pairs].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([p, s]) => `${p} ${s}\n`).join('');
  return sha256Utf8(text);
}
const eq = (a, b) => cjson(a) === cjson(b); // canonical deep-equal over JSON data
const hexOrFail = (v, fallbackLabel) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : sha256Utf8(fallbackLabel));

const fetchedStore = []; // { id, name, bytes } — written to fetched-root after a live run

// ── walkers per pin kind (pure on injected bytes) ──────────────────────────
function stoneChainResult(pin, bytes) {
  let walk;
  try { walk = walkStoneText(bytes.toString('utf8')); }
  catch (e) { walk = { ok: false, links: null, tip: null, why: `stone walk failed: ${e.message}` }; }
  const bytesOk = sha256Hex(bytes) === pin.bytes_sha256;
  const tipOk = walk.ok && walk.tip === pin.expect_tip;
  const linksOk = walk.links === pin.expect_links;
  const agree = walk.ok && bytesOk && tipOk && linksOk;
  const why = agree ? null
    : !bytesOk ? `bytes sha ${sha256Hex(bytes).slice(0, 12)}… != pinned ${pin.bytes_sha256.slice(0, 12)}…`
    : !walk.ok ? walk.why
    : !tipOk ? `tip ${String(walk.tip).slice(0, 12)}… != pinned ${pin.expect_tip.slice(0, 12)}…`
    : `links ${walk.links} != pinned ${pin.expect_links}`;
  return { computed: { ok: walk.ok, tip: walk.tip ?? null, links: walk.links ?? null }, agree, why, bytes_sha256: sha256Hex(bytes) };
}

function witnessChainResult(pin, bytes) {
  let walk;
  try { walk = walkWitnessText(bytes.toString('utf8'), { expectTip: pin.expect_tip }); }
  catch (e) { walk = { ok: false, receipts: 0, tip: null, why: `witness walk failed: ${e.message}` }; }
  const bytesOk = sha256Hex(bytes) === pin.bytes_sha256;
  const countOk = walk.receipts === pin.expect_receipts;
  const agree = walk.ok && bytesOk && countOk;
  const why = agree ? null
    : !bytesOk ? `bytes sha ${sha256Hex(bytes).slice(0, 12)}… != pinned ${pin.bytes_sha256.slice(0, 12)}…`
    : !walk.ok ? walk.why
    : `receipts ${walk.receipts} != pinned ${pin.expect_receipts}`;
  return { computed: { ok: walk.ok, tip: walk.tip ?? null, links: walk.receipts ?? null }, agree, why, bytes_sha256: sha256Hex(bytes) };
}

function bindingResult(pin, artifactBytes, predictionsBytes) {
  const r = walkArtifactBinding({
    artifactBytes, predictionsBytes,
    pinArtifactSha: pin.artifact_sha256, pinPredictionsSha: pin.predictions_sha256,
  });
  const factsAgree = eq(r.detail, pin.fleet_receipted_detail);
  // digest reproduction evidence: our canonicalJSON fed the FLEET walker's
  // identity must reproduce the fleet's receipted output digest
  const repro = digestOf({ id: pin.id, ...r.detail, walker: '46e-witness-roller' });
  const output = digestOf({ id: pin.id, ...r.detail, walker: SECOND_READER_ID });
  return {
    computed: { ok: r.ok, tip: output, links: null, detail: r.detail },
    agree: r.ok && factsAgree,
    why: r.ok ? (factsAgree ? null : 'binding detail differs from the fleet receipted detail') : r.why,
    factsAgree,
    digestReproduction: { reproduced: repro === pin.fleet_receipted_output_digest, fleet_digest: pin.fleet_receipted_output_digest },
    bytes_sha256: sha256Hex(artifactBytes),
    output_sha256: output,
  };
}

function fixturesResult(pin, filesWithBytes) {
  const r = walkFixtureManifest({ files: filesWithBytes.map((f) => ({ path: f.path, bytes: f.bytes, pinSha: f.pinSha })) });
  const pinned = filesWithBytes
    .map((f) => ({ path: f.path, sha256: f.pinSha, sizeBytes: f.bytes.length }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const pinsAgree = eq(r.entries, pinned);
  const repro = digestOf({ id: pin.id, entries: r.entries, walker: '46e-witness-roller' });
  const output = digestOf({ id: pin.id, entries: r.entries, walker: SECOND_READER_ID });
  return {
    computed: { ok: r.ok, tip: output, links: null, entries: r.entries, manifest_sha256: r.manifest_sha256 },
    agree: r.ok && pinsAgree,
    why: r.ok ? (pinsAgree ? null : 'manifest entries differ from pinned shas') : r.why,
    factsAgree: pinsAgree,
    digestReproduction: { reproduced: repro === pin.fleet_receipted_output_digest, fleet_digest: pin.fleet_receipted_output_digest },
    output_sha256: output,
  };
}

// ── main ───────────────────────────────────────────────────────────────────
const runAt = new Date().toISOString();
const claimsBytes = readFileSync(join(REPO, CLAIMS_PATH));
const claimsSha = sha256Hex(claimsBytes);

const chains = [];
let disagreements = 0;

for (const pin of PIN_TABLE) {
  const entry = {
    id: pin.id, kind: pin.kind, label: pin.label, walker_note: SECOND_READER_ID,
    source: null, fetched: null, pin: {}, computed: null, agree: false, why: null,
  };
  let inputsSha = null; let outputSha = null;
  try {
    if (pin.kind === 'stone-v1' || pin.kind === 'witness-chain') {
      let bytes; let src; let mode;
      if (live) {
        if (pin.label === 'LIVE') {
          const r = await fetchPinned(pin.raw_url);
          if (r.status !== 200) throw new Error(`fetch ${pin.raw_url} -> HTTP ${r.status}`);
          bytes = r.bytes; src = `LIVE:${pin.raw_url}`; mode = 'LIVE';
        } else {
          const p = join(opt.fleetRoot, pin.fleet_path);
          if (!existsSync(p)) throw new Error(`fixture missing: ${p}`);
          bytes = readFileSync(p); src = `FIXTURE:${p}`; mode = 'FIXTURE';
        }
      } else {
        const name = pin.fetched_name ?? pin.fleet_path.split('/').pop();
        bytes = readOffline(pin.id, name);
        src = `OFFLINE:${offlinePathFor(pin.id, name)}`; mode = 'OFFLINE';
      }
      if (sabotageWanted(pin.id, 'tamper-byte')) bytes = tamperHexChar(Buffer.from(bytes));
      let expectTip = pin.expect_tip;
      if (sabotageWanted(pin.id, 'wrong-pin')) expectTip = 'f'.repeat(64);
      const res = pin.kind === 'stone-v1'
        ? stoneChainResult({ ...pin, expect_tip: expectTip }, bytes)
        : witnessChainResult({ ...pin, expect_tip: expectTip }, bytes);
      const blobAtFleetPin = pin.git_blob ? gitBlobAt(pin.pinned_at_fleet_commit ?? FLEET_REFERENCE.reference_commit, pin.fleet_path) : null;
      const blobAtReference = pin.git_blob ? gitBlobAt(FLEET_REFERENCE.reference_commit, pin.fleet_path) : null;
      const fleetName = pin.fetched_name ?? pin.fleet_path.split('/').pop();
      const fleetBytesSha = bySha(fleetCommittedPath(pin.id, fleetName));
      const crossBytes = fleetBytesSha === null ? null : fleetBytesSha === sha256Hex(bytes);
      entry.source = src;
      entry.pin = { bytes_sha256: pin.bytes_sha256, expect_tip: pin.expect_tip, expect_links: pin.expect_links ?? pin.expect_receipts ?? null, git_blob: pin.git_blob ?? null, pinned_at_fleet_commit: pin.pinned_at_fleet_commit ?? null };
      entry.fetched = { bytes_sha256: res.bytes_sha256, size_bytes: bytes.length, git_blob_computed: { at_fleet_pin: blobAtFleetPin, at_reference_commit: blobAtReference }, git_blob_matches_pin: pin.git_blob ? (blobAtFleetPin === pin.git_blob && blobAtReference === pin.git_blob) : null, fleet_committed_bytes_equal: crossBytes, mode };
      entry.computed = { ...res.computed, output_sha256: res.computed.tip, walker_note: SECOND_READER_ID };
      entry.agree = res.agree;
      entry.why = res.why;
      inputsSha = res.bytes_sha256;
      outputSha = res.computed.tip;
      fetchedStore.push({ id: pin.id, name: fleetName, bytes: Buffer.from(bytes) });
    } else if (pin.kind === 'artifact+pre-registration-binding') {
      let artifactBytes; let predictionsBytes; let src; let mode;
      if (live) {
        const ra = await fetchPinned(pin.artifact_raw_url);
        const rp = await fetchPinned(pin.predictions_raw_url);
        if (ra.status !== 200) throw new Error(`fetch ${pin.artifact_raw_url} -> HTTP ${ra.status}`);
        if (rp.status !== 200) throw new Error(`fetch ${pin.predictions_raw_url} -> HTTP ${rp.status}`);
        artifactBytes = ra.bytes; predictionsBytes = rp.bytes;
        src = `LIVE:${pin.artifact_raw_url}`; mode = 'LIVE';
      } else {
        artifactBytes = readOffline(pin.id, pin.artifact_fetched_name);
        predictionsBytes = readOffline(pin.id, pin.predictions_fetched_name);
        src = `OFFLINE:${offlinePathFor(pin.id, pin.artifact_fetched_name)}`; mode = 'OFFLINE';
      }
      if (sabotageWanted(pin.id, 'tamper-byte')) artifactBytes = flipHalf(artifactBytes);
      if (sabotageWanted(pin.id, 'tamper-predictions')) predictionsBytes = flipHalf(predictionsBytes);
      const res = bindingResult(pin, artifactBytes, predictionsBytes);
      const fleetASha = bySha(fleetCommittedPath(pin.id, pin.artifact_fetched_name));
      const fleetPSha = bySha(fleetCommittedPath(pin.id, pin.predictions_fetched_name));
      const crossBytes = fleetASha === null || fleetPSha === null
        ? null
        : (fleetASha === sha256Hex(artifactBytes) && fleetPSha === sha256Hex(predictionsBytes));
      entry.source = src;
      entry.pin = { artifact_sha256: pin.artifact_sha256, predictions_sha256: pin.predictions_sha256, fleet_receipted_output_digest: pin.fleet_receipted_output_digest };
      entry.fetched = { bytes_sha256: res.bytes_sha256, predictions_bytes_sha256: sha256Hex(predictionsBytes), artifact_size_bytes: artifactBytes.length, predictions_size_bytes: predictionsBytes.length, fleet_committed_bytes_equal: crossBytes, mode };
      entry.computed = { ...res.computed, walker_note: SECOND_READER_ID };
      entry.agree = res.agree;
      entry.why = res.why;
      entry.facts_agree = res.factsAgree;
      entry.digest_reproduction = res.digestReproduction;
      inputsSha = inputsManifest([[pin.artifact_path, sha256Hex(artifactBytes)], [pin.predictions_path, sha256Hex(predictionsBytes)]]);
      outputSha = res.output_sha256;
      fetchedStore.push({ id: pin.id, name: pin.artifact_fetched_name, bytes: Buffer.from(artifactBytes) });
      fetchedStore.push({ id: pin.id, name: pin.predictions_fetched_name, bytes: Buffer.from(predictionsBytes) });
    } else if (pin.kind === 'fixture-manifest') {
      const files = [];
      for (const f of pin.files) {
        let bytes;
        if (live) {
          const p = join(opt.fleetRoot, f.path);
          if (!existsSync(p)) throw new Error(`fixture missing: ${p}`);
          bytes = readFileSync(p);
        } else {
          bytes = readOffline(pin.id, f.fetched_name);
        }
        if (sabotageWanted(pin.id, 'tamper-byte')) bytes = flipHalf(bytes);
        files.push({ path: f.path, bytes, pinSha: f.sha256 });
        fetchedStore.push({ id: pin.id, name: f.fetched_name, bytes: Buffer.from(bytes) });
      }
      const res = fixturesResult(pin, files);
      const mode = live ? pin.label : 'OFFLINE';
      const crossPerFile = files.map((f) => {
        const s = bySha(fleetCommittedPath(pin.id, f.path.split('/').pop()));
        return s === null ? { path: f.path, fleet_committed_bytes_equal: null } : { path: f.path, fleet_committed_bytes_equal: s === sha256Hex(f.bytes) };
      });
      const crossCompared = crossPerFile.filter((x) => x.fleet_committed_bytes_equal !== null);
      const crossBytes = crossCompared.length === 0 ? null : crossCompared.every((x) => x.fleet_committed_bytes_equal === true);
      entry.source = live ? `FIXTURE:${opt.fleetRoot} (tools/fixtures)` : `OFFLINE:${offlinePathFor(pin.id, pin.files[0].fetched_name)} (+${pin.files.length - 1} more)`;
      entry.pin = { files: pin.files.map(({ path, sha256, git_blob }) => ({ path, sha256, git_blob })), fleet_receipted_output_digest: pin.fleet_receipted_output_digest };
      entry.fetched = { files: files.map((f) => ({ path: f.path, bytes_sha256: sha256Hex(f.bytes), size_bytes: f.bytes.length })), fleet_committed_bytes_equal: crossBytes, fleet_compared_count: crossCompared.length, cross_per_file: crossPerFile, mode };
      entry.computed = { ...res.computed, walker_note: SECOND_READER_ID };
      entry.agree = res.agree;
      entry.why = res.why;
      entry.facts_agree = res.factsAgree;
      entry.digest_reproduction = res.digestReproduction;
      inputsSha = res.computed.manifest_sha256;
      outputSha = res.output_sha256;
    } else {
      throw new Error(`unknown pin kind: ${pin.kind}`);
    }
  } catch (e) {
    entry.agree = false;
    entry.why = `FAIL-CLOSED: ${e.message}`;
    entry.fetched = { mode: live ? pin.label : 'OFFLINE', error: e.message };
    entry.computed = { ok: false, tip: null, links: null, output_sha256: null, walker_note: SECOND_READER_ID };
  }
  if (!entry.agree) disagreements++;
  entry.inputs_sha256 = hexOrFail(inputsSha, `inputs-unavailable:${pin.id}:${entry.why ?? ''}`);
  entry.output_sha256 = hexOrFail(outputSha, `tip-unavailable:${pin.id}:${entry.why ?? ''}`);
  chains.push(entry);
}

// ── the two-reader receipt itself is a witness chain (own grammar impl) ────
const receiptRows = [];
let parent = 'GENESIS';
for (const c of chains) {
  const row = {
    claim: `two-reader walk of ${c.id} (${c.kind}, ${c.label}): agree=${c.agree} computed_tip=${c.output_sha256} walker=${SECOND_READER_ID}`,
    inputs_sha256: c.inputs_sha256,
    output_sha256: c.output_sha256,
    parent,
    ts: new Date().toISOString(),
  };
  const f = witnessCheckFields(row);
  if (!f.ok) throw new Error(`receipt row failed own grammar pre-write: ${f.why}`);
  parent = witnessId(row);
  receiptRows.push(row);
}
const selfVerify = walkWitnessReceipts(receiptRows, {});

const identityCheck = {
  walker: SECOND_READER_ID,
  rows_checked: receiptRows.length,
  rows_with_identity: receiptRows.filter((r) => r.claim.includes(SECOND_READER_ID)).length,
  entries_checked: chains.length,
  entries_with_identity: chains.filter((c) => c.walker_note === SECOND_READER_ID && c.computed?.walker_note === SECOND_READER_ID).length,
  ok: receiptRows.every((r) => r.claim.includes(SECOND_READER_ID))
    && chains.every((c) => c.walker_note === SECOND_READER_ID && c.computed?.walker_note === SECOND_READER_ID),
};

const allAgree = chains.length === PIN_TABLE.length && chains.every((c) => c.agree === true);
const ok = allAgree && selfVerify.ok === true && identityCheck.ok && disagreements === 0 && !opt.sabotage;

// ── save fetched bytes (live default) so the run replays offline ───────────
if (live && opt.save) {
  for (const f of fetchedStore) {
    const dir = join(opt.fetchedRoot, f.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, f.name), f.bytes);
  }
}

// ── receipt ────────────────────────────────────────────────────────────────
const receipt = {
  tool: 'crab-traps worker/scripts/47b-second-reader.mjs',
  lane: '47-b second-reader (two-reader rule, first installment)',
  walker: SECOND_READER_ID,
  run_at: runAt,
  mode: live ? 'live' : 'offline-replay',
  sabotage: opt.sabotage ? { applied: opt.sabotage, note: 'TEST-ONLY negative control, applied in memory; run forced to disagree + exit non-zero' } : null,
  claims: { file: CLAIMS_PATH, sha256: claimsSha },
  fleet_reference: FLEET_REFERENCE,
  walker_independence: 'walker written from the stone-v1 law + witness grammar text (fleet modules read as spec only); no fleet walker code imported or copied',
  chains,
  agreement_table: chains.map((c) => ({
    id: c.id, kind: c.kind, label: c.label,
    fleet_receipted_tip: c.pin?.expect_tip ?? c.pin?.fleet_receipted_output_digest ?? null,
    computed: c.output_sha256,
    agree: c.agree,
    // binding/manifest kinds: our output digest is identity-specific by design;
    // digest_reproduced = our canonicalJSON fed the FLEET walker identity
    // reproduces the fleet's receipted output digest byte-for-byte
    digest_reproduced: c.digest_reproduction?.reproduced ?? null,
    facts_agree: c.facts_agree ?? null,
  })),
  receipt_chain: { receipts: receiptRows, tip: parent, self_verify: selfVerify },
  identity_check: identityCheck,
  all_agree: allAgree,
  exit_contract: 'exit 0 iff every chain agrees AND the receipt chain self-verifies AND identity check passes; else exit 1',
  ok,
};
mkdirSync(dirname(opt.out), { recursive: true });
writeFileSync(opt.out, JSON.stringify(receipt, null, 2) + '\n');

// ── agreement table (stdout) ───────────────────────────────────────────────
const cut = (s) => (typeof s === 'string' ? s.slice(0, 12) + '…' : String(s));
console.log(`\n47-b SECOND READER — ${live ? 'LIVE' : 'OFFLINE REPLAY'} — walker ${SECOND_READER_ID}`);
console.log('='.repeat(104));
for (const a of receipt.agreement_table) {
  console.log(`${a.agree ? 'AGREE   ' : 'DISAGREE'} ${a.id.padEnd(22)} ${a.kind.padEnd(34)} computed ${cut(a.computed)} vs fleet ${cut(a.fleet_receipted_tip)}`);
}
console.log('='.repeat(104));
console.log(`chains agreed: ${chains.filter((c) => c.agree).length}/${chains.length} | receipt chain self-verify: ${selfVerify.ok ? 'ok' : 'FAILED'} (${selfVerify.receipts} receipts, tip ${parent.slice(0, 12)}…) | identity check: ${identityCheck.ok ? 'ok' : 'FAILED'}`);
if (opt.sabotage) console.log(`SABOTAGE applied (test-only): ${opt.sabotage} — this run MUST exit non-zero`);
console.log(`receipt: ${opt.out}`);
process.exitCode = ok ? 0 : 1;

#!/usr/bin/env node
// 47b-self-test.mjs — lane 47-b "second reader" negative + positive controls.
//
// Walkers are PURE on injected bytes (fleet lesson, kept): every control here
// tampers bytes or pins IN MEMORY — no network, no writes outside the
// receipts directory. CLI-level controls additionally exercise the real
// runner end-to-end in --offline mode against a throwaway fetched-root.
//
// Controls:
//   T1 tamper-stone-byte      e_q10 chain byte flipped        -> DISAGREE
//   T2 wrong-pin-stone        e_q6 pinned tip replaced        -> DISAGREE
//   T3 tamper-witness-receipt KAT receipt byte flipped        -> DISAGREE
//   T4 skip-middle-witness    KAT receipt removed             -> DISAGREE
//   T5 tamper-artifact        45c result bytes flipped        -> DISAGREE
//   T6 tamper-predictions     44a predictions bytes flipped   -> DISAGREE
//   T7 tamper-fixture         moth fixture bytes flipped      -> DISAGREE
//   T8 wrong-pin-pong         pong pinned tip replaced        -> DISAGREE
//   POS positive control      all bytes untampered            -> 8/8 AGREE
//   E1  cli tamper-byte       runner --offline on tampered copy -> exit != 0
//   E2  cli wrong-pin         runner --offline --sabotage=…:wrong-pin -> exit != 0
//   E3  cli clean replay      runner --offline on clean copy  -> exit 0
//
// STDLIB ONLY. Keys: none. Network: none.

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  SECOND_READER_ID, sha256Hex,
  walkStoneText, walkWitnessText, walkArtifactBinding, walkFixtureManifest,
} from '../src/arena-scenarios-003-two-reader-walker.mjs';
import { PIN_TABLE, FLEET_REFERENCE } from '../src/arena-scenarios-003-two-reader-pins.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pin = (id) => { const p = PIN_TABLE.find((x) => x.id === id); if (!p) throw new Error(`no pin ${id}`); return p; };

const args = process.argv.slice(2);
let fleetRoot = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--fleet-root') fleetRoot = resolve(args[++i]);
}
if (!fleetRoot) {
  console.error('--fleet-root is required (fleet-seeds checkout, READ-ONLY, byte source for the controls)');
  process.exit(2);
}

const fleetFetched = (id, name) => {
  const p = join(fleetRoot, 'playtest', 'wave46', 'witness-rollout', 'receipts', 'fetched', id, name);
  if (!existsSync(p)) throw new Error(`fleet committed byte missing: ${p}`);
  return readFileSync(p);
};
const fleetFile = (rel) => readFileSync(join(fleetRoot, rel));
const flipHexAfter = (bytes, marker) => {
  const b = Buffer.from(bytes);
  const m = Buffer.from(marker);
  let at = b.indexOf(m);
  at = at >= 0 ? at + m.length + 3 : Math.floor(b.length / 2); // +3: a few chars into the value
  b[at] = b[at] === 0x61 ? 0x62 : 0x61; // 'a' <-> 'b'
  return b;
};
const flipHalf = (bytes) => { const b = Buffer.from(bytes); const at = Math.floor(b.length / 2); b[at] = b[at] === 0x61 ? 0x62 : 0x61; return b; };

// byte name resolution mirrors the runner
const nameOf = (p) => (p.fetched_name ?? p.fleet_path.split('/').pop());

function stoneAgree(pinRow, bytes) {
  const walk = walkStoneText(bytes.toString('utf8'));
  return walk.ok === true && walk.tip === pinRow.expect_tip && walk.links === pinRow.expect_links && sha256Hex(bytes) === pinRow.bytes_sha256;
}
function witnessAgree(pinRow, bytes, expectTip) {
  const walk = walkWitnessText(bytes.toString('utf8'), { expectTip });
  return walk.ok === true && walk.receipts === pinRow.expect_receipts && sha256Hex(bytes) === pinRow.bytes_sha256;
}

const controls = [];
function record(id, fault, expected, observed, ok) {
  controls.push({ id, fault, expected, observed, ok, walker: SECOND_READER_ID });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(24)} ${fault}`);
}

// ── unit-level controls (injected bytes) ───────────────────────────────────
const eq10 = pin('qthe_e_q10');
const eq6 = pin('qthe_e_q6');
const pong = pin('pong_birth_seal');
const kat = pin('wave44_kat');
const c45 = pin('crabtraps_45c');
const c44 = pin('crabtraps_44a');
const fx = pin('fleetseeds_fixtures');

const bEq10 = fleetFetched('qthe_e_q10', 'e_q10_chain.jsonl');
const bEq6 = fleetFetched('qthe_e_q6', 'e_q6_chain.jsonl');
const bPong = fleetFetched('pong_birth_seal', 'stone-v1.json');
const bKat = fleetFile(kat.fleet_path);
const b45a = fleetFetched('crabtraps_45c', c45.artifact_fetched_name);
const b45p = fleetFetched('crabtraps_45c', c45.predictions_fetched_name);
const b44a = fleetFetched('crabtraps_44a', c44.artifact_fetched_name);
const b44p = fleetFetched('crabtraps_44a', c44.predictions_fetched_name);
const mothFile = fx.files.find((f) => f.path.includes('moth-42b'));
const bMoth = fleetFile(mothFile.path);

// T1 tampered stone chain byte
{
  const tampered = flipHexAfter(bEq10, '"row_hash":"');
  let caught = false; let how = '';
  try {
    caught = !stoneAgree(eq10, tampered);
    how = caught ? 'stone walk or pin comparison rejected the tampered chain' : 'tampered chain still agreed (BAD)';
  } catch (e) { caught = true; how = `walk threw (also fail-closed): ${e.message.slice(0, 60)}`; }
  record('T1', 'e_q10 chain byte flipped', 'DISAGREE', how, caught);
}
// T2 wrong pin on clean stone chain
{
  const wrong = { ...eq6, expect_tip: 'f'.repeat(64) };
  const caught = !stoneAgree(wrong, bEq6);
  record('T2', 'e_q6 pinned tip replaced with wrong value', 'DISAGREE', caught ? 'tip != wrong pin -> disagree' : 'wrong pin still agreed (BAD)', caught);
}
// T3 tampered witness receipt byte
{
  const tampered = flipHexAfter(bKat, '"inputs_sha256":"');
  let caught = false; let how = '';
  try {
    caught = !witnessAgree(kat, tampered, kat.expect_tip);
    how = caught ? 'witness grammar rejected the tampered receipt' : 'tampered KAT still agreed (BAD)';
  } catch (e) { caught = true; how = `parse threw (also fail-closed): ${e.message.slice(0, 60)}`; }
  record('T3', 'wave-44 KAT receipt byte flipped', 'DISAGREE', how, caught);
}
// T4 skipped middle witness receipt
{
  const rows = bKat.toString('utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '').map((l) => JSON.parse(l));
  const skipped = rows.filter((_, i) => i !== 2);
  let caught = false; let how = '';
  try {
    caught = !witnessAgree(kat, Buffer.from(skipped.map((r) => JSON.stringify(r)).join('\n'), 'utf8'), kat.expect_tip);
    how = caught ? 'parent link broken after skip' : 'skipped receipt undetected (BAD)';
  } catch (e) { caught = true; how = `walk threw: ${e.message.slice(0, 60)}`; }
  record('T4', 'middle KAT receipt skipped', 'DISAGREE', how, caught);
}
// T5 tampered artifact bytes
{
  const r = walkArtifactBinding({ artifactBytes: flipHalf(b45a), predictionsBytes: b45p, pinArtifactSha: c45.artifact_sha256, pinPredictionsSha: c45.predictions_sha256 });
  record('T5', '45c result artifact bytes flipped', 'DISAGREE', r.ok ? 'binding still verified (BAD)' : `caught: ${r.why}`, r.ok === false);
}
// T6 tampered predictions bytes
{
  const r = walkArtifactBinding({ artifactBytes: b44a, predictionsBytes: flipHalf(b44p), pinArtifactSha: c44.artifact_sha256, pinPredictionsSha: c44.predictions_sha256 });
  record('T6', '44a predictions bytes flipped', 'DISAGREE', r.ok ? 'binding still verified (BAD)' : `caught: ${r.why}`, r.ok === false);
}
// T7 tampered fixture byte
{
  const files = [
    { path: fx.files[0].path, bytes: fleetFile(fx.files[0].path), pinSha: fx.files[0].sha256 },
    { path: fx.files[1].path, bytes: fleetFile(fx.files[1].path), pinSha: fx.files[1].sha256 },
    { path: fx.files[2].path, bytes: fleetFile(fx.files[2].path), pinSha: fx.files[2].sha256 },
    { path: mothFile.path, bytes: flipHalf(bMoth), pinSha: mothFile.sha256 },
  ];
  const r = walkFixtureManifest({ files });
  record('T7', 'moth-42b fixture byte flipped', 'DISAGREE', r.ok ? 'manifest still verified (BAD)' : `caught: ${r.why.slice(0, 80)}`, r.ok === false);
}
// T8 wrong pin on clean pong chain
{
  const wrong = { ...pong, expect_tip: 'a'.repeat(64) };
  const caught = !stoneAgree(wrong, bPong);
  record('T8', 'pong pinned tip replaced with wrong value', 'DISAGREE', caught ? 'tip != wrong pin -> disagree' : 'wrong pin still agreed (BAD)', caught);
}
// POS positive control: all bytes untampered -> 8/8 agree
{
  const stone = [[eq10, bEq10], [eq6, bEq6], [pong, bPong], [pin('tavern_round11'), fleetFile('tavern/round-11/round11_ledger.jsonl')]]
    .map(([p, b]) => stoneAgree(p, b));
  const wit = witnessAgree(kat, bKat, kat.expect_tip);
  const bind = [
    walkArtifactBinding({ artifactBytes: b45a, predictionsBytes: b45p, pinArtifactSha: c45.artifact_sha256, pinPredictionsSha: c45.predictions_sha256 }).ok,
    walkArtifactBinding({ artifactBytes: b44a, predictionsBytes: b44p, pinArtifactSha: c44.artifact_sha256, pinPredictionsSha: c44.predictions_sha256 }).ok,
  ];
  const man = walkFixtureManifest({
    files: fx.files.map((f) => ({ path: f.path, bytes: fleetFile(f.path), pinSha: f.sha256 })),
  }).ok;
  const all = [...stone, wit, ...bind, man];
  const okCount = all.filter(Boolean).length;
  record('POS', 'all bytes untampered', '8/8 AGREE', `${okCount}/8 agree`, okCount === 8);
}

// ── CLI-level controls (real runner, --offline, throwaway fetched-root) ────
function buildFetchedRoot(tamper) {
  const root = mkdtempSync(join(tmpdir(), '47b-ctrl-'));
  const put = (id, name, bytes) => {
    mkdirSync(join(root, id), { recursive: true });
    writeFileSync(join(root, id, name), bytes);
  };
  put('qthe_e_q10', 'e_q10_chain.jsonl', tamper === 'e_q10' ? flipHexAfter(bEq10, '"row_hash":"') : bEq10);
  put('qthe_e_q6', 'e_q6_chain.jsonl', bEq6);
  put('pong_birth_seal', 'stone-v1.json', bPong);
  put('tavern_round11', 'round11_ledger.jsonl', fleetFile('tavern/round-11/round11_ledger.jsonl'));
  put('wave44_kat', 'chain.jsonl', bKat);
  put('crabtraps_45c', c45.artifact_fetched_name, b45a);
  put('crabtraps_45c', c45.predictions_fetched_name, b45p);
  put('crabtraps_44a', c44.artifact_fetched_name, b44a);
  put('crabtraps_44a', c44.predictions_fetched_name, b44p);
  for (const f of fx.files) put('fleetseeds_fixtures', f.fetched_name, fleetFile(f.path));
  return root;
}
const runner = join(REPO, 'worker', 'scripts', '47b-second-reader.mjs');
function runCli({ fetchedRoot, sabotage, out }) {
  const argv = [runner, '--offline', '--fetched-root', fetchedRoot, '--out', out];
  if (sabotage) argv.push('--sabotage', sabotage);
  return spawnSync(process.execPath, argv, { encoding: 'utf8', timeout: 120000 });
}
const cli = [];
{
  // E1 tampered copy -> exit non-zero, receipt.ok false, e_q10 row disagree
  const root = buildFetchedRoot('e_q10');
  const out = join(root, 'receipt.json');
  const r = runCli({ fetchedRoot: root, out });
  let receiptOk = null; let rowAgree = null;
  try { const j = JSON.parse(readFileSync(out, 'utf8')); receiptOk = j.ok; rowAgree = j.chains.find((c) => c.id === 'qthe_e_q10')?.agree ?? null; } catch { /* receipt unreadable = also a fail */ }
  const okd = r.status !== 0 && receiptOk === false && rowAgree === false;
  cli.push({ id: 'E1', fault: 'runner --offline over tampered e_q10 copy', expect: 'exit != 0, receipt.ok=false, qthe_e_q10 disagree', observed: `exit=${r.status} receipt.ok=${receiptOk} row.agree=${rowAgree}`, ok: okd, walker: SECOND_READER_ID });
  console.log(`${okd ? 'PASS' : 'FAIL'}  E1 (cli)                 ${cli[0].observed}`);
  rmSync(root, { recursive: true, force: true });
}
{
  // E2 wrong pin via in-memory sabotage -> exit non-zero
  const root = buildFetchedRoot(null);
  const out = join(root, 'receipt.json');
  const r = runCli({ fetchedRoot: root, sabotage: 'qthe_e_q6:wrong-pin', out });
  let rowAgree = null; let sab = null;
  try { const j = JSON.parse(readFileSync(out, 'utf8')); rowAgree = j.chains.find((c) => c.id === 'qthe_e_q6')?.agree ?? null; sab = j.sabotage?.applied ?? null; } catch { /* ignore */ }
  const okd = r.status !== 0 && rowAgree === false && sab === 'qthe_e_q6:wrong-pin';
  cli.push({ id: 'E2', fault: 'runner --offline --sabotage qthe_e_q6:wrong-pin', expect: 'exit != 0, qthe_e_q6 disagree, sabotage receipted', observed: `exit=${r.status} row.agree=${rowAgree} sabotage=${sab}`, ok: okd, walker: SECOND_READER_ID });
  console.log(`${okd ? 'PASS' : 'FAIL'}  E2 (cli)                 ${cli[1].observed}`);
  rmSync(root, { recursive: true, force: true });
}
{
  // E3 clean copy -> exit 0 (end-to-end positive through the real runner)
  const root = buildFetchedRoot(null);
  const out = join(root, 'receipt.json');
  const r = runCli({ fetchedRoot: root, out });
  let receiptOk = null; let allAgree = null; let agreed = null;
  try { const j = JSON.parse(readFileSync(out, 'utf8')); receiptOk = j.ok; allAgree = j.all_agree; agreed = j.agreement_table.filter((a) => a.agree).length; } catch { /* ignore */ }
  const okd = r.status === 0 && receiptOk === true && allAgree === true && agreed === 8;
  cli.push({ id: 'E3', fault: 'none (clean offline replay)', expect: 'exit 0, 8/8 agree', observed: `exit=${r.status} receipt.ok=${receiptOk} all_agree=${allAgree} agreed=${agreed}/8`, ok: okd, walker: SECOND_READER_ID });
  console.log(`${okd ? 'PASS' : 'FAIL'}  E3 (cli)                 ${cli[2].observed}`);
  rmSync(root, { recursive: true, force: true });
}

const allOk = controls.every((c) => c.ok) && cli.every((c) => c.ok);
const receipt = {
  tool: 'crab-traps worker/scripts/47b-self-test.mjs',
  lane: '47-b second-reader (two-reader rule, first installment)',
  walker: SECOND_READER_ID,
  run_at: new Date().toISOString(),
  mode: 'offline-injected-bytes + cli-end-to-end',
  fleet_reference: FLEET_REFERENCE,
  byte_source: 'fleet-seeds checkout at --fleet-root (READ-ONLY): playtest/wave46/witness-rollout/receipts/fetched/ + in-repo fixture paths',
  controls,
  cli_controls: cli,
  ok: allOk,
  contract: 'self-test exits 0 iff every negative control is caught AND the positive controls agree',
};
const outPath = join(REPO, 'worker', 'src', 'receipts', '47b', '47b-self-test-receipt.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
console.log('='.repeat(80));
console.log(`self-test: ${controls.filter((c) => c.ok).length}/${controls.length} unit controls + ${cli.filter((c) => c.ok).length}/${cli.length} cli controls -> ${allOk ? 'ALL PASS (fail-closed)' : 'FAILURES PRESENT'}`);
console.log(`receipt: ${outPath}`);
process.exitCode = allOk ? 0 : 1;

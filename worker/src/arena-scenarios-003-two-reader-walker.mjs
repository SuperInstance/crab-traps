// arena-scenarios-003-two-reader-walker.mjs — lane 47-b "second reader".
//
// INDEPENDENT WALKER, WRITTEN FROM THE LAW (no fleet walker code copied):
//   SPEC READ (read-only, as normative text): fleet-seeds tools/lib/stone-v1.mjs
//   (stone-v1 law) and playtest/wave44/witness-grammar/witness.mjs (witness
//   receipt grammar). This module is a fresh crab-traps implementation that
//   shares NO code with either: a second reader must not trust the first
//   reader's engine — or even its helper functions.
//
// LAWS IMPLEMENTED HERE:
//   stone-v1:
//     * row 0 must be kind 'stone.header' carrying alg 'stone-v1';
//     * genesis 'STONE-GENESIS-1' (or the header's own recorded genesis);
//     * row_hash = sha256(UTF8(canonicalJSON([prev, row-without-row_hash])));
//     * canonicalJSON: object keys sorted recursively by Unicode code unit,
//       undefined-valued keys skipped, arrays keep order, scalars by
//       JSON.stringify semantics, zero whitespace;
//     * annotation rows (kind 'stone.*' except 'stone.header') are hashed
//       against the current tip but never advance it;
//     * tip = hash of the last non-annotation row.
//   witness receipts:
//     * receipt = { claim, inputs_sha256, output_sha256, parent, ts } EXACTLY;
//     * id(receipt) = sha256(canonical json of the receipt);
//     * first receipt's parent = 'GENESIS', later parents = previous id;
//     * tip = id of the last receipt.
//
// STDLIB ONLY (node:crypto). Keys: none. Zero network code here — walkers are
// PURE on injected bytes so negative controls tamper without touching a wire.

import { createHash } from 'node:crypto';

export const SECOND_READER_ID = 'crab-traps-second-reader';

export const sha256Hex = (data) =>
  createHash('sha256').update(data).digest('hex');

export const sha256Utf8 = (text) =>
  createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

// ───────────────────────────────────────────────────────────────────────────
// canonical JSON — the hashing alphabet both laws share. Own implementation:
// single recursive emitter, own key collection, own undefined-skip.
// ───────────────────────────────────────────────────────────────────────────
export function cjson(v) {
  if (v === undefined) return 'null'; // arrays/top-level: undefined -> null
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    let out = '';
    for (let i = 0; i < v.length; i++) out += (i ? ',' : '') + cjson(v[i]);
    return '[' + out + ']';
  }
  const names = Object.keys(v)
    .filter((n) => v[n] !== undefined)
    .sort(); // UTF-16 code unit order == the law's Unicode code unit order
  let out = '';
  for (let i = 0; i < names.length; i++) {
    out += (i ? ',' : '') + JSON.stringify(names[i]) + ':' + cjson(v[names[i]]);
  }
  return '{' + out + '}';
}

export const digestOf = (v) => sha256Utf8(cjson(v));

// ───────────────────────────────────────────────────────────────────────────
// stone-v1 walker
// ───────────────────────────────────────────────────────────────────────────

export const STONE_GENESIS = 'STONE-GENESIS-1';

function isStoneAnnotation(row) {
  const kind = row?.kind;
  return typeof kind === 'string' && kind !== 'stone.header' && kind.startsWith('stone.');
}

/** hash of one stone row against its parent hash (row_hash excluded). */
export function stoneRowHash(row, prevHash) {
  const body = {};
  for (const name of Object.keys(row)) {
    if (name === 'row_hash') continue;
    body[name] = row[name];
  }
  return sha256Utf8(cjson([prevHash, body]));
}

/** Walk an ARRAY of stone rows. Returns
 *  { ok, links, tip, badIndex, at, why, genesis }. */
export function walkStoneRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, links: Array.isArray(rows) ? rows.length : 0, tip: null, badIndex: 0, at: null, why: 'chain is empty or not an array' };
  }
  const head = rows[0];
  if (!head || typeof head !== 'object' || Array.isArray(head) || head.kind !== 'stone.header') {
    return { ok: false, links: rows.length, tip: null, badIndex: 0, at: null, why: 'row 0 is not a stone.header' };
  }
  if (head.alg !== 'stone-v1') {
    return { ok: false, links: rows.length, tip: null, badIndex: 0, at: null, why: `header alg '${head.alg}' is not 'stone-v1'` };
  }
  const genesis = typeof head.genesis === 'string' ? head.genesis : STONE_GENESIS;
  let tip = genesis;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      return { ok: false, links: rows.length, tip: i > 0 ? tip : null, badIndex: i, at: r?.seq ?? null, why: `row ${i} is not an object` };
    }
    if (typeof r.row_hash !== 'string') {
      return { ok: false, links: rows.length, tip: i > 0 ? tip : null, badIndex: i, at: r?.seq ?? null, why: `row ${i} has no row_hash` };
    }
    const want = stoneRowHash(r, tip);
    if (want !== r.row_hash) {
      return { ok: false, links: rows.length, tip: i > 0 ? tip : null, badIndex: i, at: r?.seq ?? null, why: `row ${i} hash mismatch (annotation=${isStoneAnnotation(r)})` };
    }
    if (!isStoneAnnotation(r)) tip = r.row_hash; // annotations never advance the tip
  }
  return { ok: true, links: rows.length, tip, badIndex: null, at: null, why: null, genesis };
}

/** Chain text loader: '[' leading => one JSON document holding the rows
 *  array; otherwise JSONL (one row object per non-empty line). Throws on
 *  malformed bytes (a malformed chain IS a failed walk). */
export function parseStoneText(text) {
  const t = text.trimStart();
  if (t.startsWith('[')) return JSON.parse(text);
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    try {
      rows.push(JSON.parse(line));
    } catch (e) {
      throw new Error(`line ${i} is not valid JSON: ${e.message}`);
    }
  }
  return rows;
}

export function walkStoneText(text) {
  return walkStoneRows(parseStoneText(text));
}

// ───────────────────────────────────────────────────────────────────────────
// witness receipt grammar walker
// ───────────────────────────────────────────────────────────────────────────

export const WITNESS_GENESIS = 'GENESIS';
const HEX64 = /^[0-9a-f]{64}$/;
const WITNESS_FIELDS = ['claim', 'inputs_sha256', 'output_sha256', 'parent', 'ts'];

/** canonical form of a receipt: sorted keys, tight separators. */
export function witnessCanon(receipt) {
  const names = Object.keys(receipt).sort();
  let out = '';
  for (let i = 0; i < names.length; i++) {
    out += (i ? ',' : '') + JSON.stringify(names[i]) + ':' + JSON.stringify(receipt[names[i]]);
  }
  return '{' + out + '}';
}

export const witnessId = (receipt) => sha256Utf8(witnessCanon(receipt));

/** exact-field + type validation; returns { ok, why }. */
export function witnessCheckFields(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, why: 'receipt is not an object' };
  const names = Object.keys(r).sort();
  if (names.length !== WITNESS_FIELDS.length || names.some((n, i) => n !== WITNESS_FIELDS[i])) {
    return { ok: false, why: `fields must be exactly ${WITNESS_FIELDS.join(',')} (got ${names.join(',')})` };
  }
  if (typeof r.claim !== 'string' || r.claim.length === 0) return { ok: false, why: 'claim must be a non-empty string' };
  for (const f of ['inputs_sha256', 'output_sha256']) {
    if (typeof r[f] !== 'string' || !HEX64.test(r[f])) return { ok: false, why: `${f} must be 64 lowercase hex chars` };
  }
  if (r.parent !== WITNESS_GENESIS && (typeof r.parent !== 'string' || !HEX64.test(r.parent))) {
    return { ok: false, why: 'parent must be 64 hex chars or "GENESIS"' };
  }
  if (typeof r.ts !== 'string' || r.ts.length === 0 || Number.isNaN(Date.parse(r.ts))) {
    return { ok: false, why: 'ts must be an ISO-8601 parseable string' };
  }
  return { ok: true, why: null };
}

/** Walk an ARRAY of witness receipts. opts.expectTip pins the tip.
 *  Returns { ok, receipts, tip, why }. */
export function walkWitnessReceipts(receipts, opts = {}) {
  if (!Array.isArray(receipts)) return { ok: false, receipts: 0, tip: null, why: 'chain is not an array' };
  if (receipts.length === 0) return { ok: false, receipts: 0, tip: null, why: 'empty chain (fail-closed)' };
  const seen = new Set();
  let prev = WITNESS_GENESIS;
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    const f = witnessCheckFields(r);
    if (!f.ok) return { ok: false, receipts: i, tip: null, why: `receipt ${i}: ${f.why}` };
    const wantParent = i === 0 ? WITNESS_GENESIS : prev;
    if (r.parent !== wantParent) {
      return { ok: false, receipts: i, tip: null, why: `receipt ${i}: parent link broken (want ${String(wantParent).slice(0, 12)}…, got ${String(r.parent).slice(0, 12)}…)` };
    }
    const id = witnessId(r);
    if (seen.has(id)) return { ok: false, receipts: i, tip: null, why: `receipt ${i}: duplicate id ${id.slice(0, 12)}…` };
    seen.add(id);
    prev = id;
  }
  const tip = prev;
  if (opts.expectTip !== undefined && opts.expectTip !== tip) {
    return { ok: false, receipts: receipts.length, tip, why: `tip mismatch (computed ${tip.slice(0, 12)}…, pinned ${String(opts.expectTip).slice(0, 12)}…)` };
  }
  return { ok: true, receipts: receipts.length, tip, why: null };
}

export function parseWitnessJsonl(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t !== '') rows.push(JSON.parse(t));
  }
  return rows;
}

export function walkWitnessText(text, opts = {}) {
  return walkWitnessReceipts(parseWitnessJsonl(text), opts);
}

// ───────────────────────────────────────────────────────────────────────────
// artifact + pre-registration binding walker
// (crab-traps 45-c / 44-a results artifacts vs their predictions files)
// ───────────────────────────────────────────────────────────────────────────

export function walkArtifactBinding({ artifactBytes, predictionsBytes, pinArtifactSha, pinPredictionsSha }) {
  const detail = {
    artifact_sha256: sha256Hex(artifactBytes),
    predictions_sha256: sha256Hex(predictionsBytes),
    embedded_pre_registration_sha256: null,
    artifactShaMatchesPin: false,
    embeddedMatchesPredictions: false,
    embeddedMatchesPin: false,
    hasVerdict: false,
  };
  try {
    const artifact = JSON.parse(artifactBytes.toString('utf8'));
    const embedded = artifact?.pre_registration?.sha256;
    detail.embedded_pre_registration_sha256 = typeof embedded === 'string' ? embedded : null;
    detail.artifactShaMatchesPin = detail.artifact_sha256 === pinArtifactSha;
    detail.embeddedMatchesPredictions = typeof embedded === 'string' && embedded === detail.predictions_sha256;
    detail.embeddedMatchesPin = typeof embedded === 'string' && embedded === pinPredictionsSha;
    detail.hasVerdict = artifact?.verdict !== undefined;
    const ok = detail.artifactShaMatchesPin && detail.embeddedMatchesPredictions && detail.embeddedMatchesPin && detail.hasVerdict;
    const why = ok ? null
      : !detail.artifactShaMatchesPin ? `artifact bytes ${detail.artifact_sha256.slice(0, 12)}… != pinned ${pinArtifactSha.slice(0, 12)}…`
      : !detail.embeddedMatchesPredictions ? `embedded pre_registration.sha256 != fetched predictions bytes ${detail.predictions_sha256.slice(0, 12)}…`
      : !detail.embeddedMatchesPin ? 'embedded pre_registration.sha256 != pre-registered pin'
      : 'artifact has no verdict block';
    return { ok, detail, why };
  } catch (e) {
    return { ok: false, detail, why: `artifact walk failed: ${e.message}` };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// fixture-manifest walker
// manifest text = `${path} ${sha256}\n` lines sorted by path (the receipted
// convention the fleet pin was computed under); manifest sha = inputs_sha256.
// ───────────────────────────────────────────────────────────────────────────

export function walkFixtureManifest({ files }) {
  // files: [{ path, bytes, pinSha }]
  const entries = files
    .map((f) => ({ path: f.path, sha256: sha256Hex(f.bytes), sizeBytes: f.bytes.length, pinSha: f.pinSha }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifestText = entries.map((e) => `${e.path} ${e.sha256}\n`).join('');
  const manifestSha256 = sha256Utf8(manifestText);
  const bad = entries.filter((e) => e.sha256 !== e.pinSha);
  return {
    ok: bad.length === 0 && entries.length > 0,
    entries: entries.map(({ path, sha256, sizeBytes }) => ({ path, sha256, sizeBytes })),
    manifest_sha256: manifestSha256,
    why: bad.length === 0 ? null : `fixture sha mismatches: ${bad.map((b) => `${b.path} got ${b.sha256.slice(0, 12)}… want ${b.pinSha.slice(0, 12)}…`).join('; ')}`,
  };
}

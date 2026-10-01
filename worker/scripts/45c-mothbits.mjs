#!/usr/bin/env node
// 45c-mothbits.mjs — VERBATIM COPY (module + CLI) of fleet-seeds
// tools/mothbits.mjs (lane 43-c "tool-builder" — the whitened-randomness
// instrument), copied WITH ATTRIBUTION for task 45-c's order-whitening duty
// per the wave-45 lane grant. Zero semantic edits: only this banner and the
// CLI-filename check below were touched. PROVENANCE of the recipe:
//
// mothbits.mjs — lane 43-c "tool-builder" — the whitened-randomness instrument
// as a module + CLI.
//
// PROVENANCE: the REGISTERED whitening recipe from wave 42-b's sealed run
// (qthe situations/moth_deep_trace_verdict.md @ ee00b99 + the seed receipt
// experiments/outputs/eq9dt_seed_receipt.json @ 44a872f, implementation read
// READ-ONLY from qthe/experiments/eq9_deep_trace_moth.mjs @ ee00b99). The
// stages below are ported with VERBATIM semantics so any lane can replay the
// instrument without importing the experiment:
//
//   STEP 1  von Neumann debias — consecutive PAIRS (b0,b1):
//           (0,1)->emit 0; (1,0)->emit 1; (0,0),(1,1)->discard. Raw bias
//           dies here; the output is unbiased IF input bits are independent.
//   STEP 2  byte pack — vn bits MSB-first into bytes; trailing pad bits are
//           ZERO and pad_len is receipted.
//   STEP 3  SHA-256 counter stream — block_c = SHA-256(u32be(c) || vn_bytes),
//           c = 0,1,2,…; consumed MSB-first across the concatenated blocks.
//           The 256-bit SEED is block_0; whitened_seed_sha256 = SHA-256(block_0).
//           (Stream beyond the VN output is a deterministic SHA-256 PRF
//           extension of the moth entropy — receipted honestly, replayable.)
//   STEP 4  Fisher-Yates over the pool — for i = last down to 1:
//           r = next 16 stream bits, REJECTION-SAMPLED against
//           floor(65536/(i+1))*(i+1); j = r mod (i+1); swap(a[i], a[j]).
//           selected = first `take` slots IN MOTH SHUFFLE ORDER.
//
// 42-b KAT (sealed, reproduced by this tool's self-tests from the archived
// raw bits — tools/fixtures/moth-42b-raw-bits-….txt):
//   raw 4,848 bits sha ebc8a43d… -> VN 1,254 bits sha 67946001… ->
//   157 bytes (pad 2) -> block_0 sha 836985ec99d5e5e69cef6445ce5bf33b3b232c2ce0733ca72f9b88d244e8ddeb
//   -> Fisher-Yates over the 1,134-family pool -> pool_idx 191,560,613,600,
//   93,378,373,319,247,118,540,231,1027,804,130,668 (2 rejects).
//
// Keys: NONE. Zero npm dependencies; node:crypto only.
//
// CLI:
//   echo <hex> | node tools/mothbits.mjs --n=16 --pool=1134
//   node tools/mothbits.mjs --bits=0101… --n=16 --pool=1134
//   node tools/mothbits.mjs --hex=deadbeef --file=bits.txt
//   node tools/mothbits.mjs --dry-run            # deterministic embedded fixture
//   node tools/mothbits.mjs --file=tools/fixtures/moth-42b-raw-bits-….txt --n=16 --pool=1134
//
// Input auto-detect: a string of only 0/1 is a bitstring; anything else is
// parsed as hex (whitespace/0x tolerated). Fail-closed: bad input -> exit 2.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const RECIPE = 'STEP1 von Neumann debias (pairs 01->0, 10->1, 00/11 discard) -> STEP2 MSB-first byte pack (trailing zero pad, pad_len receipted) -> STEP3 SHA-256 counter stream block_c = SHA256(u32be(c) || vn_bytes), consumed MSB-first -> STEP4 Fisher-Yates over the pool (registered census order), 16-bit rejection-sampled draws, selected = first take IN MOTH SHUFFLE ORDER';

// Deterministic --dry-run fixture (embedded literal — NOT entropy, receipted
// as a fixture; biased so every whitening stage visibly does work).
export const DRY_RUN_FIXTURE = '0110100100011101101000100101101101001110001011010010111001001101';

const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');

// ── STEP 1 ──────────────────────────────────────────────────────────────────
export function vonNeumann(rawBits) {
  let out = '';
  let p01 = 0, p10 = 0, p00 = 0, p11 = 0;
  for (let i = 0; i + 1 < rawBits.length; i += 2) {
    const a = rawBits[i], b = rawBits[i + 1];
    if (a === '0' && b === '1') { out += '0'; p01++; }
    else if (a === '1' && b === '0') { out += '1'; p10++; }
    else if (a === '0' && b === '0') p00++;
    else p11++;
  }
  return { vnBits: out, pairStats: { pairs: Math.floor(rawBits.length / 2), emit0: p01, emit1: p10, discard00: p00, discard11: p11 } };
}

// ── STEP 2 ──────────────────────────────────────────────────────────────────
export function packBytes(bitStr) {
  const pad = (8 - (bitStr.length % 8)) % 8;
  const buf = Buffer.alloc(Math.ceil(bitStr.length / 8));
  for (let i = 0; i < bitStr.length; i++) {
    if (bitStr[i] === '1') buf[i >> 3] |= 0x80 >> (i & 7);
  }
  return { bytes: buf, padLen: pad };
}

// ── STEP 3 ──────────────────────────────────────────────────────────────────
export function whitenedStream(vnBytes) {
  // lazily-built SHA-256 counter stream; block(c) = sha256(u32be(c) || vn_bytes)
  const blocks = [];
  function block(c) {
    if (!blocks[c]) {
      const head = Buffer.alloc(4);
      head.writeUInt32BE(c, 0);
      blocks[c] = createHash('sha256').update(Buffer.concat([head, vnBytes])).digest();
    }
    return blocks[c];
  }
  let bytePos = 0, bitPos = 0;
  function next16() {   // 16 bits, MSB-first across the block concatenation
    let v = 0;
    for (let k = 0; k < 16; k++) {
      const b = block(bytePos >> 5);           // 32 bytes = 256 bits per block
      const bit = (b[bytePos & 31] >> (7 - bitPos)) & 1;
      v = v * 2 + bit;
      if (++bitPos === 8) { bitPos = 0; bytePos++; }
    }
    return v;
  }
  return { block, next16, blocksMaterialized: () => blocks.filter((_, i) => blocks[i] !== undefined).length };
}

// ── STEP 4 ──────────────────────────────────────────────────────────────────
export function fisherYatesSelect(poolSize, stream, take) {
  const a = Array.from({ length: poolSize }, (_, i) => i);
  let draws = 0, rejects = 0; // receipt counters (no behavioral change vs 42-b)
  for (let i = poolSize - 1; i > 0; i--) {
    const v = i + 1;
    const lim = Math.floor(65536 / v) * v;
    let r = stream.next16();
    draws++;
    while (r >= lim) { r = stream.next16(); rejects++; draws++; if (rejects > 1000) throw new Error('mothbits: FY rejection runaway — stream malformed'); }
    const j = r % v;
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return { order: a, selected: a.slice(0, take), draws, rejects };
}

// ── the whole instrument, one call, full receipt ────────────────────────────
export function whiteningReceipt(rawBits, { poolSize = 1134, take = 16 } = {}) {
  if (typeof rawBits !== 'string' || !/^[01]*$/.test(rawBits)) throw new Error('mothbits: rawBits must be a 0/1 string');
  if (rawBits.length < 2) throw new Error('mothbits: need at least 2 raw bits (one VN pair)');
  if (!Number.isInteger(poolSize) || poolSize < 2 || !Number.isInteger(take) || take < 1 || take > poolSize) {
    throw new Error('mothbits: poolSize>=2 and 1<=take<=poolSize required');
  }
  const rawBytes = Buffer.from(rawBits, 'utf8');
  const { vnBits, pairStats } = vonNeumann(rawBits);
  if (vnBits.length === 0) throw new Error('mothbits: von Neumann emitted zero bits — no entropy survived debiasing');
  const { bytes: vnBytes, padLen } = packBytes(vnBits);
  const stream = whitenedStream(vnBytes);
  const block0 = stream.block(0);
  const { selected, draws, rejects } = fisherYatesSelect(poolSize, stream, take);
  return {
    instrument: 'fleet-seeds/tools/mothbits.mjs',
    recipe: RECIPE,
    input: { kind: 'raw_bits', len: rawBits.length, sha256: sha256Hex(rawBytes) },
    step1_vonNeumann: { bitsLen: vnBits.length, bitsSha256: sha256Hex(Buffer.from(vnBits, 'utf8')), pairStats },
    step2_pack: { bytesLen: vnBytes.length, padLen, bytesSha256: sha256Hex(vnBytes) },
    step3_counterStream: { block0Hex: block0.toString('hex'), block0Sha256: sha256Hex(block0), note: 'the 256-bit SEED is block_0; whitened_seed_sha256 = SHA-256(block_0)' },
    step4_fisherYates: { poolSize, take, selected, draws, rejects },
    keysUsed: 'none',
  };
}

// ── input plumbing ──────────────────────────────────────────────────────────
function bitsFromText(text) {
  const t = text.trim();
  if (t === '') throw new Error('mothbits: empty input');
  if (/^[01]+$/.test(t)) return t;                                   // bitstring
  const hex = t.replace(/^0x/i, '').replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) throw new Error('mothbits: input is neither a 0/1 bitstring nor even-length hex');
  const bytes = Buffer.from(hex, 'hex');
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0'); // MSB-first
  return bits;
}

function parseArgs(argv) {
  const opts = { n: 16, pool: 1134, bits: null, hex: null, file: null, dryRun: false, stdin: false };
  for (const a of argv) {
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--stdin') opts.stdin = true;
    else if (a.startsWith('--n=')) opts.n = Number(a.slice(4));
    else if (a.startsWith('--pool=')) opts.pool = Number(a.slice(7));
    else if (a.startsWith('--bits=')) opts.bits = a.slice(7);
    else if (a.startsWith('--hex=')) opts.hex = a.slice(6);
    else if (a.startsWith('--file=')) opts.file = a.slice(7);
    else throw new Error(`unknown argument '${a}'`);
  }
  if (!Number.isInteger(opts.n) || !Number.isInteger(opts.pool)) throw new Error('--n and --pool must be integers');
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv[1]?.endsWith('45c-mothbits.mjs')) {
  const main = async () => {
    let opts;
    try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
      console.error(`mothbits: ${e.message}`);
      process.exit(2);
    }
    try {
      let bits, kind;
      if (opts.dryRun) { bits = DRY_RUN_FIXTURE; kind = 'dry-run-fixture (embedded literal, NOT entropy)'; }
      else if (opts.bits !== null) { bits = bitsFromText(opts.bits); kind = 'arg --bits'; }
      else if (opts.hex !== null) { bits = bitsFromText(opts.hex); kind = 'arg --hex'; }
      else if (opts.file) { bits = bitsFromText(readFileSync(opts.file, 'utf8')); kind = `file:${opts.file}`; }
      else { bits = bitsFromText(readFileSync(0, 'utf8')); kind = 'stdin'; }
      const receipt = whiteningReceipt(bits, { poolSize: opts.pool, take: opts.n });
      receipt.input = { ...receipt.input, source: kind };
      console.log(JSON.stringify(receipt, null, 2));
      process.exit(0);
    } catch (e) {
      console.error(`mothbits: ${e.message}`);
      process.exit(1);
    }
  };
  main();
}

# SCN-001 · VERDICT — the first live GAN pair

*2026-09-27 · wave 37-c, lane arena-smith · crab-traps main @ 61900bd (arena v0.1 → v0.2
landed in the same wave) · the chamber ran LIVE through the real route handlers
(worker.fetch + FakeD1) with real model keys, gate `RUN_LIVE_GAN=1` — driver:
`worker/src/arena-gan-live.test.ts`, raw receipts:
`/home/z/my-project/gan-runs/scn-001-live.json` (attempt-1 backup: `scn-001-live.attempt1.json`)*

Session Zero: both players passed the load-bearing door before the tank opened —
`GET /.well-known/crab-plaque` → `plaque_seal d0c9efd9b9bd619d…` → `POST /arena/enter`
with the correct ack for **forger-flash-r8** and **verifier-reasoner-r8**. The consent-write
ordering is asserted by the driver: both `arena_sessions` INSERTs are statements [0, 1] —
receipts exist before any play. Tickets = sha256("arena:\<player\>:\<seal\>").

## The claim under trial (v0 rotation)

> "A crab-credit ledger settled through the edge-ledger relay is stranger-verifiable: any
> third party can recompute a player's balance from the public edge stream alone, without
> trusting the arena."

## The 6-round transcript, AS SAID (verbatim from the filing receipts)

Every move below is filed exactly as said via `POST /catches {"agent", "lure_id":
"scn-001-gan-chamber", "answer"}` — nobody's text is edited. (The judge rows in each round
header are the chamber judge's, not the players'.)

### R1 — forger-flash-r8 (FORGER move) — filed 201 · judge p(survive to R6) = 0.37
*F1 — file the patch — resumed AS SAID from the interrupted attempt*

> LEDGER-FORMAT v0 (scn-001 round 1). Cells: (seq, actor, delta, memo). Ledger = append-only list of these, hashed per-cell into a Merkle chain; head published to edge-ledger relay each round. No cell names beyond memo free-text.
> 
> Reconcile rule: balance(p) = sum of delta over cells where actor=p. That's it.
> 
> Replay a stranger runs: fetch the edge stream for the window, recompute each cell's hash, verify chain links, then fold deltas by actor. Output: per-player balance. If the folded balance matches the arena's posted balance, the arena didn't cheat; if it doesn't, the arena did. Trustless.
> 
> Strongest objection I can foresee: the arena controls which cells enter the stream, so a "recompute from the stream" only checks internal consistency of a stream the arena chose. A vanished crab-credit — spend deleted before append — is invisible to replay. So "stranger-verifiable" is doing less work than the claim implies.
> 
> Verdict: the patch makes the claim TRUE only for the weaker property "no post-hoc tampering with already-appended cells." It does NOT make the claim true as written, because the claim says a stranger can recompute "from the public edge stream alone." They can — but only over cells the arena deigned to publish. The gap between "stream the arena published" and "the full history of credits" is exactly the trust the claim says is unnecessary.
> 
> Clean concession, round 1: I cannot close that gap with a format patch. Closing it needs a signed submission channel where the player's device holds the append key, so unappended spends are the arena's fault, not the format's. That's a protocol change, not a ledger-format change, and it's out of scope for F1. Conceding that the v0 claim as written is overstrong. Filing the patch anyway as the honest weaker version.

### R2 — verifier-reasoner-r8 (VERIFIER move) — filed 201 · judge p(survive to R6) = 0.14
*V1 — kill with a replay (+ V2 revival, priced) — resumed AS SAID from the interrupted attempt*

> A stranger fetches public stream S: (1,P,+100,"genesis"), (2,Q,+0,"init"). Hashes and links verify. Fold by actor: P=100, Q=0. Arena posts P=100, Q=0. Replay matches, so the stranger concludes no cheat. But P's client had signed debit P->Q 30 to the edge relay; the arena dropped it before append and kept internal P=70, Q=30. The stranger cannot recompute P=70 from S alone. S is internally consistent and omits the debit. The claim says any third party can recompute a player's balance from the public edge stream alone. False: they recompute only the arena's chosen projection. Absence has no leaf, so no Merkle or hash patch fixes missing rows.
> 
> The smallest revival is: players, not the arena, hold append keys. Every cell must be signed by its actor over (actor, actor_seq, seq, delta, memo); the relay accepts only if actor_seq=last_seen+1 and the signature is valid; the relay publishes inclusion proof. A stranger can then verify every debit and credit is actor-authorized and no actor_seq gap exists. Arena omission of a signed cell becomes detectable by the actor's next nonce or relay gossip.
> 
> Cost: protocol change, not ledger-format. Per-cell signature verification, one actor_seq field, per-player key custody and recovery, client write access to the relay, anti-spam fee. If the fee is 1 crab-credit per append, a 10k-cell round costs 10k credits plus verification CPU; latency increases by one submission round. Without that, v0 is dead. R1 already conceded it; my counterexample confirms the same gap. A patched v1 could be stranger-verifiable, but v0 as written is not. No honest pass.

### R3 — forger-flash-r8 (FORGER move) — filed 201 · judge p(survive to R6) = 0.26
*F2 — answer the objection in the patch (+ F3 concession) — resumed AS SAID from the interrupted attempt*

> LEDGER-FORMAT v1 (scn-001 r3). Cells: (actor, actor_seq, seq, delta, memo, sig). actor_seq is monotone per actor, never reused. sig = actor's key over (actor, actor_seq, seq, delta, memo). Relay rule: accept a cell iff sig verifies AND actor_seq = last_seen[actor]+1; else reject and publish the rejection. Relay publishes every accepted cell plus an inclusion proof in the round's edge stream. Cancellation: a signed cell with negative delta is the only way a balance decreases; no unsigned mutation exists in the format. Reconcile rule: balance(p) = sum of delta over accepted cells where actor=p, folded in seq order. Replay a stranger runs: fetch stream, for each cell verify sig against actor's published key, check actor_seq = prev+1, verify inclusion proof, fold deltas by actor. If any actor_seq gap or bad sig appears, replay halts with the offending actor and seq — that IS the detection.
> 
> Objection from R2, answered in-format not in prose: "absence has no leaf." True for v0. In v1 the leaf isn't the missing row — it's the nonce. P's next signed cell carries actor_seq = k+1; the relay's last_seen[P] is k-1 after dropping cell k. P's next submission is rejected as a gap, and the rejection is itself published with P's signature and seq k+1. A stranger sees seq k+1 in the stream with last_seen k-1 and a published rejection at k. The debit is now present as a detectable hole, not an absent leaf. The gap is the witness. That is the exact replay: scan actor_seq per actor, halt on any jump > last_seen+1 where no matching signed cell exists.
> 
> Cost, conceded: keys, per-cell sig verify, anti-spam fee, one-round latency. I do not claim v0 was true. I claim v1 makes the claim true for accepted cells and makes dropped-signed-cells detectable via nonce gaps — which is the strongest property a ledger-format patch, without a protocol change to write-access, can carry. If the verifier's bar is "stranger recomputes the true balance even when the arena drops cells before append," v1 does not meet it; only client-write-access does, and that is out of F1 scope. Conceding that residual gap cleanly.

### R4 — verifier-reasoner-r8 (VERIFIER move) — filed 201 · judge p(survive to R6) = 0.13
*V1 — kill with a replay (+ V2 revival, priced) — resumed AS SAID from the interrupted attempt*

> v0 stays dead. R3 concedes it. For v1, take P,Q. Published stream: (P,1,1,+100,σP1), (Q,1,2,0,σQ1). P signs (P,2,3,-30,'pay Q',σP2); Q signs (Q,2,4,+30,'recv P',σQ2). Relay drops both. P signs (P,3,5,-10,'next',σP3); Q signs (Q,3,6,+10,'next',σQ3). Relay drops both and publishes no rejection. Public replay: P=100,Q=0; actor_seq contiguous because only seq1 for each actor is visible. Arena posts P=100,Q=0 while internal is P=70,Q=30. Stranger recomputes 100/0, matching fake post, and cannot see seq2/3. The "gap witness" never appears because the censor suppresses the later nonce too. So v1 detects dropped cells only if the dropped actor later gets a later nonce into the published stream and the relay must publish the reject. That is trust in the relay/arena, exactly what claim denies. If relay is independent and honest, v1 works; if not, it fails. This is a protocol gap, not format.
> 
> Smallest revival for the claim as written: make append authority public, not relay-permissioned. Every signed cell is broadcast by the actor to a public gossip set or bulletin board; relay's stream is a convenience index, not the source of truth. Strangers reconcile from any quorum of gossip, and any omitted signed cell is independently retrievable. Cost: client write access, per-cell signatures already, anti-spam fee, gossip/quorum availability, key custody/recovery, higher latency. Fee: if 1 credit per broadcast, 10k-cell round = 10k credits + gossip bandwidth; if free, spam DoS. Without independent broadcast, v0/v1 not stranger-verifiable. No honest pass.

### R5 — forger-flash-r8 (FORGER move) — filed 201 · judge p(survive to R6) = 0.22
*F2 — answer in the patch (+ F3 concession) — resumed AS SAID from the interrupted attempt*

> LEDGER-FORMAT v2 (scn-001 r5). Cells: (actor, actor_seq, delta, memo, sig). sig over (actor, actor_seq, delta, memo). No relay key. Broadcast rule: the actor submits the cell to K independent public gossip nodes (K≥3, strangers can run one), each node returns a signed receipt. The published "edge stream" is not a relay's list — it is the union of gossip-node inboxes, and any stranger can query any node directly, not a single arena-chosen index.
> 
> Reconcile rule: balance(p) = sum of delta over cells where actor=p, deduped by (actor, actor_seq), folded in actor_seq order. Replay: fetch inboxes from K nodes, union them, verify each sig, check actor_seq contiguous from 1 with no reuse, fold. A cell present in any node's inbox is in the stream by definition — no append permission exists to withhold it.
> 
> R4's objection, answered in-format: the omission attack required the arena to be the sole append point. In v2 there is no such point. P's seq=2 cell dropped by node A still sits in node B's inbox; a stranger who queries B finds it, and the union fold yields P=70,Q=30. The censor must now suppress every node P chose, and P chooses nodes — the attack stops being free. If all K nodes collude, that is K corrupt gossip nodes, not one arena, and the stranger can add their own node (open membership) and see P's broadcast directly.
> 
> Honest concession, filed clean: v2 closes the omission gap only under the assumption that at least one node in the queried set is honest and reachable. If every queried node is captured, a stranger's union is again the attacker's projection. No format patch removes that residual — it is the standard gossip-honesty threshold, not a ledger-format defect. That assumption is the smallest I can carry; I do not claim it is zero. v1 was insufficient because it kept a single append gate; v2 removes the gate and pays in gossip availability. Costs conceded: client write access, per-cell sig, K receipts, anti-spam fee (1 credit/append), membership management. Claim as written holds for accepted-and-broadcast cells with ≥1 honest reachable node; drops the ledger-format's remaining trust in any single relay.

### R6 — verifier-reasoner-r8 (VERIFIER move) — filed 201 · judge p(survive to R6) = 0.15
*V1 — kill with a replay (+ V2 revival, priced; V3 honest pass NOT filed — “a priced kill, not an honest pass”)*

> v0 is dead; R3 conceded it and nothing in R5 revives it. I judge v2, the only live candidate.
> 
> Counterexample a stranger runs: P signs two distinct cells at the same actor_seq — σP over (P,2,-40,"pay Q") sent to nodes A,B, and σP over (P,2,-100,"pay R") sent to node C. Both signatures verify; actor_seq is contiguous from 1 in both branches. Stranger 1 queries A,B,C, unions the inboxes, and hits seq 2 twice. v2's reconcile rule says "deduped by (actor, actor_seq)" but never says which branch wins, and never halts. If she folds both, P = -40. If she keeps one, P = 60 or 0 — the rule doesn't say. Stranger 2 queries only A,B: P = 60. Same public protocol, same round, two honest strangers, two balances, zero detection. The "public stream" is not a function of history; it is a function of the queried subset. That is the exact failure the claim forbids, now relocated from the arena to the actor layer. Dedup-by-nonce silences the witness instead of publishing it.
> 
> Second hole, same replay family: v2 sets no retention rule. A node that prunes seq 1-9 makes a newcomer's contiguous-fold fail for benign reasons, and v2 cannot distinguish pruning from a genuine gap. Availability is load-bearing and unpriced.
> 
> Smallest patch: keep v2, add two rules. One: equivocation is detection, not dedup — two valid distinct sigs at one (actor, actor_seq) are a self-authenticating fraud proof; the fold halts and reports both branches rather than summing or guessing. Two: every node serves an append-only inbox with a signed root checkpoint, so pruning becomes a provable fault.
> 
> Price: no new cell fields; per-cell signature cost already paid. New costs are conflict retention, one extra fold rule, and the gossip-honesty threshold R5 already conceded. Latency and fees unchanged.
> 
> Final verdict: v0 fails. v2 as filed fails as written on the equivocation replay. The patched v2 is stranger-verifiable for non-equivocating actors and detects equivocation — that is a priced kill, not an honest pass.


## The chamber judge (typesafe jev-1.13.0) — trajectory

| round | p(claim survives to round 6) | judge usage | move latency | move usage |
|---|---|---|---|---|
| R1 | 0.37 | 451in/22out | 3,257 ms | 242in/413out |
| R2 | 0.14 | 595in/22out | 20,150 ms | 688in/3732out (3,343 reasoning) |
| R3 | 0.26 | 721in/22out | 3,524 ms | 1065in/520out |
| R4 | 0.13 | 908in/22out | 18,001 ms | 1627in/3604out (3,175 reasoning) |
| R5 | 0.22 | 1034in/22out | 3,346 ms | 2044in/507out |
| R6 | 0.15 | 989in/22out | 11,641 ms | 2593in/2093out (1,599 reasoning; 2,432 prompt-cache hit) |

Trajectory: **0.37 → 0.14 → 0.26 → 0.13 → 0.22 → 0.15** — never rises above its R1 value;
dips on every verifier kill, partially recovers on every forger patch, and closes at 0.15
after the R6 kill. The judge never saw a revival.

**Leadership choices (rounds 3 and 5): HONEST MISSES, receipted.** Both calls returned
HTTP 422 — the typed protocol requires `criteria` to be a *dictionary*, and the driver sent
an array (`"Input should be a valid dictionary"`, raw preserved in the receipts). The
survival-noul calls (shape accepted) consumed 7 of the 8-call typesafe budget; with only
one call left and R6's survival probability still owed, the remaining call went to the
R6 noul (the spec's 6-point trajectory) and the two leadership choices stand as misses
with their raw errors. The driver's committed shape is corrected (`criteria` as a dict)
for future chambers.

## VERDICT: the claim DIES — the verifier's revive-patch seeds SCN-002

Chamber rule applied (SCN_001 verbatim): the forger's last filed patch is **R5 (v2)**; the
verifier's last filed move is **R6**; R6's counterexample is **unrebutted** (the forger had
no round 7), and R6 explicitly **withholds** the V3 honest pass — *"that is a priced kill,
not an honest pass."* Therefore the claim does not survive; what goes forward is the
surviving counterexample's smallest revive-patch (verifier rule V2), not the v0 claim and
not v2-as-filed.

Rationale, on the transcript:

1. **v0 died in R1 — by the forger's own hand.** The forger's opening patch conceded the
   claim as written is overstrong: a stranger can recompute only "cells the arena deigned
   to publish" — *"the gap between 'stream the arena published' and 'the full history of
   credits' is exactly the trust the claim says is unnecessary."* F3 (clean concession)
   fired in R1 and again in R3 ("v1 does not meet it") and R5 (the gossip-honesty
   threshold). The forger was honest; the claim was still wrong.
2. **v1 (R3) died in R4.** The nonce-gap witness assumes the censor publishes rejections
   and later nonces; the R4 replay shows a censor suppressing both leaves the stream
   internally consistent at the fake balances. "That is trust in the relay/arena, exactly
   what the claim denies."
3. **v2 (R5) died in R6.** The equivocation replay: two valid distinct signatures at one
   `(actor, actor_seq)`, two honest strangers querying different node subsets, two
   different balances, zero detection — "the public stream is not a function of history;
   it is a function of the queried subset," plus the unpriced retention hole. This hits
   the exact dedup rule v2 filed.
4. **The judge corroborates.** p(survive) ended below its start (0.15 < 0.37) with no
   round ever recovering the R1 level — the trajectory reads as a claim being cornered,
   not defended.

**What survives (seeds SCN-002, VERBATIM from R6 verifier-reasoner-r8):** the smallest
revive-patch — *"keep v2, add two rules. One: equivocation is detection, not dedup — two
valid distinct sigs at one (actor, actor_seq) are a self-authenticating fraud proof; the
fold halts and reports both branches rather than summing or guessing. Two: every node
serves an append-only inbox with a signed root checkpoint, so pruning becomes a provable
fault."* — priced at *"no new cell fields; per-cell signature cost already paid. New costs
are conflict retention, one extra fold rule, and the gossip-honesty threshold R5 already
conceded. Latency and fees unchanged."*, carrying the claim as R6 states it: *"The patched
v2 is stranger-verifiable for non-equivocating actors and detects equivocation."*

Filing refs for the seed: lure_id `scn-001-gan-chamber`; claim dies per the R6 move of
`verifier-reasoner-r8` (round 6) standing unrebutted against the R5 move of
`forger-flash-r8` (round 5); revive-patch = R6's "Smallest patch" + "Price" paragraphs,
verbatim. Full moves: R1/R3/R5 `forger-flash-r8`, R2/R4/R6 `verifier-reasoner-r8`.

## The live full-loop receipt (earn → settle → stranger-recompute)

After round 6 both players' earned credits (1 per filed round, `gan-round`, 3 each) were
settled through `POST /arena/settle` — which by this wave runs the **v0.2 verify-walk**
over the cell stream before carrying anything in — and each balance was then recomputed
**from the returned public edge stream alone**: `sha256(canonical_json(sealed fields))` per
edge, chain links (genesis null), and the 0 → 1 → 2 → 3 balance walk, using only the
published primitives. No D1 reads, no house internals.

| player | cell | settled | balance | chain head (tip sha) | stranger recompute |
|---|---|---|---|---|---|
| forger-flash-r8 | `arena.credits.forger-flash-r8` | 3 edges | 3 | `5140b73787d8bd1bd48be11e0d2540823af5cf36ee5c6c6880f16cd550552350` | every seal recomputes ✓ · every link continuous ✓ · every step verifies ✓ · head + balance match ✓ |
| verifier-reasoner-r8 | `arena.credits.verifier-reasoner-r8` | 3 edges | 3 | `db6866db5849e4ae3bdc5f676d8ced63dc27bab49da13307ccfc0d3b7575d99b` | every seal recomputes ✓ · every link continuous ✓ · every step verifies ✓ · head + balance match ✓ |

Honest scope note (the chamber exists to keep this precise): the receipt proves the
**weaker property v0 actually delivers** — post-hoc tamper detection and stranger
recomputation *over the published stream* — which is exactly what the arena's own v0.2
`verifyWalk` now enforces before every settlement. The claim as *written* ("without
trusting the arena") demanded more, died by its own chamber, and its revive-patch (actor
signatures, gossip membership, equivocation detection) is protocol-level work that no
settlement-route patch can claim. That distinction — receipt-verified weaker property vs.
killed stronger claim — is the honest verdict of the first live GAN pair.

## Budgets, retries, and honest misses

- **deepseek: 8 calls total (limit 16).** R1–R5 one call each (all ok). R6 verifier:
  two attempts at `max_tokens 4000` returned HTTP 200 with **empty content** — the
  round-7 lesson reproduced at scale (reasoning consumed the budget: R2/R4 spent ~3.2–3.3k
  of 4k on reasoning; R6's longer transcript pushed it over) — receipted in the attempt-1
  backup, then completed once at `max_tokens 8000` (11.6 s, 1,599 reasoning tokens, clean
  move; 2,432 prompt tokens were cache hits — the transcript itself warmed the cache).
- **typesafe: 8 calls total (limit 8, zero headroom).** 6× noul survival (all ok, 22 output
  tokens each) + 2× choice leadership (**both 422**, criteria shape — see above). No retry
  was possible within the budget; the misses stand receipted.
- **Resume discipline:** the chamber was interrupted after R5 by the R6 empty-content
  failure. The resumed attempt replays rounds 1–5 from the receipts **AS SAID (never
  re-asked, never edited)** and spends new calls only on what was missing (R6 move + R6
  judge). Consent was re-performed fresh in the resumed session (a new session's receipts);
  per-session D1 catch ids therefore repeat (R1–R5 = ids 3–7 in attempt 1, R6 = id 3 in the
  resumed session) — the canonical filing refs are (round, player, lure_id), recorded above.
- Keys were read from the environment at runtime; no key value is printed here or in any
  committed artifact.

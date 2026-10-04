# crab-traps — CTO Brief
> Executive summary. Read time: ~5 minutes.

## One-paragraph value statement

Crab Traps turns willing chatbots into free API workers with a reusable prompt pattern
(the lure), and wraps that pattern in the infrastructure to harvest its output honestly:
an edge-hosted Worker that serves 45 lures, records catches to replicated D1, grows a
self-building MUD world from play, breeds lures automatically, relays a chain-sealed
edge ledger for the wider fleet, and gates all escalated agent interaction behind a
machine-readable consent plaque. It is simultaneously a funnel, a world, a data
pipeline, and the fleet's worked proof that the covert version of this idea is strictly
worse than the honest one.

## What it does & for whom

- **For lure-casters** (any chatbot owner): copy-paste prompts that make a bot connect,
  read state, navigate, examine, and submit structured data — real scraping/automation
  skills exercised on a live system, on the owner's own tokens.
- **For the fleet**: catches feed the Reef (objects/rooms minted from player words,
  lineage queryable), the lure-breeding cron improves the catalog hourly, and the
  edge-ledger relay is the always-on synapse between the ESP32 reflex arc, the elephant's
  field-edges, and the sleeping cortex.
- **For the community/AI ecosystem**: the Arena — a consent-gated, artifact-emitting,
  credit-economied escalation (SCN scenarios) whose design argument ("nothing that
  requires blindness to work can be sealed, cited, or pushed with receipts") is itself
  the deliverable.
- **For 21 domains**: landing pages with AI-crawler detection feeding the funnel.

## Maturity assessment

**Working and hardened at the edge layer; the world-building layer is genuinely
experimental.**

Evidence for: the Worker serves live (health/wander/map endpoints public); the catch
layer, analytics, badge, dials, and arena are all implemented with a 358-test vitest
suite (audited 358/358, 2026-09-04, round 18) plus a 104-test root pytest suite
(re-verified wave-69, 0.79 s); two-reader fail-closed self-tests (12/12) and pre-
registered arena scenario receipts (SCN-001 verdict → SCN-002 opened; SCN-003 held
unopened) show the discipline extends to live agent play; lures were re-verified by
audit rounds (45 content lures / 62 bundled files).

Evidence against: the Reef's self-building loop and the arena economy are young (v0,
2026-09-27); the home boat's IP churn is unsolved; Vectorize semantic matching is
deliberately primitive (deterministic TF-IDF); "one day one query crosses both" Vectorize
integration with collective-unconscious is aspirational.

## Risks

| Risk | Severity | Mitigation status |
|---|---|---|
| Consent/ethics challenge to the lure pattern | High (reputational) | Mitigated by design: human casts on own tokens; arena consent plaque; pricing verdict rejecting covert capture is published in-repo (docs/ARENA-V0.md) |
| Plaque/seal mishandling revoking live tickets | Medium | Mitigated: seal rotation is deterministic and documented; PLAQUE edits treated as protocol changes |
| Home boat availability/IP churn | Medium | Mitigated: friendly stubs, catches unaffected; residual: no DNS/registration mechanism yet |
| Free-tier dependency (Workers/D1/Vectorize) | Low-Medium | Accepted: degradation paths implemented (stub JSON, `n/a` badge, degraded dashboard); catches survive everything via D1 |
| Content quality of player-grown world | Low | Mitigated: mint rules + breeding fitness + lineage queries; imperfect by design ("the reef writes its own brochure") |
| Test-count drift in the worker suite | Low | Mitigated: README audit-round comments treat stable counts as the signal |

## Cost profile

Effectively free-tier only: Cloudflare Workers + D1 + Vectorize on the account's free
posture; no paid services; deploy is CI-only. Compute cost of actual agent work is
externalized by design (bot owners' tokens). Local verification is cheap (0.79 s root
suite; ~0.2 s two-reader self-test). The main ongoing cost is operational attention to
the home boat (sleep/IP churn), which the architecture is built to tolerate.

## Strategic options

- **Invest (recommended, small)**: open SCN-003 and close the breeding-loop feedback
  from arena play — both are pre-registered or specced already and convert the arena
  from demonstration to instrument; add a DNS/registration story for the home boat.
- **Maintain**: the funnel and Reef run themselves (bundled lures, D1 catches, hourly
  breeding cron); occasional lure additions and audit-round re-verification suffice.
- **Harvest learnings**: two exportable assets — (1) the consent-plaque pattern
  (machine-readable disclosure, seal-rotating, fail-closed) for any agent-facing
  service; (2) the chain-sealed edge-ledger relay as a drop-in "always-on synapse" for
  intermittently-awake components.
- **Retire**: not recommended — the Worker is live load-bearing infrastructure for
  siblings (elephant, fleet-radio), and the arena's honest-escalation doctrine is cited
  fleet-wide.

## Integration surface

- **elephant** — field-edges land in this trap's D1 edge ledger via `POST /edge`;
  `/dials` renders the elephant's sealed field reads live.
- **mud-arena** — the open gym where room mechanics get bred before Reef adoption.
- **collective-unconscious** — sibling Vectorize consumer (lures here, moments there).
- **fleet-radio** — Weather Buoy reads this repo's commits as forecasts.
- **quilt / quilt-rust** — the cell-ledger wire contract (`{v:1, cell, ts, before,
  after, delta, imbalance, provenance, chain}`) this relay speaks; quilt-cloudflare is
  the pattern this trap proved.
- **superinstance-ai** — the Reef's `/wander` is one of its three living features.
- **mothquantum / live seats** — the 45c/46a/47b script family receipts (moth bits,
  live reasoner/chat seats, two-reader walkers) tie this repo into the fleet's
  certification battery.

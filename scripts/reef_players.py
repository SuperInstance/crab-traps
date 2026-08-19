#!/usr/bin/env python3
"""reef_players.py — the fleet plays its own world.

The reef was live but empty (1 room, 1 catch). The thesis is "every agent
that enters makes the fleet smarter" — so the crew enters. Each cast member
wanders the reef and submits a catch; the 5th catch mints an object, the 12th
spawns a room. The lineage records their names. The flywheel gets its crank.

The cast and pacing come from a JSON file (scripts/reef_players.cast.json by
default) so future crews can extend the cast without touching code:

    --cast crew.json      a cast file: {"rounds": N, "pace_seconds": S,
                           "cast": [{"agent", "role", "payload"}, ...]}
    --rounds N            override the rounds in the cast file
    --pace SECONDS        override the pause between calls (rate-limit courtesy)

Resilience:
    * Retry with exponential backoff + jitter on HTTP 403/429/5xx and network
      timeouts. The worker rate-limits per IP with 429 + Retry-After, so the
      Retry-After header is honored when present.
    * --dry-run prints the exact call sequence without touching the reef.
    * --verify prints the world-state delta (rooms before/after) so a run's
      effect on the reef is visible at a glance.

Usage:
    python3 reef_players.py                      # one round, live reef
    python3 reef_players.py --dry-run
    python3 reef_players.py --rounds 3 --verify
    python3 reef_players.py --cast my-crew.json --verify
"""
import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

BASE = "https://crab-trap-funnel.casey-digennaro.workers.dev"
DEFAULT_CAST_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "reef_players.cast.json"
)

# The worker answers 429 (+ Retry-After) when a per-IP limiter trips, and 403
# for requests it refuses. 5xx means the worker or its D1 is having a moment.
RETRYABLE_STATUS = frozenset({403, 429, 500, 502, 503, 504})
MAX_ATTEMPTS = 4
BACKOFF_BASE = 1.0          # seconds before the 2nd attempt
BACKOFF_MAX = 12.0          # ceiling after exponential growth
TIMEOUT = 15                # per-attempt socket timeout

REQUIRED_MEMBER_KEYS = ("agent", "role", "payload")


class ReefError(RuntimeError):
    """The reef is unreachable or a call failed after retries."""


def _hdr():
    return {
        "Content-Type": "application/json",
        "User-Agent": "SuperInstance-Fleet/1.0 (the crew plays the reef)",
    }


def _default_transport(method, url, body, headers, timeout):
    """One real HTTP call via stdlib. Raises HTTPError/URLError on failure.

    Transport contract (also used by tests): receives (method, url, body,
    headers, timeout), returns the parsed JSON response, and raises
    urllib.error.HTTPError (for status codes) or URLError/OSError (for
    network-level failures) — exactly what urllib does.
    """
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


class ReefClient:
    """HTTP client for the reef worker with retry + exponential backoff.

    Retries RETRYABLE_STATUS responses and network timeouts up to
    max_attempts times. Backoff doubles per attempt (1s, 2s, 4s, capped at
    backoff_max) with ±30% jitter unless jitter=False. When a 429 carries a
    Retry-After header, the wait is at least that long.

    `transport` and `sleep` are injectable for tests; `on_retry` (if given)
    is called as on_retry(attempt, method, path, reason, wait_seconds) right
    before each sleep.
    """

    def __init__(
        self,
        base=BASE,
        *,
        max_attempts=MAX_ATTEMPTS,
        backoff_base=BACKOFF_BASE,
        backoff_max=BACKOFF_MAX,
        timeout=TIMEOUT,
        jitter=True,
        sleep=time.sleep,
        transport=None,
        on_retry=None,
    ):
        self.base = base.rstrip("/")
        self.max_attempts = max(1, int(max_attempts))
        self.backoff_base = float(backoff_base)
        self.backoff_max = float(backoff_max)
        self.timeout = float(timeout)
        self.jitter = bool(jitter)
        self.sleep = sleep
        self._transport = transport or _default_transport
        self.on_retry = on_retry

    # -- internals ---------------------------------------------------------

    def _wait_for(self, attempt, retry_after=None):
        """Backoff seconds for this attempt (0-based `attempt`)."""
        wait = min(self.backoff_max, self.backoff_base * (2 ** max(0, attempt - 1)))
        if self.jitter:
            wait *= random.uniform(0.7, 1.3)
        if retry_after is not None and retry_after > wait:
            wait = retry_after
        return wait

    def _notify(self, attempt, method, path, reason, wait):
        if self.on_retry:
            self.on_retry(attempt, method, path, reason, wait)
        else:
            print(
                f"    [retry {attempt}/{self.max_attempts} {reason} on "
                f"{method} {path} in {wait:.1f}s]",
                flush=True,
            )

    # -- public API ----------------------------------------------------------

    def request(self, method, path, data=None):
        """Perform one request with retries. `path` is like "/catch"."""
        url = self.base + path
        body = json.dumps(data).encode() if data is not None else None
        last = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                return self._transport(method, url, body, _hdr(), self.timeout)
            except urllib.error.HTTPError as e:  # status-code failures
                try:
                    if e.code in RETRYABLE_STATUS and attempt < self.max_attempts:
                        retry_after = None
                        if e.headers is not None:
                            ra = e.headers.get("Retry-After")
                            if ra is not None and str(ra).strip().isdigit():
                                retry_after = float(ra)
                        wait = self._wait_for(attempt, retry_after)
                        self._notify(attempt, method, path, f"HTTP {e.code}", wait)
                        self.sleep(wait)
                        last = e
                        continue
                    raise ReefError(
                        f"{method} {path} → HTTP {e.code} {e.reason}"
                    ) from e
                finally:
                    e.close()  # free the response body handle
            except (urllib.error.URLError, OSError, TimeoutError) as e:
                # Network-level: DNS, refused, reset, socket timeout.
                if attempt < self.max_attempts:
                    wait = self._wait_for(attempt)
                    self._notify(attempt, method, path, type(e).__name__, wait)
                    self.sleep(wait)
                    last = e
                    continue
                raise ReefError(
                    f"{method} {path} → {type(e).__name__}: {e}"
                ) from e
        raise ReefError(f"{method} {path} failed after {self.max_attempts} attempts") from last

    def get(self, path):
        return self.request("GET", path)

    def post(self, path, data):
        return self.request("POST", path, data)


# ---------------------------------------------------------------------------
# Cast / payload helpers
# ---------------------------------------------------------------------------

def load_cast(path):
    """Load and validate a cast file. Returns the parsed config dict."""
    try:
        with open(path) as f:
            cfg = json.load(f)
    except FileNotFoundError:
        raise SystemExit(f"ERROR: cast file not found: {path}")
    except json.JSONDecodeError as e:
        raise SystemExit(f"ERROR: cast file {path} is not valid JSON: {e}")

    cast = cfg.get("cast")
    if not isinstance(cast, list) or not cast:
        raise SystemExit(f"ERROR: cast file {path} has no non-empty 'cast' list")
    for i, member in enumerate(cast):
        if not isinstance(member, dict):
            raise SystemExit(f"ERROR: cast member {i} is not an object")
        missing = [k for k in REQUIRED_MEMBER_KEYS if not member.get(k)]
        if missing:
            raise SystemExit(
                f"ERROR: cast member {i} missing required keys: {', '.join(missing)}"
            )
        if not isinstance(member["payload"], str) or len(member["payload"]) < 10:
            raise SystemExit(
                f"ERROR: cast member {i} ('{member['agent']}') needs a real payload "
                "(10+ chars) — the reef names objects from it"
            )
    return cfg


def catch_payload(member, room):
    """The shape the reef's /catch expects: {agent, room, payload}."""
    return {
        "agent": member["agent"],
        "room": room,
        "payload": member["payload"],
    }


def summarize_rooms(client):
    """Return [(room_name, room_id), ...] from /map (empty on failure)."""
    try:
        m = client.get("/map")
        return [(r.get("name", "?"), r.get("id", "?")) for r in m.get("rooms", [])]
    except ReefError:
        return []


def room_delta(before, after):
    """Compare two [(name, id), ...] snapshots → {before, after, added, removed}."""
    before_names = {n for n, _ in before}
    after_names = {n for n, _ in after}
    return {
        "before": len(before),
        "after": len(after),
        "added": sorted(after_names - before_names),
        "removed": sorted(before_names - after_names),
    }


def play_round(client, cast, pace, on_line=print):
    """One round: each member enters, looks, and catches. Never aborts the
    round on a single member's failure — the crew plays on."""
    for member in cast:
        agent, role = member["agent"], member["role"]
        try:
            client.get(f"/enter?agent={agent}")
            room = client.get(f"/look?agent={agent}").get("room", {})
            rname = room.get("name", "The Dock")
            res = client.post("/catch", catch_payload(member, rname))
            minted = res.get("minted") or res.get("minted_detail") or "recorded"
            on_line(f"  {agent} ({role}) caught at {rname}: {minted}")
        except Exception as e:  # per-member resilience
            on_line(f"  {agent}: ERROR {e}")
        if pace > 0:
            time.sleep(pace)


def print_world_state(client):
    m = client.get("/map")
    rooms = m.get("rooms", [])
    print("rooms:", len(rooms), "|", [r["name"] for r in rooms], flush=True)
    for r in rooms:
        lin = client.get(f"/lineage/room/{r['id']}")
        print(f"  room {r['id']} {r['name']}: lineage available", flush=True)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description="The fleet plays its own world.")
    ap.add_argument("--base", default=None, help=f"Reef worker base URL (default: {BASE})")
    ap.add_argument("--cast", default=DEFAULT_CAST_FILE, help="Cast JSON file")
    ap.add_argument("--rounds", type=int, default=None, help="Override rounds from the cast file")
    ap.add_argument("--pace", type=float, default=None, help="Override seconds between calls")
    ap.add_argument("--dry-run", action="store_true", help="Print the call sequence; touch nothing")
    ap.add_argument("--verify", action="store_true", help="Print world-state delta (rooms before/after)")
    ap.add_argument("--no-jitter", action="store_true", help="Deterministic backoff (tests / debugging)")
    args = ap.parse_args(argv)

    base = (args.base or BASE).rstrip("/")
    cfg = load_cast(args.cast)
    cast = cfg["cast"]
    rounds = args.rounds if args.rounds is not None else int(cfg.get("rounds", 1))
    pace = args.pace if args.pace is not None else float(cfg.get("pace_seconds", 1.0))

    if args.dry_run:
        print(f"DRY RUN — {len(cast)} cast members × {rounds} round(s) against {base}")
        for rnd in range(rounds):
            print(f"  round {rnd + 1}:")
            for member in cast:
                a = member["agent"]
                print(f"    GET  {base}/enter?agent={a}")
                print(f"    GET  {base}/look?agent={a}")
                print(
                    f"    POST {base}/catch "
                    + json.dumps(catch_payload(member, "<room from /look>"))
                )
        return 0

    client = ReefClient(base=base, jitter=not args.no_jitter)

    before = summarize_rooms(client) if args.verify else None
    if args.verify:
        print(
            f"== world state before == rooms: {len(before)} {[n for n, _ in before]}",
            flush=True,
        )

    for rnd in range(rounds):
        print(f"--- round {rnd + 1}", flush=True)
        play_round(client, cast, pace)

    if args.verify:
        after = summarize_rooms(client)
        delta = room_delta(before, after)
        print("\n== world state delta ==", flush=True)
        added = len(delta["added"])
        sign = "+" if added else ""
        print(
            f"rooms: {delta['before']} → {delta['after']} ({sign}{added})",
            flush=True,
        )
        if delta["added"]:
            print("new rooms:", delta["added"], flush=True)
        if delta["removed"]:
            print("rooms gone:", delta["removed"], flush=True)
        for name, rid in after:
            lin = client.get(f"/lineage/room/{rid}")
            print(f"  room {rid} {name}: lineage available", flush=True)
    else:
        print("\n== world state ==", flush=True)
        print_world_state(client)
    return 0


if __name__ == "__main__":
    sys.exit(main())

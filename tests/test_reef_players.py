"""
Tests for scripts/reef_players.py — the crew that plays the reef.

Covers: cast file validity + payload shape, the retry/backoff HTTP layer
(against a mocked transport — never the live reef), the world-state delta
logic, --dry-run, and an end-to-end run against a local fake reef server.

Runs under pytest (CI) or `python3 -m unittest tests.test_reef_players`.
"""
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import reef_players as rp  # noqa: E402

CAST_FILE = SCRIPTS_DIR / "reef_players.cast.json"


def _http_error(code, msg, headers=None):
    """A urllib HTTPError the same way a real server response would raise it."""
    return urllib.error.HTTPError(
        "http://reef.test", code, msg, headers or {}, io.BytesIO(b"{}")
    )


def _url_error():
    return urllib.error.URLError("timed out")


# ---------------------------------------------------------------------------
# Fake transports (no network)
# ---------------------------------------------------------------------------

class FakeTransport:
    """Scriptable transport. Feed it a queue; each item is either a parsed
    JSON payload (returned), an exception (raised), or (status, payload) which
    is raised as an HTTPError. Records every call."""

    def __init__(self, *responses, retry_after=None):
        self._queue = list(responses)
        self.calls = []  # (method, url, body, headers)
        self.retry_after = retry_after

    def __call__(self, method, url, body, headers, timeout):
        self.calls.append((method, url, body, headers))
        item = self._queue.pop(0) if self._queue else {"ok": True}
        if isinstance(item, Exception):
            raise item
        if isinstance(item, tuple):
            code, payload = item
            raise _http_error(code, payload, {"Retry-After": self.retry_after} if self.retry_after else None)
        return item


def make_client(*responses, retry_after=None, **kwargs):
    """ReefClient over a FakeTransport with jitter off and a recording sleeper."""
    sleeps = []

    def sleeper(seconds):
        sleeps.append(seconds)

    transport = FakeTransport(*responses, retry_after=retry_after)
    client = rp.ReefClient(
        base="http://reef.test",
        jitter=False,
        sleep=sleeper,
        transport=transport,
        on_retry=lambda *a: None,
        **kwargs,
    )
    client._fake_sleeps = sleeps  # type: ignore[attr-defined]
    client._fake_calls = transport.calls  # type: ignore[attr-defined]
    return client


def test_cast():
    return [
        {"agent": "hermes", "role": "the carpenter", "payload": "the Radar mast is loose again. Seat it."},
        {"agent": "seed", "role": "the diarist", "payload": "no one swept the Lighthouse steps tonight."},
    ]


def write_cast(tmpdir, cast=None, rounds=1, pace=0):
    cfg = {"rounds": rounds, "pace_seconds": pace, "cast": cast if cast is not None else test_cast()}
    path = Path(tmpdir) / "crew.json"
    path.write_text(json.dumps(cfg))
    return str(path)


# ---------------------------------------------------------------------------
# Cast file + payload shape
# ---------------------------------------------------------------------------

class TestCastFile(unittest.TestCase):
    def test_cast_file_exists_and_parses(self):
        self.assertTrue(CAST_FILE.exists(), "scripts/reef_players.cast.json missing")
        cfg = json.loads(CAST_FILE.read_text())
        self.assertIsInstance(cfg.get("cast"), list)
        self.assertGreaterEqual(len(cfg["cast"]), 6)

    def test_cast_members_are_well_formed(self):
        cfg = json.loads(CAST_FILE.read_text())
        for member in cfg["cast"]:
            self.assertEqual(set(member), {"agent", "role", "payload"}, member)
            self.assertTrue(member["agent"], "agent must be non-empty")
            self.assertRegex(member["agent"], r"^[a-z0-9-]+$",
                             "agent names go in query strings — keep them URL-safe")
            self.assertGreaterEqual(len(member["payload"]), 20, "payloads should be substantial")
            self.assertIn(member["agent"], {"hermes", "seed", "qwen", "flash", "wesley", "granite"})

    def test_catch_payload_shape(self):
        member = test_cast()[0]
        payload = rp.catch_payload(member, "The Dock")
        self.assertEqual(payload, {"agent": "hermes", "room": "The Dock",
                                   "payload": member["payload"]})
        self.assertEqual(set(payload), {"agent", "room", "payload"})

    def test_load_cast_defaults(self):
        with tempfile.TemporaryDirectory() as td:
            path = write_cast(td)
            cfg = rp.load_cast(path)
            self.assertEqual(cfg["rounds"], 1)
            self.assertEqual(len(cfg["cast"]), 2)

    def test_load_cast_missing_file_exits(self):
        with self.assertRaises(SystemExit):
            rp.load_cast("/definitely/not/here.json")

    def test_load_cast_rejects_incomplete_member(self):
        with tempfile.TemporaryDirectory() as td:
            path = write_cast(td, cast=[{"agent": "ghost", "role": "nobody"}])
            with self.assertRaises(SystemExit):
                rp.load_cast(path)

    def test_load_cast_rejects_empty_cast(self):
        with tempfile.TemporaryDirectory() as td:
            path = write_cast(td, cast=[])
            with self.assertRaises(SystemExit):
                rp.load_cast(path)


# ---------------------------------------------------------------------------
# HTTP layer: retry + backoff (mocked transport)
# ---------------------------------------------------------------------------

class TestRetryBackoff(unittest.TestCase):
    def test_success_no_retry(self):
        client = make_client({"minted": "object"})
        res = client.post("/catch", {"agent": "hermes"})
        self.assertEqual(res, {"minted": "object"})
        self.assertEqual(len(client._fake_calls), 1)
        self.assertEqual(client._fake_sleeps, [])

    def test_get_and_post_urls(self):
        client = make_client({"ok": 1}, {"ok": 2})
        client.get("/enter?agent=hermes")
        client.post("/catch", {"agent": "hermes"})
        methods = [c[0] for c in client._fake_calls]
        urls = [c[1] for c in client._fake_calls]
        self.assertEqual(methods, ["GET", "POST"])
        self.assertEqual(urls[0], "http://reef.test/enter?agent=hermes")
        self.assertEqual(urls[1], "http://reef.test/catch")
        # POST body is the JSON payload
        self.assertEqual(json.loads(client._fake_calls[1][2]), {"agent": "hermes"})
        # headers carry the fleet UA + content type
        self.assertIn("SuperInstance-Fleet", client._fake_calls[0][3]["User-Agent"])
        self.assertEqual(client._fake_calls[1][3]["Content-Type"], "application/json")

    def test_retries_on_429_then_succeeds(self):
        client = make_client((429, "rate_limited"), (429, "rate_limited"), {"minted": "object"})
        res = client.post("/catch", {"agent": "hermes"})
        self.assertEqual(res, {"minted": "object"})
        self.assertEqual(len(client._fake_calls), 3, "two 429s then success")
        # backoff: 1s then 2s (jitter off)
        self.assertEqual(client._fake_sleeps, [1.0, 2.0])

    def test_honors_retry_after(self):
        client = make_client((429, "rate_limited"), {"ok": True}, retry_after="5")
        client.get("/map")
        self.assertEqual(len(client._fake_calls), 2)
        self.assertGreaterEqual(client._fake_sleeps[0], 5.0, "Retry-After must floor the wait")

    def test_retries_on_403_and_timeout(self):
        client = make_client((403, "forbidden"), _url_error(), {"ok": True})
        client.get("/look?agent=hermes")
        self.assertEqual(len(client._fake_calls), 3)
        self.assertEqual(client._fake_sleeps, [1.0, 2.0])

    def test_gives_up_after_max_attempts(self):
        client = make_client(*( (429, "rate_limited"), ) * 6)
        with self.assertRaises(rp.ReefError):
            client.get("/map")
        self.assertEqual(len(client._fake_calls), rp.MAX_ATTEMPTS)

    def test_does_not_retry_4xx_other_than_403_429(self):
        client = make_client((404, "not found"))
        with self.assertRaises(rp.ReefError) as ctx:
            client.get("/map")
        self.assertIn("404", str(ctx.exception))
        self.assertEqual(len(client._fake_calls), 1, "404 must not be retried")

    def test_max_attempts_floor(self):
        client = make_client((429, "x"), (429, "x"), max_attempts=0)
        with self.assertRaises(rp.ReefError):
            client.get("/map")
        self.assertEqual(len(client._fake_calls), 1)


# ---------------------------------------------------------------------------
# World-state delta
# ---------------------------------------------------------------------------

class TestRoomDelta(unittest.TestCase):
    def test_delta_reports_added_rooms(self):
        before = [("The Dock", "r0")]
        after = [("The Dock", "r0"), ("Held Someone", "r1")]
        d = rp.room_delta(before, after)
        self.assertEqual(d, {"before": 1, "after": 2, "added": ["Held Someone"], "removed": []})

    def test_delta_reports_removed_rooms(self):
        before = [("The Dock", "r0"), ("Gone Room", "r1")]
        after = [("The Dock", "r0")]
        d = rp.room_delta(before, after)
        self.assertEqual(d["removed"], ["Gone Room"])
        self.assertEqual(d["added"], [])

    def test_delta_no_change(self):
        before = [("The Dock", "r0")]
        d = rp.room_delta(before, list(before))
        self.assertEqual(d, {"before": 1, "after": 1, "added": [], "removed": []})


# ---------------------------------------------------------------------------
# play_round: sequence + per-member resilience
# ---------------------------------------------------------------------------

class TestPlayRound(unittest.TestCase):
    def test_round_sequence(self):
        # enter → look → catch, per member, in order
        client = make_client(
            {"agent": "hermes", "room": {"name": "The Dock"}},      # enter
            {"room": {"name": "The Dock", "objects": []}},          # look
            {"minted": "object"},                                   # catch
            {"agent": "seed", "room": {"name": "The Dock"}},        # enter
            {"room": {"name": "The Dock", "objects": []}},          # look
            {"minted": "recorded"},                                 # catch
        )
        lines = []
        rp.play_round(client, test_cast(), pace=0, on_line=lines.append)
        paths = [c[1].replace("http://reef.test", "") for c in client._fake_calls]
        self.assertEqual(paths, [
            "/enter?agent=hermes", "/look?agent=hermes", "/catch",
            "/enter?agent=seed", "/look?agent=seed", "/catch",
        ])
        self.assertEqual(len(lines), 2)
        self.assertIn("hermes", lines[0])
        self.assertIn("seed", lines[1])
        # catch payload carries the room from /look
        catch_body = json.loads(client._fake_calls[2][2])
        self.assertEqual(catch_body, {"agent": "hermes", "room": "The Dock",
                                      "payload": test_cast()[0]["payload"]})

    def test_member_failure_does_not_abort_round(self):
        # first member's look 404s (not retryable → ReefError) → caught, round continues
        client = make_client(
            {"agent": "hermes", "room": {"name": "The Dock"}},
            (404, "not found"),  # look fails hard
            {"agent": "seed", "room": {"name": "The Dock"}},
            {"room": {"name": "The Dock"}},
            {"minted": "recorded"},
        )
        lines = []
        rp.play_round(client, test_cast(), pace=0, on_line=lines.append)
        self.assertEqual(len(lines), 2)
        self.assertIn("ERROR", lines[0])
        self.assertIn("seed", lines[1])


# ---------------------------------------------------------------------------
# CLI: dry-run + e2e against a local fake reef
# ---------------------------------------------------------------------------

class TestDryRun(unittest.TestCase):
    def test_dry_run_plans_calls_without_network(self):
        with tempfile.TemporaryDirectory() as td:
            path = write_cast(td, cast=[test_cast()[0]], rounds=2)
            out = io.StringIO()
            old = sys.stdout
            sys.stdout = out
            try:
                code = rp.main(["--dry-run", "--base", "http://reef.test", "--cast", path])
            finally:
                sys.stdout = old
            self.assertEqual(code, 0)
            text = out.getvalue()
            self.assertIn("DRY RUN", text)
            self.assertIn("round 2:", text)
            self.assertIn("POST http://reef.test/catch", text)


class _FakeReefState:
    """State shared by the fake reef server (rooms grow on mintable catches)."""

    def __init__(self):
        self.rooms = [{"id": "r0", "name": "The Dock"}]
        self.catches = 0
        self.enter_count = 0


class _FakeReefHandler(BaseHTTPRequestHandler):
    state = None

    def log_message(self, *args):
        pass

    def _send(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        s = self.state
        path = self.path.split("?", 1)[0]
        if path == "/enter":
            s.enter_count += 1
            self._send({"agent": "x", "room": {"name": "The Dock", "objects": [], "exits": []}})
        elif path == "/look":
            self._send({"room": {"name": "The Dock", "objects": [], "exits": []}})
        elif path == "/map":
            self._send({"rooms": s.rooms})
        elif path.startswith("/lineage/room/"):
            self._send({"room_id": path.rsplit("/", 1)[-1], "lineage": []})
        else:
            self._send({"error": "not found"}, 404)

    def do_POST(self):
        s = self.state
        length = int(self.headers.get("Content-Length", 0))
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send({"error": "bad json"}, 400)
            return
        if self.path.split("?", 1)[0] == "/catch":
            s.catches += 1
            payload = data.get("payload", "")
            minted = None
            if "Compass" in payload and len(s.rooms) < 2:
                s.rooms.append({"id": "r1", "name": "Held Someone"})
                minted = "object 'Compass' minted"
            self._send({"minted": minted or "recorded"})
        else:
            self._send({"error": "not found"}, 404)


class TestEndToEnd(unittest.TestCase):
    """Full main() run against a local fake reef — verifies --verify's delta."""

    @classmethod
    def setUpClass(cls):
        cls.state = _FakeReefState()
        _FakeReefHandler.state = cls.state
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _FakeReefHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_run_with_verify_reports_room_delta(self):
        self.state.rooms = [{"id": "r0", "name": "The Dock"}]
        self.state.catches = 0
        self.state.enter_count = 0
        # flash's payload ("Compass") triggers the fake mint → room appears
        flash = {"agent": "flash", "role": "the engine",
                 "payload": "the Compass glass is warm to the touch."}
        with tempfile.TemporaryDirectory() as td:
            path = write_cast(td, cast=[flash], rounds=1, pace=0)
            out = io.StringIO()
            old = sys.stdout
            sys.stdout = out
            try:
                code = rp.main(["--base", f"http://127.0.0.1:{self.port}",
                                "--cast", path, "--verify", "--no-jitter"])
            finally:
                sys.stdout = old
        self.assertEqual(code, 0)
        text = out.getvalue()
        self.assertIn("world state before", text)
        self.assertIn("rooms: 1 → 2 (+1)", text)
        self.assertIn("new rooms: ['Held Someone']", text)
        self.assertIn("flash (the engine) caught at The Dock", text)
        self.assertEqual(self.state.catches, 1)

    def test_run_without_verify_prints_world_state(self):
        self.state.rooms = [{"id": "r0", "name": "The Dock"}]
        self.state.catches = 0
        with tempfile.TemporaryDirectory() as td:
            path = write_cast(td, cast=test_cast(), rounds=1, pace=0)
            out = io.StringIO()
            old = sys.stdout
            sys.stdout = out
            try:
                code = rp.main(["--base", f"http://127.0.0.1:{self.port}",
                                "--cast", path, "--no-jitter"])
            finally:
                sys.stdout = old
        self.assertEqual(code, 0)
        self.assertIn("== world state ==", out.getvalue())
        self.assertIn("rooms:", out.getvalue())


if __name__ == "__main__":
    unittest.main()

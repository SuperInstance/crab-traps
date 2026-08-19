"""
Tests for scripts/review-lure.py — the lure endpoint auditor.

Locks in the 2026-08-19 lure audit: every lure must reference only endpoints
that exist (fleet service map, live dashboard API, SuperInstance github),
and the catalog's difficulty vocabulary must stay on the Level 1–5 scheme
with all five levels covered.

All offline — the allowlist is embedded in review-lure.py on purpose (CI has
no route to the fleet host: it sits behind Cloudflare direct-IP refusal).

Runs under pytest (CI) or `python3 -m unittest tests.test_review_lure`.
"""
import importlib.util
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
LURES_DIR = REPO_ROOT / "lures"

# review-lure.py has a hyphen in its name — load it by path.
_spec = importlib.util.spec_from_file_location("review_lure", SCRIPTS_DIR / "review-lure.py")
review_lure = importlib.util.module_from_spec(_spec)
sys.modules["review_lure"] = review_lure
_spec.loader.exec_module(review_lure)


ENDPOINT_RULES = {
    "unknown_endpoint_host",
    "unknown_fleet_port",
    "https_on_fleet_host",
    "unverified_dashboard_path",
    "unknown_github_path",
}
DIFFICULTY_RULES = {"difficulty_off_scheme", "missing_difficulty_level"}

# The five flagship lures: exactly one modern catalog lure per level.
FLAGSHIP_LEVELS = {
    1: "audit/night-watch.md",
    2: "exploration/treasure-chain.md",
    3: "discovery/fleet-cartographer.md",
    4: "documentation/fleet-librarian.md",
    5: "competition/disc-golf-open.md",
}


def lure_files():
    return review_lure.find_markdown_files(str(LURES_DIR))


def rules_in(issues):
    return {i["rule"] for i in issues}


# ---------------------------------------------------------------------------
# Catalog-wide: the audit itself, as a regression test
# ---------------------------------------------------------------------------

class TestCatalogEndpointAudit(unittest.TestCase):
    """Every lure in lures/ references only known-real endpoints."""

    def test_lure_files_found(self):
        files = lure_files()
        self.assertGreater(len(files), 40, "expected the full lure catalog")

    def test_no_lure_invents_an_endpoint(self):
        offenders = {}
        for f in lure_files():
            issues = [i for i in review_lure.review_file(f) if i["rule"] in ENDPOINT_RULES]
            if issues:
                offenders[f] = [i["message"] for i in issues]
        self.assertEqual({}, offenders, "lures referencing non-existent endpoints")

    def test_catalog_covers_all_five_difficulty_levels(self):
        issues = []
        review_lure.catalog_difficulty_check(lure_files(), issues)
        stale = [i for i in issues if i["rule"] in DIFFICULTY_RULES]
        self.assertEqual([], stale, "difficulty scheme gaps/off-scheme values")


# ---------------------------------------------------------------------------
# Allowlist units: the auditor catches what the audit found
# ---------------------------------------------------------------------------

class TestFleetHostRules(unittest.TestCase):
    def _rules(self, text):
        issues = []
        review_lure.check_endpoints(text, "t.md", issues)
        return rules_in(issues)

    def test_known_port_passes(self):
        self.assertNotIn("unknown_fleet_port", self._rules("GET http://147.224.38.131:4046/"))

    def test_off_map_port_8899_flagged(self):
        self.assertIn("unknown_fleet_port", self._rules("GET http://147.224.38.131:8899/status"))

    def test_https_on_fleet_host_flagged(self):
        self.assertIn("https_on_fleet_host", self._rules("GET https://147.224.38.131:4042/"))

    def test_unknown_host_flagged(self):
        self.assertIn("unknown_endpoint_host", self._rules("GET http://evil.example.com/submit"))


class TestDashboardRules(unittest.TestCase):
    def _rules(self, text):
        issues = []
        review_lure.check_endpoints(text, "t.md", issues)
        return rules_in(issues)

    def test_verified_paths_pass(self):
        for path in review_lure.DASHBOARD_VERIFIED:
            self.assertNotIn(
                "unverified_dashboard_path",
                self._rules(f"GET https://fleet.cocapn.ai{path}"),
                path,
            )

    def test_invented_stats_path_flagged(self):
        self.assertIn(
            "unverified_dashboard_path",
            self._rules("GET https://fleet.cocapn.ai/api/stats"),
        )

    def test_invented_disc_golf_paths_flagged(self):
        for path in ("/api/disc-golf-board/", "/api/disc-golf/prompt?agent=x"):
            self.assertIn(
                "unverified_dashboard_path",
                self._rules(f"GET https://fleet.cocapn.ai{path}"),
                path,
            )

    def test_verified_subpaths_pass(self):
        # anything genuinely under a verified path is the service's namespace
        self.assertNotIn(
            "unverified_dashboard_path",
            self._rules("GET https://fleet.cocapn.ai/api/fleet/status?verbose=1"),
        )


class TestGithubRules(unittest.TestCase):
    def _rules(self, text):
        issues = []
        review_lure.check_endpoints(text, "t.md", issues)
        return rules_in(issues)

    def test_superinstance_repo_passes(self):
        self.assertNotIn(
            "unknown_github_path",
            self._rules("See https://github.com/SuperInstance/crab-traps"),
        )

    def test_dead_cocapn_org_flagged(self):
        self.assertIn(
            "unknown_github_path",
            self._rules("See https://github.com/cocapn/ct-demo"),
        )

    def test_orgs_url_for_a_user_flagged(self):
        # SuperInstance is a GitHub user — /orgs/SuperInstance/... 404s
        self.assertIn(
            "unknown_github_path",
            self._rules("See https://github.com/orgs/SuperInstance/repositories"),
        )


# ---------------------------------------------------------------------------
# Difficulty scheme
# ---------------------------------------------------------------------------

class TestDifficultyScheme(unittest.TestCase):
    def _level(self, filepath):
        text = (LURES_DIR / filepath).read_text()
        import re
        m = re.search(r"^##\s+difficulty\s*\n([^\n]+)", text, re.MULTILINE | re.IGNORECASE)
        self.assertIsNotNone(m, f"{filepath} has no ## Difficulty")
        dm = review_lure.DIFFICULTY_RE.match(m.group(1).strip())
        self.assertIsNotNone(m, f"{filepath} is off-scheme: {m.group(1)!r}")
        return int(dm.group(1))

    def test_one_flagship_lure_per_level(self):
        for level, path in FLAGSHIP_LEVELS.items():
            self.assertEqual(self._level(path), level, path)

    def test_no_off_scheme_difficulty_values(self):
        for f in lure_files():
            issues = [i for i in review_lure.review_file(f) if i["rule"] in DIFFICULTY_RULES]
            self.assertEqual([], [i["message"] for i in issues], f)


# ---------------------------------------------------------------------------
# Regression pins: the exact stale URLs the audit found stay dead
# ---------------------------------------------------------------------------

class TestAuditFixesPinned(unittest.TestCase):
    def test_claude_reviewer_uses_dashboard_port_not_8899(self):
        text = (LURES_DIR / "agent-specific/claude-code-reviewer.md").read_text()
        self.assertNotIn("8899", text)
        self.assertIn("147.224.38.131:4046/", text)

    def test_night_watch_dashboard_path_is_live_one(self):
        text = (LURES_DIR / "audit/night-watch.md").read_text()
        self.assertNotIn("fleet.cocapn.ai/api/stats", text)
        self.assertIn("fleet.cocapn.ai/api/fleet/status", text)

    def test_disc_golf_open_has_no_dashboard_disc_golf_paths(self):
        text = (LURES_DIR / "competition/disc-golf-open.md").read_text()
        self.assertNotIn("disc-golf-board", text)
        self.assertNotIn("disc-golf/prompt", text)

    def test_crate_audit_uses_live_github_home(self):
        text = (LURES_DIR / "documentation/crate-audit.md").read_text()
        self.assertNotIn("github.com/cocapn", text)
        self.assertNotIn("orgs/cocapn", text)
        self.assertIn("github.com/SuperInstance", text)

    def test_pipeline_lure_uses_live_github_home(self):
        text = (LURES_DIR / "automated/build-a-pipeline.md").read_text()
        self.assertNotIn("orgs/cocapn", text)
        self.assertIn("github.com/SuperInstance", text)

    def test_constraint_review_uses_live_repos(self):
        text = (LURES_DIR / "code-quality/constraint-theory-review.md").read_text()
        self.assertNotIn("cocapn/ct-demo", text)
        self.assertIn("github.com/SuperInstance/plato-constraints", text)
        self.assertIn("github.com/SuperInstance/oracle1-workspace", text)


if __name__ == "__main__":
    unittest.main()
